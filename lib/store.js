// Tiny JSON key-value store.
// On Vercel: Upstash Redis over REST (env vars are added by the Upstash/KV integration).
// Locally (no Redis env): JSON files in .data/ so `npm run dev` works with zero setup.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DATA_DIR = path.join(process.cwd(), '.data');

export const storageKind = REDIS_URL && REDIS_TOKEN ? 'redis' : process.env.VERCEL ? 'none' : 'file';

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
  return data.result;
}

const fileFor = (key) => path.join(DATA_DIR, key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');

function assertConfigured() {
  if (storageKind === 'none') {
    const err = new Error('No storage configured. Add an Upstash Redis database to this Vercel project (Storage tab) and redeploy.');
    err.status = 503;
    throw err;
  }
}

export async function getJson(key) {
  assertConfigured();
  if (storageKind === 'redis') {
    const raw = await redis(['GET', key]);
    return raw ? JSON.parse(raw) : null;
  }
  try {
    return JSON.parse(await readFile(fileFor(key), 'utf8'));
  } catch {
    return null;
  }
}

export async function setJson(key, value) {
  assertConfigured();
  if (storageKind === 'redis') {
    await redis(['SET', key, JSON.stringify(value)]);
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(fileFor(key), JSON.stringify(value, null, 2));
}
