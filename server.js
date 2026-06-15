import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import eventBus from "./eventBus.js";
import { launchBrowser, parseRulesConfig, parseInstructionsConfig, normalizeInstructionsToActions } from "./bot.js";
import { Executor } from "./executor.js";
import { Trainer } from "./trainer.js";
import apiInspector from "./apiInspector.js";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const STATUS_FILE = path.join(__dirname, "bot-data", "bot-results.json");

app.use(express.static(path.join(__dirname)));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "ui", "index.html"));
});

app.get("/status", (req, res) => {
  if (!fs.existsSync(STATUS_FILE)) {
    return res.json({
      status: "idle",
      message: "No bot output file found yet.",
      lastUpdated: null,
      live: false
    });
  }

  try {
    const raw = fs.readFileSync(STATUS_FILE, "utf8");
    const data = JSON.parse(raw);
    return res.json({
      status: "running",
      message: "Latest bot results loaded.",
      lastUpdated: data.scrapedAt || new Date().toISOString(),
      live: true,
      summary: {
        recordCount: data.records?.length ?? 0,
        modelCount: Object.keys(data.aiPrediction || {}).length,
        meanOdds: data.metrics?.mean ?? null,
        hiddenTrend: data.metrics?.hiddenScoreTrend ?? null
      }
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to read bot status file.",
      error: error.message,
      live: false
    });
  }
});

// Server-Sent Events endpoint for streaming bot events
app.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // ignore
    }
  };

  const onDone = (d) => send("action:done", d);
  const onError = (d) => send("action:error", d);
  const onStart = (d) => send("action:start", d);
  const onComplete = (d) => send("actions:complete", d);

  eventBus.on("action:done", onDone);
  eventBus.on("action:error", onError);
  eventBus.on("action:start", onStart);
  eventBus.on("actions:complete", onComplete);

  req.on("close", () => {
    eventBus.off("action:done", onDone);
    eventBus.off("action:error", onError);
    eventBus.off("action:start", onStart);
    eventBus.off("actions:complete", onComplete);
  });
});

// Accept instructions via API and save to BOT_INSTRUCTIONS_FILE
app.post("/api/instructions", (req, res) => {
  const body = req.body;
  if (!body) return res.status(400).json({ error: "No JSON body provided" });

  const target = process.env.BOT_INSTRUCTIONS_FILE || path.join(__dirname, "bot-instructions.json");
  try {
    fs.writeFileSync(target, JSON.stringify(body, null, 2), "utf8");
    return res.json({ ok: true, savedTo: target });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

let runLock = false;

// Trigger execution of actions/instructions via Executor
app.post("/api/run", async (req, res) => {
  if (runLock) return res.status(429).json({ error: "Run already in progress" });
  runLock = true;

  const payload = req.body || {};
  const actions = payload.actions || (() => {
    const instrFile = process.env.BOT_INSTRUCTIONS_FILE || path.join(__dirname, "bot-instructions.json");
    if (fs.existsSync(instrFile)) {
      try { return JSON.parse(fs.readFileSync(instrFile, "utf8")); } catch (e) { return null; }
    }
    return null;
  })();

  const rules = (() => {
    if (process.env.BOT_RULES) {
      try { return JSON.parse(process.env.BOT_RULES); } catch (e) { return {}; }
    }
    const rf = process.env.BOT_RULES_FILE || path.join(__dirname, "sample-rules.json");
    if (fs.existsSync(rf)) {
      try { return JSON.parse(fs.readFileSync(rf, "utf8")); } catch (e) { return {}; }
    }
    return {};
  })();

  if (!actions || !actions.length) {
    runLock = false;
    return res.status(400).json({ error: "No actions provided or found in bot-instructions.json" });
  }

  const dataDir = path.join(__dirname, process.env.BOT_DATA_DIR || "bot-data");
  const executor = new Executor({ dataDir });
  const trainer = new Trainer();

  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: process.env.HEADLESS !== "false", defaultViewport: { width: 1366, height: 900 }, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    // Optionally navigate to target first if not present in actions
    const hasNav = actions.some((a) => (a.type || a.action || "").toLowerCase() === "navigate" || (a.type || a.action || "").toLowerCase() === "goto" || (a.type || a.action || "").toLowerCase() === "url");
    const targetUrl = process.env.BOT_TARGET_URL || "https://msport.com";
    if (!hasNav) await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Stream start event
    eventBus.emit("action:start", { msg: "Execution started", timestamp: new Date().toISOString() });

    await executor.executeActions(actions, page, { rules, apiInspector, trainer });

    eventBus.emit("actions:complete", { msg: "Execution completed", timestamp: new Date().toISOString(), trainer: trainer.metrics() });

    await browser.close();
    runLock = false;
    return res.json({ ok: true, ran: actions.length, metrics: trainer.metrics() });
  } catch (error) {
    try { if (browser) await browser.close(); } catch (e) {}
    runLock = false;
    eventBus.emit("action:error", { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
