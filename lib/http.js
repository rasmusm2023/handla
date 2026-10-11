import { timingSafeEqual } from 'node:crypto';

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function fail(err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  return json({ ok: false, error: err.message || 'Unexpected error' }, status);
}

// The bot (and the dashboard's Import dialog) must present INGEST_TOKEN to write a report.
export function assertToken(request) {
  const expected = process.env.INGEST_TOKEN || (process.env.VERCEL ? '' : 'dev');
  if (!expected) {
    const err = new Error('INGEST_TOKEN is not set on the server. Add it in Vercel → Settings → Environment Variables.');
    err.status = 500;
    throw err;
  }
  const url = new URL(request.url);
  const header = request.headers.get('authorization') || '';
  const given = header.replace(/^Bearer\s+/i, '') || request.headers.get('x-api-key') || url.searchParams.get('key') || '';
  // CRON_SECRET is what Vercel Cron sends; it is accepted alongside the ingest key.
  const matches = (secret) => {
    const a = Buffer.from(given);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  if (![expected, process.env.CRON_SECRET].filter(Boolean).some(matches)) {
    const err = new Error('Invalid or missing key.');
    err.status = 401;
    throw err;
  }
}

export function weekParam(request) {
  const week = new URL(request.url).searchParams.get('week') || '';
  return /^\d{4}-W\d{2}$/.test(week) ? week : '';
}
