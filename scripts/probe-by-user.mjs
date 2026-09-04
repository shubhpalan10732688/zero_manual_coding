import process from 'node:process';

/**
 * Tests the Analytics by-user endpoints with a personal key.
 *
 * The distinction that matters: 401 means the key is not accepted at all, while 400
 * would mean it was accepted and only the parameters were wrong. Each endpoint is
 * therefore tried bare and again with a date range, so a parameter complaint is not
 * mistaken for a permission wall.
 */

process.loadEnvFile('.env');
const auth = 'Basic ' + Buffer.from(`${process.env.CURSOR_API_KEY}:`).toString('base64');

const METRICS = [
  'agent-edits',
  'tabs',
  'models',
  'top-file-extensions',
  'client-versions',
  'mcp',
  'commands',
  'plans',
  'skills',
  'ask-mode',
];

const day = 86_400_000;
const range = `startDate=${Date.now() - 7 * day}&endDate=${Date.now()}`;

async function probe(path) {
  try {
    const response = await fetch(`https://api.cursor.com${path}`, {
      headers: { Authorization: auth },
    });
    const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 120);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: `${error.cause?.code ?? ''} ${error.message}` };
  }
}

console.log('endpoint                                    bare        with dates');
console.log('-'.repeat(78));

const statuses = new Set();

for (const metric of METRICS) {
  const path = `/analytics/by-user/${metric}`;
  const bare = await probe(path);
  const dated = await probe(`${path}?${range}`);
  statuses.add(bare.status).add(dated.status);
  console.log(`${path.padEnd(44)}${String(bare.status).padEnd(12)}${dated.status}`);
  if (dated.status !== 401) console.log(`    -> ${dated.body}`);
}

// A team-scoped endpoint and a user-scoped one, as controls for this key and network.
console.log('\ncontrols:');
for (const path of ['/teams/members', '/v1/me']) {
  const result = await probe(path);
  console.log(`  ${result.status} ${path}  ${result.body}`);
}

console.log(`\ndistinct statuses seen on by-user endpoints: ${[...statuses].join(', ')}`);
