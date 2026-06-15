import puppeteer from 'puppeteer-core';

async function launchBrowser({ executablePath, headless = true, args = [] } = {}) {
  const options = { headless, args };
  if (executablePath) options.executablePath = executablePath;
  const browser = await puppeteer.launch(options);
  return browser;
}

export async function browse(url, opts = {}) {
  const { executablePath, headless = true, args = [], timeout = 30000 } = opts;
  const browser = await launchBrowser({ executablePath, headless, args });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout });
  return { browser, page };
}

export async function click(page, selector, opts = {}) {
  const timeout = opts.timeout ?? 5000;
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

export async function browseAndClick(url, selector, opts = {}) {
  const { browser, page } = await browse(url, opts);
  try {
    await click(page, selector, opts);
    return { browser, page };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

export async function closeBrowser(browser) {
  if (browser) await browser.close();
}

export default {
  launchBrowser,
  browse,
  click,
  browseAndClick,
  closeBrowser,
};
