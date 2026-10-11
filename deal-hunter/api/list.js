import { fail, json, weekParam } from '../lib/http.js';
import { getJson, setJson } from '../lib/store.js';

// Shopping-list state per week, shared between phone and computer.
// Shape: { entries: { [dealId]: { in, qty, checked } }, custom: [{ id, name, qty, checked }], updatedAt }

export async function GET(request) {
  try {
    const week = weekParam(request);
    if (!week) return json({ ok: false, error: 'Missing ?week=YYYY-Www' }, 400);
    return json({ ok: true, state: await getJson(`list:${week}`) });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request) {
  try {
    const week = weekParam(request);
    if (!week) return json({ ok: false, error: 'Missing ?week=YYYY-Www' }, 400);
    const body = await request.text();
    if (body.length > 50_000) return json({ ok: false, error: 'List too large.' }, 413);
    const state = JSON.parse(body);
    if (!state || typeof state.entries !== 'object' || !Array.isArray(state.custom)) {
      return json({ ok: false, error: 'Invalid list state.' }, 400);
    }
    await setJson(`list:${week}`, {
      entries: state.entries,
      custom: state.custom.slice(0, 100),
      updatedAt: Number(state.updatedAt) || Date.now(),
    });
    return json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
