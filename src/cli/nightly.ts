import { closePool, query } from '../db/pool';
import { enrichForUser } from '../integrations/clients';
import { refreshAllUsers } from '../ingest/refreshUsers';
import { logger } from '../logger';
import { refreshNews } from '../news/ingest';

/**
 * Everything the workspace needs done while nobody is looking, in the order it has to
 * happen.
 *
 *   npm run nightly
 *
 * Three jobs rather than three cron entries, because two of them are ordered: enrichment
 * joins agents to pull requests and tickets, so it has nothing to join until the refresh
 * has pulled today's agents. Running them as separate schedules means either guessing a
 * gap between them or enriching yesterday's data every night.
 *
 * Each stage is isolated from the next. A person whose Cursor key was revoked, a GitHub
 * token that expired, an RSS feed behind a firewall — none of those should mean the
 * organisation wakes up to a dashboard that did not update. Failures are counted, logged
 * against the credential that caused them so the owner sees it on their Connections page,
 * and the run continues. The exit code reports whether anything failed, for whatever is
 * watching cron.
 */

interface StageResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function usersWithIntegrations(): Promise<string[]> {
  // Only people who connected something. Enriching without a credential would rewrite
  // every row to "unclassified", which looks like a regression rather than an absence.
  const rows = await query<{ email: string }>(
    `SELECT DISTINCT i.email
     FROM user_integration i
     JOIN cloud_agent a ON a.email = i.email
     ORDER BY i.email`,
  );
  return rows.map((row) => row.email);
}

async function main(): Promise<void> {
  const stages: StageResult[] = [];

  const refresh = await refreshAllUsers();
  stages.push({
    name: 'cloud agents',
    ok: refresh.failed === 0,
    detail:
      `${refresh.succeeded}/${refresh.users} users, ${refresh.agents} agents, ` +
      `${refresh.runs} runs` +
      (refresh.failed > 0 ? `, ${refresh.failed} failed` : ''),
  });

  const emails = await usersWithIntegrations();
  let enriched = 0;
  let enrichFailed = 0;
  for (const email of emails) {
    try {
      const result = await enrichForUser(email);
      if (result) enriched += 1;
    } catch {
      // enrichForUser has already logged it and written it to the person's integration row,
      // which is where they will see it. Here it is only a count.
      enrichFailed += 1;
    }
  }
  stages.push({
    name: 'enrichment',
    ok: enrichFailed === 0,
    detail:
      `${enriched}/${emails.length} users` + (enrichFailed > 0 ? `, ${enrichFailed} failed` : ''),
  });

  const news = await refreshNews();
  const unreachable = news.filter((result) => result.error);
  const inserted = news.reduce((total, result) => total + result.inserted, 0);
  stages.push({
    name: 'news',
    ok: unreachable.length === 0,
    detail:
      `${inserted} new items from ${news.length - unreachable.length}/${news.length} feeds` +
      (unreachable.length > 0
        ? `, unreachable: ${unreachable.map((result) => result.id).join(', ')}`
        : ''),
  });

  for (const stage of stages) {
    console.log(`${stage.ok ? 'ok  ' : 'warn'}  ${stage.name}: ${stage.detail}`);
  }

  const failed = stages.filter((stage) => !stage.ok);
  if (failed.length > 0) {
    logger.warn('Nightly run finished with failures', {
      stages: failed.map((stage) => stage.name).join(','),
    });
    process.exitCode = 1;
  }
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
