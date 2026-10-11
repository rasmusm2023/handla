# Fynd – Grocery Deal Hunter dashboard

A dashboard for the weekly Grok deal hunt: deals by store, dish ideas, and a shopping list that syncs between phone and computer.

Every Monday the app itself asks Grok (xAI API, with live web search) for this week's deals and stores the answer – nothing to copy or paste.

No build step and no dependencies: static files in `public/`, serverless functions in `api/`, Upstash Redis for storage.

## How the automatic run works

1. Vercel Cron calls `/api/hunt` every Monday at 10:00 UTC (12:00 Swedish summer time, 11:00 in winter). Change the time in `vercel.json`.
2. `/api/hunt` sends the instructions in `lib/prompt.js` to Grok with the `web_search` tool enabled.
3. Grok's JSON answer is validated, normalised and saved as that week's report. The dashboard shows it the next time you open it.
4. If a run fails (API error, timeout after 5 minutes, unusable answer), the dashboard shows a warning banner with the reason and a *Try again* button.

To change stores, thresholds, staples or preferences, edit `lib/prompt.js` and redeploy.

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it at vercel.com/new (framework preset: **Other**), or run `npx vercel` in the folder.
2. **Storage → Create Database → Upstash for Redis** and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` – both work).
3. **Settings → Environment Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `XAI_API_KEY` | An API key from console.x.ai (API usage is billed separately from a Grok subscription) |
   | `CRON_SECRET` | Long random string. Vercel Cron sends it so only the scheduler can trigger runs |
   | `INGEST_TOKEN` | Long random string. Your own key for the dashboard's *Run Grok now* button |
   | `XAI_MODEL` | Optional. Defaults to `grok-4.7` |

4. Redeploy so the variables take effect.
5. Open the site, tap **Update → Run Grok now**, enter your `INGEST_TOKEN`, and check the first report.
6. On your phone, use "Add to Home Screen" to get it as an app.

## Run locally

```bash
npm run dev
```

Open http://localhost:3000. Data is stored in `.data/` and the key is `dev`. Until a report exists the page shows clearly-labelled sample data. Set `XAI_API_KEY` in your shell before starting to make *Run Grok now* work locally.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/hunt` | `CRON_SECRET` or `INGEST_TOKEN` | Ask Grok for this week's deals and store them (takes minutes) |
| GET | `/api/report?week=2026-W42` | – | Report for a week (latest if omitted), stored weeks, last run status |
| POST | `/api/report` | `INGEST_TOKEN` | Store a report from another source; see `examples/report.example.json` |
| GET / PUT | `/api/list?week=2026-W42` | – | Shopping-list state for a week |

Keys are sent as `Authorization: Bearer <key>`. Reading the dashboard and editing the shopping list need no login – anyone with the URL can do both.
