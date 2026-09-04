import process from 'node:process';

/**
 * Maps what a USER-scoped Cursor API key can actually reach, and what those responses
 * contain. The docs describe the Admin API and the Cloud Agents API separately without
 * stating which endpoints a personal key covers, so this asks the API directly.
 *
 *   node --use-system-ca scripts/probe-user-scope.mjs
 */

process.loadEnvFile('.env');
const key = process.env.CURSOR_API_KEY;
if (!key) throw new Error('CURSOR_API_KEY is not set');

const auth = 'Basic ' + Buffer.from(`${key}:`).toString('base64');
const base = 'https://api.cursor.com';

async function get(path) {
  const response = await fetch(base + path, { headers: { Authorization: auth } });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[${shape(value[0], depth + 1)} x${value.length}]`;
  }
  if (typeof value === 'object') {
    if (depth > 2) return '{...}';
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${k}: ${shape(v, depth + 1)}`)
      .join(', ')} }`;
  }
  if (typeof value === 'string') return value.length > 40 ? 'string(long)' : `"${value}"`;
  return typeof value;
}

console.log('=== agent list: how much history, and what fields ===');
const list = await get('/v1/agents?limit=100');
const items = list.json?.items ?? [];
console.log(`status ${list.status}, ${items.length} agents returned`);
console.log('nextCursor present:', Object.hasOwn(list.json ?? {}, 'nextCursor'));
if (items[0]) {
  console.log('agent fields:', Object.keys(items[0]).join(', '));
  console.log('first agent:', JSON.stringify(items[0], null, 2).slice(0, 900));
}

const dates = items.map((a) => a.createdAt).filter(Boolean).sort();
if (dates.length > 0) {
  console.log(`createdAt range: ${dates[0]} .. ${dates[dates.length - 1]}`);
}
const statuses = {};
for (const a of items) statuses[a.status] = (statuses[a.status] ?? 0) + 1;
console.log('statuses:', JSON.stringify(statuses));

console.log('\n=== per-agent usage: the cost and token detail ===');
if (items[0]) {
  const usage = await get(`/v1/agents/${items[0].id}/usage`);
  console.log('status', usage.status);
  console.log('shape:', shape(usage.json));
  console.log(JSON.stringify(usage.json, null, 2).slice(0, 1400));
}

console.log('\n=== other per-agent paths ===');
for (const suffix of ['messages', 'conversation', 'logs', 'diff', 'followup', 'runs']) {
  if (!items[0]) break;
  const result = await get(`/v1/agents/${items[0].id}/${suffix}`);
  console.log(`  ${result.status} GET /v1/agents/{id}/${suffix}`);
}

console.log('\n=== model catalogue: is pricing exposed? ===');
const models = await get('/v1/models');
const first = models.json?.items?.[0];
console.log('model count:', models.json?.items?.length);
console.log('model fields:', first ? Object.keys(first).join(', ') : 'n/a');
const priced = (models.json?.items ?? []).find((m) => JSON.stringify(m).match(/price|cost|cents/i));
console.log('any model carries pricing:', Boolean(priced));
if (priced) console.log(JSON.stringify(priced, null, 2).slice(0, 600));
