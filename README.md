# Virtual Football Automation Bot

This project automates virtual football data collection, analysis, and workflow orchestration for `msport.com`.

## What it includes
- Puppeteer automation for web clicking and scraping
- Form filling and page navigation support
- Probability and statistical analysis with `mathjs`
- AI prediction integration scaffolding for Claude, OpenAI/GPT, Gemini, NVIDIA, Grok, and more
- Webhook outputs for n8n, Zapier, and Make
- Sample n8n workflow export and automation guidance

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` with your target site, webhook URLs, and AI endpoints.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the browser dashboard:
   ```bash
   npm start
   ```
5. Use the bot directly with:
   ```bash
   npm run bot
   ```
6. Use `--dry-run` to test scraping and pipeline behavior without AI calls:
   ```bash
   npm run dryrun
   ```

## Configuration
Open `.env` and fill values for:
- `BOT_TARGET_URL` (default `https://msport.com`)
- `BOT_ACTIONS_FILE` to load a JSON action flow from a local file
- `BOT_ACTIONS` to supply a JSON array of browser actions directly
- `EXTERNAL_ODDS_API_URL` for external odds data
- `N8N_WEBHOOK_URL`, `ZAPIER_WEBHOOK_URL`, `MAKE_WEBHOOK_URL`
- AI model URLs and API keys for your chosen providers

### Browser action examples
You can automate clicks, navigation, typing, and waits using `BOT_ACTIONS` or `BOT_ACTIONS_FILE`.

Example `.env` values:
```env
BOT_TARGET_URL=https://msport.com
BOT_ACTIONS_FILE=browser-actions.json
```

Example `browser-actions.json`:
```json
[
  { "type": "navigate", "url": "https://msport.com" },
  { "type": "click", "selector": "button#accept-cookies", "waitForSelector": "#main-content", "waitForNavigation": true },
  { "type": "waitForSelector", "selector": "table tr" },
  { "type": "screenshot", "path": "bot-data/after-load.png" }
]
```

You can also provide a JSON array directly via `.env`:
```env
BOT_ACTIONS=[{"type":"click","selector":"button#start","waitForNavigation":true}]
```

## Dashboard & Live Events
The project includes a minimal dashboard to view real-time action events and send instructions.

- Visit `http://localhost:3000/ui/index.html` after running the server.
- The server exposes a Server-Sent Events stream at `/events` used by the dashboard.
- You can POST instructions to `/api/instructions` (JSON or text) to save them to `bot-instructions.json` for the bot to pick up.

## n8n Workflow
The file `n8n-msport-workflow.json` is a sample n8n export.

It contains:
- a Webhook trigger for `POST /webhook/msport-bot`
- a parser step to normalize the incoming payload

To use it:
1. Import `n8n-msport-workflow.json` into n8n.
2. Activate the workflow.
3. Set `N8N_WEBHOOK_URL` in `.env` to your workflow webhook URL.

## Zapier Integration
Use the Zapier Webhooks app to receive bot output.
1. Create a new Zap with `Webhooks by Zapier` as the trigger.
2. Select `Catch Hook` and copy the generated webhook URL.
3. Paste the URL into `ZAPIER_WEBHOOK_URL` in `.env`.
4. Add actions such as Google Sheets, email, or Slack.

## Make Integration
Use Make (formerly Integromat) to build a scenario:
1. Add a `Webhook` trigger module.
2. Create a custom webhook and copy the URL.
3. Paste the URL into `MAKE_WEBHOOK_URL`.
4. Add subsequent modules for parsing, storing, or notifying.

## AI Model Integration
The project is designed to support advanced models via `aiClient.js`.
Fill in the `.env` values for any available model endpoints and keys.

## Notes
- This project is a scaffold. You must adapt selectors and data extraction to the actual `msport.com` page structure.
- For production use, secure your API keys and webhook endpoints.
- Add custom data transformation and prediction logic as needed.

## Web Client

A small helper using `puppeteer-core` is included as `webClient.js` to simplify browsing and clicking actions.

Basic usage:

1. Install project dependencies:

```bash
npm install
```

2. Ensure you have a Chrome/Chromium binary available. If it's not found automatically, set the `CHROME_PATH` environment variable to the browser executable path.

3. Run the example to open a page, click the first link, and take a screenshot:

```bash
node web-example.js
```

Notes:
- The project already depends on `puppeteer-core`; that package requires a compatible browser executable. Use a system Chrome/Chromium or install full `puppeteer` if you prefer automated browser download.
- Adjust selectors and `headless` options in `webClient.js` for debugging or production use.
