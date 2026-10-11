import { assertToken, fail, json } from '../lib/http.js';
import { isoWeek } from '../lib/normalize.js';
import { PROMPT } from '../lib/prompt.js';
import { saveReport } from '../lib/reports.js';
import { getJson, setJson } from '../lib/store.js';

// GET /api/hunt – asks Grok (with live web search) for this week's deals and stores the result.
// Called by Vercel Cron every Monday (see vercel.json) with "Authorization: Bearer <CRON_SECRET>",
// and by the dashboard's "Run Grok now" button with the INGEST_TOKEN.

const XAI_URL = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1') + '/responses';
const MODEL = process.env.XAI_MODEL || 'grok-4.7';
const TIMEOUT_MS = 285_000; // just under the function's 300 s limit, so a slow run is recorded as a failure

function responseText(data) {
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const parts = (data.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text' || part.type === 'text')
    .map((part) => part.text);
  return parts.join('\n');
}

async function askGrok(now) {
  if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY is not set on the server.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', dateStyle: 'full' }).format(now);
  const res = await fetch(XAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `Today is ${today} (ISO week ${isoWeek(now)}). Search the stores' current offers and produce this week's report as JSON.` },
      ],
      tools: [{ type: 'web_search' }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`xAI API responded ${res.status}: ${body.slice(0, 300)}`);
  const text = responseText(JSON.parse(body));
  if (!text) throw new Error('xAI API returned no text.');
  return text;
}

export async function GET(request) {
  const startedAt = new Date();
  try {
    assertToken(request);
    const previous = await getJson('run');
    if (previous?.status === 'running' && Date.now() - Date.parse(previous.startedAt) < 300_000) {
      return json({ ok: false, error: 'A run is already in progress.' }, 409);
    }
    await setJson('run', { status: 'running', startedAt: startedAt.toISOString() });
    try {
      const result = await saveReport(await askGrok(startedAt));
      await setJson('run', { status: 'ok', startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), ...result });
      return json({ ok: true, ...result });
    } catch (err) {
      const message = err.name === 'TimeoutError' ? 'Grok did not finish within 5 minutes.' : err.message;
      await setJson('run', { status: 'error', startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), message });
      return json({ ok: false, error: message }, 502);
    }
  } catch (err) {
    return fail(err);
  }
}
