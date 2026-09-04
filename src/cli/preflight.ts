import fs from 'node:fs';
import path from 'node:path';

import { ApiKeyIdentity, CursorApiError, CursorClient } from '../client/cursorClient';
import { addDays, endOfUtcDayInclusive, formatDay, startOfUtcDay } from '../client/dates';
import { CURSOR_API_BASE_URL } from '../config';
import { getCursorApiKey } from '../secrets';

/**
 * Probes every endpoint the dashboard might use and reports which ones this key and
 * plan can actually reach. The docs disagree with themselves about Team vs Enterprise
 * availability, and AI Code Tracking is gated behind a sales conversation, so the only
 * reliable answer comes from asking the API.
 *
 * Run: npm run preflight
 */

interface ProbeResult {
  name: string;
  endpoint: string;
  status: 'available' | 'denied' | 'error';
  httpStatus?: number;
  detail: string;
}

async function probe(
  name: string,
  endpoint: string,
  fn: () => Promise<string>,
): Promise<ProbeResult> {
  try {
    const detail = await fn();
    return { name, endpoint, status: 'available', detail };
  } catch (error) {
    if (error instanceof CursorApiError) {
      return {
        name,
        endpoint,
        status: error.isAccessDenied ? 'denied' : 'error',
        httpStatus: error.status,
        detail: error.body?.slice(0, 200) ?? error.message,
      };
    }
    return { name, endpoint, status: 'error', detail: (error as Error).message };
  }
}

async function main(): Promise<void> {
  const client = new CursorClient({
    apiKey: await getCursorApiKey(),
    baseUrl: CURSOR_API_BASE_URL(),
    // Fail fast during preflight instead of grinding through retries.
    maxRetries: 1,
  });

  const today = startOfUtcDay(new Date());
  const window = { start: addDays(today, -7), end: endOfUtcDayInclusive(addDays(today, -1)) };

  const results: ProbeResult[] = [];

  let identity: ApiKeyIdentity | undefined;
  results.push(
    await probe('API key identity', 'GET /v1/me', async () => {
      identity = await client.getApiKeyIdentity();
      const owner = identity.userEmail ?? `user ${identity.userId ?? 'unknown'}`;
      return `key "${identity.apiKeyName ?? 'unnamed'}" belongs to ${owner}`;
    }),
  );

  results.push(
    await probe('Team members', 'GET /teams/members', async () => {
      const members = await client.getMembers();
      const active = members.filter((member) => !member.isRemoved).length;
      return `${members.length} members, ${active} active seats`;
    }),
  );

  results.push(
    await probe('Daily usage', 'POST /teams/daily-usage-data', async () => {
      const page = await client.getDailyUsagePage(window, 1, 100);
      return `${page.items.length} rows on page 1, ${page.totalCount ?? '?'} users total`;
    }),
  );

  results.push(
    await probe('Usage events', 'POST /teams/filtered-usage-events', async () => {
      const page = await client.getUsageEventsPage(window, 1, 25);
      const withConversation = page.items.filter((event) => event.conversationId).length;
      return `${page.items.length} events on page 1, ${page.totalCount ?? '?'} total, ${withConversation} carry conversationId`;
    }),
  );

  results.push(
    await probe('Analytics API (Enterprise)', 'GET /analytics/team/dau', async () => {
      const payload = (await client.getTeamDau('7d', 'now')) as Record<string, unknown>;
      return `responded with keys: ${Object.keys(payload).join(', ') || 'none'}`;
    }),
  );

  results.push(
    await probe('AI Code Tracking (Enterprise alpha)', 'GET /analytics/ai-code/commits', async () => {
      const page = await client.getAiCodeCommitsPage(formatDay(window.start), formatDay(today), 1, 10);
      return `${page.items.length} commits on page 1, ${page.totalCount ?? '?'} total`;
    }),
  );

  const label = { available: 'AVAILABLE', denied: 'DENIED   ', error: 'ERROR    ' };
  console.log('\nCursor API preflight');
  console.log(`Base URL: ${CURSOR_API_BASE_URL()}`);
  console.log(`Probe window: ${formatDay(window.start)} to ${formatDay(window.end)}\n`);
  for (const result of results) {
    const http = result.httpStatus ? ` (HTTP ${result.httpStatus})` : '';
    console.log(`  ${label[result.status]}  ${result.name}${http}`);
    console.log(`             ${result.endpoint}`);
    console.log(`             ${result.detail}\n`);
  }

  const reportPath = path.resolve(process.cwd(), 'preflight-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`Report written to ${reportPath}`);

  const required = results.filter((result) =>
    ['Team members', 'Daily usage', 'Usage events'].includes(result.name),
  );
  const blocked = required.filter((result) => result.status !== 'available');
  if (blocked.length === 0) return;

  console.error(
    `\n${blocked.length} endpoint(s) required by the thin slice are unavailable. Ingestion cannot run until they are.`,
  );
  process.exitCode = 1;

  // A key that identifies itself but is refused by every /teams endpoint is a
  // user-scoped key, not a team one. The bare 401 does not say so.
  const allTeamEndpointsDenied = blocked.every((result) => result.httpStatus === 401);
  if (identity && allTeamEndpointsDenied) {
    console.error(
      `\nDiagnosis: this key is valid and belongs to ${identity.userEmail ?? 'a user'}, but it is a\n` +
        'user-scoped key. It works for the Cloud Agents API and the CLI, and is rejected by the\n' +
        'Admin API. The Admin API needs a Team API key created by a team admin at\n' +
        'cursor.com/dashboard -> API Keys, which is a different key from a personal one.',
    );
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
