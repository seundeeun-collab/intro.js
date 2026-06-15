# Deploying the Automation Bot to the Cloud

This document outlines simple options to run your bot in the cloud. The app is container-ready with the included `Dockerfile`.

1) Quick container run (local test)

```bash
docker build -t my-automation-bot .
docker run -p 3000:3000 -e PORT=3000 -e BOT_TARGET_URL=https://msport.com my-automation-bot
```

2) Deploy to Render / Heroku / Railway

- Render: Create a new Web Service, connect the repo, set `npm start` as the start command, set env vars in the service settings.
- Heroku: `heroku create` then `git push heroku main` (or use a Docker container). Set config vars in the dashboard.
- Railway: Create a new project, point to repo, configure env vars.

3) Deploy using Docker on any cloud provider

- Build and push to a container registry (DockerHub, ECR, ACR, GCR).
- Create a container service (AWS ECS, Azure App Service, GCP Cloud Run, DigitalOcean App Platform) pointing to the container image.

4) Environment variables to set in production

- `BOT_TARGET_URL` — the default site to visit
- `BOT_INSTRUCTIONS_FILE` — path to persist instructions if desired
- Webhook URLs for `N8N_WEBHOOK_URL`, `ZAPIER_WEBHOOK_URL`, `MAKE_WEBHOOK_URL`
- AI model endpoints / keys used by `aiClient.js`

Security note: Do not expose sensitive API keys or private endpoints publicly. Use secure networking and firewall rules.
