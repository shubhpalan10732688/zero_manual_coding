import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * Runs Next with Node trusting the operating system's certificate store.
 *
 * Server actions call api.cursor.com directly. On a network that inspects TLS, Node
 * rejects the re-signed certificate because it only trusts its own bundled CA list, and
 * the connect flow fails with an opaque "fetch failed". The flag has to be set before
 * Node starts, and it has to reach the workers Next spawns, so it goes through
 * NODE_OPTIONS rather than on the command line.
 */

const flag = '--use-system-ca';
const existing = process.env.NODE_OPTIONS ?? '';

const child = spawn(
  process.execPath,
  [new URL('../node_modules/next/dist/bin/next', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: existing.includes(flag) ? existing : `${existing} ${flag}`.trim(),
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
