import process from 'node:process';

/**
 * Asks the API what POST /v1/agents requires, without creating anything.
 *
 * An empty and a repo-less body should both be rejected with a validation error that
 * names the required fields. Nothing here sends a valid payload, so no agent is created
 * and nothing is charged.
 */

process.loadEnvFile('.env');
const auth = 'Basic ' + Buffer.from(`${process.env.CURSOR_API_KEY}:`).toString('base64');

async function attempt(label, body) {
  const response = await fetch('https://api.cursor.com/v1/agents', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`\n${label}`);
  console.log(`  status ${response.status}`);
  console.log(`  ${text.replace(/\s+/g, ' ').slice(0, 600)}`);
}

await attempt('empty body', {});
await attempt('prompt only, no repository', {
  prompt: { text: 'Reply with the single word: test' },
});
await attempt('prompt with an empty source', {
  prompt: { text: 'Reply with the single word: test' },
  source: {},
});
