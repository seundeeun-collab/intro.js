import { browse, click, closeBrowser } from './webClient.js';

async function main() {
  // Set CHROME_PATH env var if your system Chrome/Chromium isn't detected
  const executablePath = process.env.CHROME_PATH;

  const { browser, page } = await browse('https://example.com', { executablePath, headless: true });
  try {
    // click the first link on the page as a demo
    await click(page, 'a');
    await page.screenshot({ path: 'example-after-click.png', fullPage: false });
  } finally {
    await closeBrowser(browser);
  }
}

main().catch(err => {
  console.error('web-example failed:', err);
  process.exit(1);
});
