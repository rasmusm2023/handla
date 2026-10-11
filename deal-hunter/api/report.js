import { assertToken, fail, json, weekParam } from '../lib/http.js';
import { saveReport } from '../lib/reports.js';
import { getJson, storageKind } from '../lib/store.js';

// GET /api/report[?week=2026-W42] → the requested (or latest) weekly report, stored weeks, and the last Grok run
export async function GET(request) {
  try {
    const weeks = (await getJson('weeks')) || [];
    const week = weekParam(request) || weeks[0];
    const report = week ? await getJson(`report:${week}`) : null;
    return json({ ok: true, report, weeks, run: await getJson('run'), storage: storageKind });
  } catch (err) {
    return fail(err);
  }
}

// POST /api/report  (Authorization: Bearer <INGEST_TOKEN>)
// Manual/alternative ingest. Body: the report JSON, or any text containing one JSON object / ```json block.
export async function POST(request) {
  try {
    assertToken(request);
    const body = await request.text();
    if (body.length > 400_000) return json({ ok: false, error: 'Report too large.' }, 413);
    return json({ ok: true, ...(await saveReport(body)) });
  } catch (err) {
    return fail(err);
  }
}
