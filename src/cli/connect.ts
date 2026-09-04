import { createInterface } from 'node:readline/promises';

import { optionalEnv } from '../config';
import { ingestCloudAgents } from '../ingest/cloudAgents';
import { logger } from '../logger';
import { clientFor, connectKey, disconnect, listConnectedUsers, InvalidKeyError } from '../users/keyStore';
import { closePool } from '../db/pool';

/**
 * Connect, list or disconnect a personal Cursor key from the terminal.
 *
 *   npm run connect                      prompts for a key, then pulls history
 *   npm run connect -- --list
 *   npm run connect -- --disconnect me@example.com
 */

async function promptForKey(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Create a key at https://cursor.com/dashboard -> Integrations -> User API Keys');
    // Terminal echo is unavoidable here; the web flow uses a password field instead.
    return await rl.question('Paste your Cursor API key: ');
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const users = await listConnectedUsers();
    if (users.length === 0) {
      console.log('No keys connected yet.');
      return;
    }
    console.log(`${users.length} connected user(s):\n`);
    for (const user of users) {
      const health = user.lastError ? `needs reconnect: ${user.lastError}` : 'ok';
      console.log(`  ${user.email}  key "${user.keyName ?? 'unnamed'}"  ${health}`);
      console.log(`      connected ${user.connectedAt.toISOString()}, last refresh ${
        user.lastUsedAt?.toISOString() ?? 'never'
      }`);
    }
    return;
  }

  const disconnectIndex = args.indexOf('--disconnect');
  if (disconnectIndex !== -1) {
    const email = args[disconnectIndex + 1];
    if (!email) throw new Error('Usage: npm run connect -- --disconnect you@example.com');
    await disconnect(email);
    console.log(`Removed the stored key for ${email}. Their history stays until you delete it.`);
    return;
  }

  const rawKey = optionalEnv('CURSOR_API_KEY') ?? (await promptForKey());

  let email: string;
  try {
    const { identity, masked } = await connectKey(rawKey);
    email = identity.userEmail!.toLowerCase();
    console.log(`\nConnected ${identity.userFirstName ?? ''} ${identity.userLastName ?? ''}`.trimEnd());
    console.log(`  account: ${identity.userEmail}`);
    console.log(`  key:     ${masked} ("${identity.apiKeyName ?? 'unnamed'}")`);
  } catch (error) {
    if (error instanceof InvalidKeyError) {
      console.error(`\n${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  console.log('\nPulling your Cloud Agent history...');
  const client = await clientFor(email);
  const result = await ingestCloudAgents(client!, email);
  console.log(
    `  ${result.agents} agents, ${result.runs} runs stored` +
      (result.failures > 0 ? `, ${result.failures} lookups failed` : ''),
  );
}

main()
  .catch((error: Error) => {
    logger.error('connect failed', { error: error.message });
    console.error(error.stack ?? error);
    process.exitCode = 1;
  })
  .finally(closePool);
