# Deploying to Render via GitHub Actions

This project includes a GitHub Actions workflow at `.github/workflows/deploy-to-render.yml` that triggers a Render deploy on push to `main` or `master`.

Setup steps:

1. Create a Render service for this repo and note the **Service ID** (found in the Render dashboard under your service settings).
2. In your GitHub repository, go to `Settings` → `Secrets` → `Actions` and add:
   - `RENDER_API_KEY` — a Render API key with deploy permissions
   - `RENDER_SERVICE_ID` — the Service ID from step 1
3. Push to `main` (or `master`) and the workflow will run. The workflow will run `npm ci`, run tests, and then call the Render API to create a deploy.

Notes:
- The workflow uses the Render REST API to trigger a deploy. You can modify the curl body to include additional options.
- If you prefer other platforms (Railway, Vercel, Heroku), I can add workflows for those as well.
Render deployment steps

1. Create a Git repo and push this project to GitHub, GitLab, or Bitbucket.

2. Go to https://render.com and sign in.

3. Click "New" → "Web Service" and connect your repository.

4. Use the default branch, select `Node` as the environment and keep the `start` command as `npm start`.

5. Render will run `npm install` and start the app. Set any necessary environment variables in the Render dashboard (e.g., `BOT_TARGET_URL`, webhook URLs, AI keys).

6. After deploy, Render will provide a public URL for your site.

Notes:
- If Puppeteer needs a Chromium binary, Render's environment may not include it. For headless/cloud runs, set `PUPPETEER_SKIP_DOWNLOAD=true` and use `puppeteer-core` with a remote Chrome if needed.
- Use the `render.yaml` manifest to make redeployments reproducible.
