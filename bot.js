import fs from "fs";
import path from "path";
import axios from "axios";
import puppeteer from "puppeteer-core";
import { create, all } from "mathjs";
import "dotenv/config";
import { fileURLToPath } from "url";
import { queryAiModels, getModelConfig } from "./aiClient.js";
import historicalScraper from "./historicalScraper.js";
import goalAnalysis from "./goalAnalysis.js";

const math = create(all, {});
const TARGET_URL = process.env.BOT_TARGET_URL || "https://msport.com";
const HISTORICAL_TARGET_URLS = process.env.HISTORICAL_TARGET_URLS || "https://msport.com,https://www.sportybet.com,https://www.bet9ja.com,https://www.betpawa.com";
const DATA_DIR = process.env.BOT_DATA_DIR || "bot-data";
const DATA_FILE = path.join(DATA_DIR, "bot-results.json");
const HISTORICAL_JSON_FILE = path.join(DATA_DIR, "historical-goals.json");
const HISTORICAL_CSV_FILE = path.join(DATA_DIR, "historical-goals.csv");
const CSV_FILE = path.join(DATA_DIR, "bot-output.csv");
const WEBHOOK_URLS = {
  n8n: process.env.N8N_WEBHOOK_URL,
  zapier: process.env.ZAPIER_WEBHOOK_URL,
  make: process.env.MAKE_WEBHOOK_URL
};

const SELECTORS = {
  matchRows: "table tr",
  teamCell: "td:nth-child(1)",
  scoreCell: "td:nth-child(2)",
  oddsCell: "td:nth-child(3)",
  trendCell: "td:nth-child(4)"
};

const ACTIONS_ENV = process.env.BOT_ACTIONS || "";
const ACTIONS_FILE = process.env.BOT_ACTIONS_FILE || "";
const RULES_ENV = process.env.BOT_RULES || "";
const RULES_FILE = process.env.BOT_RULES_FILE || "";
const INSTRUCTIONS_ENV = process.env.BOT_INSTRUCTIONS || "";
const INSTRUCTIONS_FILE = process.env.BOT_INSTRUCTIONS_FILE || "";
const DEFAULT_CLICK_TIMEOUT = 30000;

function parseJsonConfig(raw, sourceLabel) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse ${sourceLabel} JSON: ${error.message}`);
    return null;
  }
}

function loadConfigFromFile(filePath, sourceLabel) {
  if (!filePath) {
    return null;
  }

  try {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    return fs.readFileSync(resolvedPath, "utf8");
  } catch (error) {
    console.warn(`Failed to load ${sourceLabel} file at ${filePath}: ${error.message}`);
    return null;
  }
}

function parseActionConfig() {
  let raw = ACTIONS_ENV;
  const cliArg = process.argv.find((arg) => arg.startsWith("--actions="));

  if (!raw && cliArg) {
    raw = cliArg.split("=", 2)[1];
  }

  if (!raw && ACTIONS_FILE) {
    raw = loadConfigFromFile(ACTIONS_FILE, "BOT_ACTIONS_FILE");
  }

  if (!raw) {
    return [];
  }

  return parseJsonConfig(raw, "BOT_ACTIONS") || [];
}

function parseRulesConfig() {
  let raw = RULES_ENV;

  if (!raw && RULES_FILE) {
    raw = loadConfigFromFile(RULES_FILE, "BOT_RULES_FILE");
  }

  const parsed = parseJsonConfig(raw, "BOT_RULES") || {};

  return {
    avoidCaptcha: true,
    humanLike: true,
    minActionDelay: 800,
    maxActionDelay: 1800,
    avoidRepeatedClickInterval: 3000,
    followInstructions: true,
    ...parsed
  };
}

function parseInstructionsConfig() {
  let raw = INSTRUCTIONS_ENV;

  if (!raw && INSTRUCTIONS_FILE) {
    raw = loadConfigFromFile(INSTRUCTIONS_FILE, "BOT_INSTRUCTIONS_FILE");
  }

  if (!raw) {
    return null;
  }

  const parsed = parseJsonConfig(raw, "BOT_INSTRUCTIONS");
  return parsed === null ? raw : parsed;
}

function parseTextInstructionCommand(command) {
  const normalized = command.trim();
  const lower = normalized.toLowerCase();

  const navigateMatch = lower.match(/navigate(?: to)?\s+(https?:\/\/\S+)/);
  if (navigateMatch) {
    return [{ type: "navigate", url: navigateMatch[1] }];
  }

  const clickMatch = lower.match(/click\s+(?:the\s+)?(.+)/);
  if (clickMatch) {
    const selector = clickMatch[1].trim();
    if (selector.startsWith("#") || selector.startsWith(".") || selector.includes("[")) {
      return [{ type: "click", selector }];
    }
  }

  const typeMatch = lower.match(/type\s+["'](.+)["']\s+into\s+(?:selector\s+)?(.+)/);
  if (typeMatch) {
    return [{ type: "type", selector: typeMatch[2].trim(), value: typeMatch[1] }];
  }

  const waitMatch = lower.match(/wait\s+for\s+(?:selector\s+)?(.+)/);
  if (waitMatch) {
    return [{ type: "waitForSelector", selector: waitMatch[1].trim() }];
  }

  return [];
}

function normalizeInstructionsToActions(instructions) {
  if (!instructions) {
    return [];
  }

  if (Array.isArray(instructions)) {
    const actions = [];
    for (const item of instructions) {
      if (item && typeof item === "object" && (item.type || item.action || item.selector || item.url)) {
        actions.push(item);
      } else if (typeof item === "string") {
        actions.push(...parseTextInstructionCommand(item));
      }
    }
    return actions;
  }

  if (typeof instructions === "string") {
    return parseTextInstructionCommand(instructions);
  }

  if (typeof instructions === "object") {
    if (Array.isArray(instructions.actions)) {
      return normalizeInstructionsToActions(instructions.actions);
    }
    if (Array.isArray(instructions.commands)) {
      return normalizeInstructionsToActions(instructions.commands);
    }
    if (typeof instructions.command === "string") {
      return normalizeInstructionsToActions(instructions.command);
    }
  }

  return [];
}

function isNavigationAction(action) {
  const type = (action.type || action.action || "").toLowerCase();
  return type === "navigate" || type === "goto" || type === "url";
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function detectCaptcha(page) {
  try {
    const result = await page.evaluate(() => {
      const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        '#hcaptcha',
        '.h-captcha',
        '.g-recaptcha',
        '#recaptcha',
        '.cf-captcha-container',
        'div[class*="captcha"]',
        'input[name="captcha"]',
        'div[id*="captcha"]'
      ];
      const foundSelectors = captchaSelectors.filter((selector) => document.querySelector(selector));
      const bodyText = document.body.innerText.toLowerCase();
      const foundText = /are you human|please verify|verify you are human|i'm not a robot|captcha/.test(bodyText);
      return {
        found: foundSelectors.length > 0 || foundText,
        matches: foundSelectors,
        bodySnippet: bodyText.slice(0, 300)
      };
    });

    if (result.found) {
      console.warn(`Captcha detected on page. Matches: ${result.matches.join(", ")}`);
    }

    return result.found;
  } catch (error) {
    console.warn("Captcha detection failed:", error.message);
    return false;
  }
}

async function humanClick(page, selector, options = {}) {
  await page.waitForSelector(selector, { visible: true, timeout: options.timeout || DEFAULT_CLICK_TIMEOUT });
  await page.$eval(selector, (element) => {
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  });
  const element = await page.$(selector);
  const box = await element.boundingBox();

  if (!box) {
    throw new Error(`Could not determine bounding box for selector ${selector}`);
  }

  const offsetX = getRandomInt(Math.max(1, Math.floor(box.width * 0.15)), Math.max(1, Math.floor(box.width * 0.75)));
  const offsetY = getRandomInt(Math.max(1, Math.floor(box.height * 0.15)), Math.max(1, Math.floor(box.height * 0.75)));
  const targetX = box.x + offsetX;
  const targetY = box.y + offsetY;

  await page.mouse.move(targetX, targetY, { steps: getRandomInt(12, 22) });
  await page.waitForTimeout(getRandomInt(120, 420));
  await page.mouse.click(targetX, targetY, { button: options.button || "left", delay: options.delay || getRandomInt(80, 200) });

  if (options.waitForNavigation) {
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: options.navigationTimeout || options.timeout || DEFAULT_CLICK_TIMEOUT });
  }
}

async function inspectElementAction(page, action) {
  const selector = action.selector || "html";
  await page.waitForSelector(selector, { visible: true, timeout: action.timeout || DEFAULT_CLICK_TIMEOUT });
  const inspection = await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) {
      return null;
    }
    const computed = window.getComputedStyle(element);
    const selectedStyles = [
      "display",
      "position",
      "visibility",
      "opacity",
      "z-index",
      "cursor",
      "color",
      "background-color",
      "font-size",
      "width",
      "height",
      "margin",
      "padding",
      "border"
    ].reduce((acc, property) => {
      acc[property] = computed.getPropertyValue(property);
      return acc;
    }, {});

    const scripts = Array.from(document.scripts).slice(0, 20).map((script) => ({
      src: script.src || null,
      type: script.type || null,
      async: script.async,
      defer: script.defer,
      inlineLength: script.src ? 0 : (script.textContent || "").length
    }));

    return {
      selector: targetSelector,
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      outerHTML: element.outerHTML.slice(0, 1200),
      textSnippet: element.innerText?.slice(0, 500) || "",
      boundingRect: element.getBoundingClientRect().toJSON(),
      selectedStyles,
      pageTitle: document.title,
      pageUrl: document.location.href,
      scriptSummary: scripts
    };
  }, selector);

  const inspectionPath = path.join(DATA_DIR, action.path || `inspect-${Date.now()}.json`);
  fs.writeFileSync(inspectionPath, JSON.stringify(inspection, null, 2), "utf8");
  console.log(`Saved inspection data to ${inspectionPath}`);
  return inspection;
}

async function applyActionGuidelines(page, action, rules, history) {
  if (rules.avoidCaptcha) {
    const captchaFound = await detectCaptcha(page);
    if (captchaFound) {
      throw new Error("Captcha or bot-detection flow detected. Aborting to avoid website blocking.");
    }
  }

  if (rules.humanLike) {
    const waitMs = action.preActionDelay || getRandomInt(rules.minActionDelay, rules.maxActionDelay);
    if (waitMs > 0) {
      console.log(`Waiting ${waitMs}ms before action to behave like a person.`);
      await page.waitForTimeout(waitMs);
    }
  }

  if (rules.avoidRepeatedClickInterval && action.selector && ["click", "humanclick"].includes((action.type || action.action || "").toLowerCase())) {
    const key = action.selector;
    const lastClickAt = history.clickedSelectors[key] || 0;
    const elapsed = Date.now() - lastClickAt;

    if (lastClickAt && elapsed < rules.avoidRepeatedClickInterval) {
      console.warn(`Skipping repeated click on '${key}' after ${elapsed}ms to reduce detection risk.`);
      return false;
    }

    history.clickedSelectors[key] = Date.now();
  }

  return true;
}

async function performBrowserActions(page, actions, rules) {
  const history = { clickedSelectors: {} };

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const type = (action.type || action.action || "").toLowerCase();
    const timeout = action.timeout || DEFAULT_CLICK_TIMEOUT;
    const label = action.selector || action.url || action.action || type;

    console.log(`Browser action ${index + 1}/${actions.length}: ${type} ${label}`);

    const allowed = await applyActionGuidelines(page, action, rules, history);
    if (!allowed) {
      continue;
    }

    switch (type) {
      case "navigate":
      case "goto":
      case "url":
        await page.goto(action.url, { waitUntil: "networkidle2", timeout });
        break;
      case "click":
        if (rules.humanLike || action.human) {
          await humanClick(page, action.selector, {
            waitForNavigation: action.waitForNavigation,
            navigationTimeout: action.navigationTimeout,
            timeout,
            button: action.button,
            delay: action.delay
          });
        } else {
          await clickSelector(page, action.selector, {
            waitForNavigation: action.waitForNavigation,
            navigationTimeout: action.navigationTimeout,
            timeout,
            button: action.button,
            delay: action.delay
          });
        }
        break;
      case "humanClick":
        await humanClick(page, action.selector, {
          waitForNavigation: action.waitForNavigation,
          navigationTimeout: action.navigationTimeout,
          timeout,
          button: action.button,
          delay: action.delay
        });
        break;
      case "type":
        await page.waitForSelector(action.selector, { visible: true, timeout });
        await page.type(action.selector, action.value || "", { delay: action.delay || getRandomInt(60, 160) });
        break;
      case "hover":
        await page.waitForSelector(action.selector, { visible: true, timeout });
        await page.hover(action.selector);
        break;
      case "select":
        await page.waitForSelector(action.selector, { visible: true, timeout });
        await page.select(action.selector, ...(action.values || []));
        break;
      case "inspect":
      case "inspectelement":
      case "inspectpage":
        await inspectElementAction(page, action);
        break;
      case "waitforselector":
      case "waitForSelector":
        await page.waitForSelector(action.selector, { visible: action.visible !== false, timeout });
        break;
      case "waitfortimeout":
      case "waitForTimeout":
        await page.waitForTimeout(action.ms || action.timeout || 1000);
        break;
      case "screenshot": {
        const screenshotPath = path.join(DATA_DIR, action.path || `action-${index + 1}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: action.fullPage !== false });
        console.log(`Saved action screenshot: ${screenshotPath}`);
        break;
      }
      case "evaluate": {
        if (!action.script && !action.expression) {
          throw new Error("evaluate action requires a script or expression field");
        }
        const script = action.script || action.expression;
        const result = await page.evaluate(new Function(script));
        console.log("Evaluate result:", result);
        break;
      }
      default:
        console.warn(`Unknown browser action type: ${type}. Skipping.`);
    }
  }
}

async function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1366, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

async function navigateToSite(page) {
  console.log(`Navigating to ${TARGET_URL} ...`);
  await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function scrapeMatchRecords(page) {
  console.log("Scraping match records from msport.com...");
  await page.waitForSelector(SELECTORS.matchRows, { timeout: 20000 });

  const records = await page.$$eval(SELECTORS.matchRows, (rows, selectors) =>
    rows.slice(1).map((row) => {
      const team = row.querySelector(selectors.teamCell)?.textContent?.trim() || "";
      const score = row.querySelector(selectors.scoreCell)?.textContent?.trim() || "";
      const odds = row.querySelector(selectors.oddsCell)?.textContent?.trim() || "";
      const trend = row.querySelector(selectors.trendCell)?.textContent?.trim() || "";
      return { team, score, odds, trend, scrapedAt: new Date().toISOString() };
    }),
    SELECTORS
  );

  console.log(`Scraped ${records.length} records.`);
  return records;
}

function parseHistoricalTargetUrls() {
  const raw = HISTORICAL_TARGET_URLS || "";
  return Array.from(new Set(raw.split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean)));
}

async function scrapeHistoricalGoalsForUrls(page, urls) {
  const allRecords = [];

  for (const targetUrl of urls) {
    try {
      console.log(`Collecting historical goals from ${targetUrl}`);
      const records = await historicalScraper.scrapeHistoricalGoals(page, targetUrl);
      console.log(`Collected ${records.length} historical records from ${targetUrl}`);
      allRecords.push(...records);
      await page.waitForTimeout(1200);
    } catch (error) {
      console.error(`Historical scrape failed for ${targetUrl}:`, error.message);
    }
  }

  return allRecords;
}

function saveHistoricalGoalsCsv(filePath, records) {
  const header = [
    "site",
    "url",
    "team",
    "score",
    "odds",
    "trend",
    "date",
    "season",
    "homeGoals",
    "awayGoals",
    "totalGoals",
    "scrapedAt"
  ];

  const lines = [header.join(",")];

  for (const record of records) {
    const row = [
      record.site,
      record.url,
      record.team,
      record.score,
      record.odds,
      record.trend,
      record.date,
      record.season,
      record.homeGoals,
      record.awayGoals,
      record.totalGoals,
      record.scrapedAt
    ].map((value) => `"${String(value || "").replace(/"/g, '""')}"`);
    lines.push(row.join(","));
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  console.log(`Saved historical goals CSV output to ${filePath}`);
}

async function fetchExternalOdds() {
  const apiUrl = process.env.EXTERNAL_ODDS_API_URL;
  if (!apiUrl) {
    console.warn("No external odds API configured. Skipping API pull.");
    return [];
  }

  try {
    const response = await axios.get(apiUrl, { timeout: 20000 });
    console.log("Fetched external odds API data.");
    return response.data;
  } catch (error) {
    console.error("Failed to fetch external odds API:", error.message);
    return [];
  }
}

function normalizeRecords(records) {
  return records.map((record) => ({
    team: record.team,
    score: record.score.replace(/\s+/g, " ").trim(),
    odds: record.odds.replace(/[^0-9.\-]/g, "") || "0",
    trend: record.trend,
    scrapedAt: record.scrapedAt
  }));
}

function computeProbabilityMetrics(records) {
  console.log("Computing probability metrics and hidden trends...");
  const odds = records.map((record) => Number(record.odds) || 0).filter((value) => !Number.isNaN(value));
  const mean = odds.length ? math.mean(odds) : 0;
  const variance = odds.length ? math.variance(odds) : 0;
  const stdDev = odds.length ? math.std(odds) : 0;
  const distribution = {};

  for (const value of odds) {
    const bucket = Math.round(value * 10) / 10;
    distribution[bucket] = (distribution[bucket] || 0) + 1;
  }

  return {
    count: odds.length,
    mean,
    variance,
    stdDev,
    distribution,
    hiddenScoreTrend: generateHiddenScoreTrend(records)
  };
}

function generateHiddenScoreTrend(records) {
  const pattern = records.slice(-10).map((rec) => rec.score).join(" | ");
  return `Recent 10 scores pattern: ${pattern}`;
}

function detectTrends(records) {
  console.log("Detecting trends from scraped data...");
  const teamCounts = {};
  const scoreCounts = {};
  const trendCounts = {};

  for (const record of records) {
    teamCounts[record.team] = (teamCounts[record.team] || 0) + 1;
    scoreCounts[record.score] = (scoreCounts[record.score] || 0) + 1;
    trendCounts[record.trend] = (trendCounts[record.trend] || 0) + 1;
  }

  return { teamCounts, scoreCounts, trendCounts };
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Saved JSON data to ${filePath}`);
}

function saveCsv(filePath, records) {
  const header = ["team", "score", "odds", "trend", "scrapedAt"];
  const lines = [header.join(",")];

  for (const record of records) {
    lines.push([
      record.team,
      record.score,
      record.odds,
      record.trend,
      record.scrapedAt
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  console.log(`Saved CSV output to ${filePath}`);
}

function saveHistoricalGoalsJson(filePath, records) {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf8");
  console.log(`Saved historical goals JSON output to ${filePath}`);
}

async function postToAutomationServices(payload) {
  for (const [name, url] of Object.entries(WEBHOOK_URLS)) {
    if (!url) continue;
    try {
      await axios.post(url, payload, { headers: { "Content-Type": "application/json" }, timeout: 20000 });
      console.log(`Posted payload to ${name} webhook.`);
    } catch (error) {
      console.error(`Failed to post to ${name}:`, error.message);
    }
  }
}

function buildAiPrompt(records, externalOdds, metrics, trends) {
  return `Analyze the following virtual football dataset and provide advanced prediction insights, hidden trends, probability analysis, and a recommendation for upcoming matches using historical score patterns and odds.

Records: ${JSON.stringify(records.slice(0, 25), null, 2)}

External Odds: ${JSON.stringify(externalOdds, null, 2)}

Metrics: ${JSON.stringify(metrics, null, 2)}

Trends: ${JSON.stringify(trends, null, 2)}

Generate a summary and probability-based prediction.`;
}

async function runAiPrediction(records, externalOdds, metrics, trends) {
  if (process.argv.includes("--dry-run")) {
    console.log("Dry run enabled: skipping AI calls.");
    return { warning: "AI prediction skipped in dry run." };
  }

  const prompt = buildAiPrompt(records, externalOdds, metrics, trends);
  const models = getModelConfig();
  const aiResults = await queryAiModels(models, prompt);

  return aiResults;
}

async function runBot() {
  await ensureDataDirectory();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(DEFAULT_CLICK_TIMEOUT);
  page.setDefaultNavigationTimeout(DEFAULT_CLICK_TIMEOUT);

  const rules = parseRulesConfig();
  const instructions = parseInstructionsConfig();
  const instructionActions = normalizeInstructionsToActions(instructions);
  const browserActions = parseActionConfig();
  const actionsToExecute = browserActions.length ? browserActions : instructionActions;

  try {
    const shouldNavigateToDefault = !actionsToExecute.some(isNavigationAction);
    if (shouldNavigateToDefault) {
      await navigateToSite(page);
    }

    if (actionsToExecute.length) {
      await performBrowserActions(page, actionsToExecute, rules);
    }

    const rawRecords = await scrapeMatchRecords(page);
    const records = normalizeRecords(rawRecords);
    const externalOdds = await fetchExternalOdds();
    const metrics = computeProbabilityMetrics(records);
    const trends = detectTrends(records);

    const historicalUrls = parseHistoricalTargetUrls();
    const historicalRaw = await scrapeHistoricalGoalsForUrls(page, historicalUrls);
    const historicalDataset = historicalRaw.map((record) => goalAnalysis.normalizeHistoricalRecord(record, record.site));
    const historicalStats = {
      dataset: historicalDataset,
      summary: goalAnalysis.detectSeasonalTrends(historicalDataset),
      patterns: goalAnalysis.detectPredictivePatterns(historicalDataset),
      manipulation: goalAnalysis.detectManipulation(historicalDataset)
    };
    const predictionResults = goalAnalysis.generatePseudoRandomPredictions(historicalDataset, { count: 5, seedSource: "goal-history" });

    const aiPrediction = await runAiPrediction(records, externalOdds, metrics, trends);
    const output = {
      source: TARGET_URL,
      scrapedAt: new Date().toISOString(),
      records,
      externalOdds,
      metrics,
      trends,
      historical: {
        urls: historicalUrls,
        rawRecords: historicalRaw,
        normalized: historicalDataset,
        stats: historicalStats,
        pseudoRandomPredictions: predictionResults
      },
      rules,
      instructions,
      actionSource: browserActions.length ? "BOT_ACTIONS" : instructionActions.length ? "BOT_INSTRUCTIONS" : "DEFAULT_NAVIGATION",
      aiPrediction
    };

    saveJson(DATA_FILE, output);
    saveHistoricalGoalsJson(HISTORICAL_JSON_FILE, historicalDataset);
    saveHistoricalGoalsCsv(HISTORICAL_CSV_FILE, historicalDataset);
    saveCsv(CSV_FILE, records);
    await postToAutomationServices(output);

    console.log("Automation pipeline complete.");
  } catch (error) {
    console.error("Bot error:", error);
  } finally {
    await browser.close();
  }
}

export {
  ensureDataDirectory,
  launchBrowser,
  navigateToSite,
  scrapeMatchRecords,
  fetchExternalOdds,
  normalizeRecords,
  computeProbabilityMetrics,
  detectTrends,
  buildAiPrompt,
  runAiPrediction,
  parseActionConfig,
  parseRulesConfig,
  parseInstructionsConfig,
  normalizeInstructionsToActions
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBot();
}
