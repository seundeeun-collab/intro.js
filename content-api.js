import express from 'express';
import bodyParser from 'body-parser';
import { saveContent, loadContent } from './contentService.js';
import { extractFromPage } from './contentExtractor.js';
import { summarizeExtraction } from './aiIntegrator.js';

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));

// Save content: POST /api/content/save { key, html }
app.post('/api/content/save', async (req, res) => {
  try {
    const { key, html, bucket } = req.body;
    if (!key || !html) return res.status(400).json({ error: 'key and html required' });
    const result = await saveContent(key, html, { bucket });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Load content: GET /api/content/:key
app.get('/api/content/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const bucket = req.query.bucket;
    const html = await loadContent(key, { bucket });
    res.type('html').send(html);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Extract and summarize on demand: POST /api/content/extract-summarize
// body: { url, bucket?, saveKey?, postToSlack?, slackWebhook?, postToPR?, repo?, prNumber?, githubToken? }
app.post('/api/content/extract-summarize', async (req, res) => {
  try {
    const { url, bucket, saveKey, postToSlack, slackWebhook, postToPR, repo, prNumber, githubToken, autoTranslate } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const extraction = await extractFromPage(url, { headless: true });

    // Optionally save the HTML
    let saveResult = null;
    if (saveKey) {
      saveResult = await saveContent(saveKey, extraction.fullHTML, { bucket });
    }

    // Summarize with retries and telemetry
    let summary = null;
    const summaryStart = Date.now();
    try {
      const maxSummarizeAttempts = 2;
      let lastErr = null;
      for (let attempt = 0; attempt <= maxSummarizeAttempts; attempt++) {
        try {
          summary = await summarizeExtraction(extraction, { chunkSize: 3000, autoTranslate: autoTranslate !== false });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          console.warn(`summarizeExtraction attempt ${attempt} failed: ${e}`);
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
      if (!summary && lastErr) throw lastErr;
    } catch (err) {
      const duration = Date.now() - summaryStart;
      console.error('Summarization failed after retries:', err);
      // include error telemetry in response
      return res.status(500).json({ error: 'summarization_failed', message: String(err), duration });
    }

    // Optionally post to Slack
    if (postToSlack || slackWebhook) {
      const hook = slackWebhook || process.env.SLACK_WEBHOOK;
      if (hook) {
        const text = `Summary for ${url}:\n${summary.finalSummary || '(no summary)'}\n` + (saveResult ? `Saved: ${JSON.stringify(saveResult)}` : '');
        await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      }
    }

    // Optionally post to PR comment
    if (postToPR && prNumber && repo) {
      const token = githubToken || process.env.GITHUB_TOKEN;
      if (token) {
        const comment = `Automated summary for ${url}:\n\n${summary.finalSummary || '(no summary)'}\n` + (saveResult ? `\nSaved content: ${JSON.stringify(saveResult)}` : '');
        const urlPost = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
        await fetch(urlPost, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: comment }) });
      }
    }

    res.json({ extraction, summary, saveResult });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.CONTENT_PORT || 4000;
app.listen(PORT, () => console.log(`Content API listening on port ${PORT}`));

export default app;
