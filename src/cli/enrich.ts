import { closePool, query } from '../db/pool';
import { enrichUser } from '../enrich';
import { ApiSource, ChainedSource, FileSource } from '../enrich/sources';

/**
 * Joins agents to the pull requests and tickets they produced.
 *
 *   npm run enrich                                 live GitHub and Jira, all users
 *   npm run enrich -- --file data/enrichment.json  replay exported records
 *   npm run enrich -- --email you@example.com
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const file = arg('file');
  const api = ApiSource.fromEnv();

  const source =
    file && api.name !== 'none'
      ? new ChainedSource([api, FileSource.fromFile(file)])
      : file
        ? FileSource.fromFile(file)
        : api;

  if (source.name === 'none') {
    console.error(
      'No enrichment source configured.\n' +
        '  Set GITHUB_TOKEN for pull request data, and JIRA_BASE_URL, JIRA_EMAIL and\n' +
        '  JIRA_API_TOKEN for ticket data. Alternatively pass --file with exported records.',
    );
    process.exitCode = 1;
    return;
  }

  const only = arg('email');
  const emails = only
    ? [only.toLowerCase()]
    : (await query<{ email: string }>('SELECT DISTINCT email FROM cloud_agent')).map(
        (row) => row.email,
      );

  if (emails.length === 0) {
    console.log('No ingested agents to enrich yet. Run "npm run connect" first.');
    return;
  }

  for (const email of emails) {
    const result = await enrichUser(email, source);
    console.log(
      `${email}: ${result.agents} agents, ${result.withPullRequest} with a pull request, ` +
        `${result.withTicket} with a ticket, ${result.classified} classified`,
    );
  }
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
