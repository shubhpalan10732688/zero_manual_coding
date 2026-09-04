import { createSession } from '../auth/sessions';
import { optionalEnv } from '../config';
import { closePool, query } from '../db/pool';

/**
 * Issues a workspace session for a seeded account, so /app can be opened locally without a
 * real Cursor key.
 *
 *   npm run dev:session -- ada@corp.test
 *
 * Refuses to run unless ALLOW_DEV_SESSION is set, because it is a login with no
 * authentication whatsoever. That guard is the whole reason this is a separate script rather
 * than a flag on the real login: there is no code path in the app that can reach it, so no
 * misconfiguration of the app can expose it.
 */
async function main(): Promise<void> {
  if (optionalEnv('ALLOW_DEV_SESSION') !== 'true') {
    console.error(
      'Refusing to run. This mints a session with no credential check.\n' +
        'Set ALLOW_DEV_SESSION=true in .env.local if this is a local development database.',
    );
    process.exitCode = 1;
    return;
  }

  const email = (process.argv[2] ?? 'ada@corp.test').toLowerCase();

  const known = await query<{ email: string }>('SELECT email FROM app_user WHERE email = $1', [
    email,
  ]);
  if (known.length === 0) {
    console.error(`No app_user row for ${email}. Run npm run dev:db to load the seed first.`);
    process.exitCode = 1;
    return;
  }

  const session = await createSession(email, 'dev-session-cli');

  console.log(`Session issued for ${email}, valid for ${session.maxAgeSeconds / 86400} days.\n`);
  console.log('Paste this into the browser console on http://localhost:3000 and reload:\n');
  console.log(`  document.cookie = 'zmc_session=${session.token}; path=/'`);
  console.log('\nThen open http://localhost:3000/app');
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
