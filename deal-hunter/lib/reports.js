import { normalizeReport } from './normalize.js';
import { getJson, setJson } from './store.js';

// Validates raw bot output, stores it under its week and keeps the week index (newest first).
export async function saveReport(raw) {
  const { report, warnings } = normalizeReport(raw);
  await setJson(`report:${report.week}`, report);
  const weeks = (await getJson('weeks')) || [];
  await setJson('weeks', [...new Set([report.week, ...weeks])].sort().reverse().slice(0, 26));
  return { week: report.week, deals: report.deals.length, dishes: report.dishes.length, warnings };
}
