# Automation Workflow Guide

This guide helps you connect your virtual football bot to n8n, Zapier, and Make.

## n8n
1. Import `n8n-msport-workflow.json` into n8n.
2. The workflow contains:
   - `Webhook` trigger at `/webhook/msport-bot`
   - `Parse Payload` function node to normalize incoming JSON
3. Set `N8N_WEBHOOK_URL` in `.env` to the HTTP webhook URL published by n8n.
4. Add additional nodes in n8n for:
   - `Google Sheets`
   - `Slack`
   - `Email`
   - `HTTP Request`

### Example extension
- Webhook -> Set -> Google Sheets -> Slack

## Zapier
1. Create a new Zap.
2. Add `Webhooks by Zapier` as the trigger.
3. Choose `Catch Hook` and copy the webhook URL.
4. Paste the URL into `ZAPIER_WEBHOOK_URL` in `.env`.
5. Add actions like:
   - `Create Spreadsheet Row` (Google Sheets)
   - `Send Channel Message` (Slack)
   - `Send Email`

## Make
1. Create a new scenario.
2. Add `Webhooks` and choose `Custom webhook`.
3. Copy the custom webhook URL.
4. Paste the URL into `MAKE_WEBHOOK_URL` in `.env`.
5. Add modules such as:
   - `JSON` to parse data
   - `Google Sheets` to save records
   - `Email` or `SMS` to notify
   - `Tools > Iterator` to process record arrays

## Advanced Prediction Workflow
Use these stages in your pipeline:
1. Scrape historical match data from `msport.com`
2. Load external odds from API
3. Run probability metrics and statistical trend detection
4. Send structured payload to automation services
5. Optionally trigger AI model scoring for predictive recommendations

## AI model considerations
- Enable only the providers you have valid endpoint URLs and API keys for.
- The `aiClient.js` adapter is generic and expects a JSON prompt-based REST endpoint.
- If your provider uses a different request schema, update `queryAiModels()` accordingly.

## Security
- Keep `.env` out of source control.
- Use secure webhook validation in production.
- Do not hardcode API keys in code.
