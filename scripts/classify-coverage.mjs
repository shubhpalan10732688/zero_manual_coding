import process from 'node:process';

import pg from 'pg';

/**
 * Measures how much of the feature-versus-fix question the existing data already
 * answers. Branch names and PR links are the developer's own declaration of intent,
 * which beats anything inferred from an auto-generated agent title.
 */

process.loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const { rows } = await pool.query(`
  SELECT a.id, a.name, a.repo_url, a.raw_cost_cents,
         array_remove(array_agg(DISTINCT r.branch), NULL) AS branches,
         array_remove(array_agg(DISTINCT r.pr_url), NULL) AS prs
  FROM cloud_agent a
  LEFT JOIN cloud_agent_run r ON r.agent_id = a.id
  GROUP BY a.id
  ORDER BY a.raw_cost_cents DESC
`);

const TICKET = /([A-Z][A-Z0-9]+-\d+)/;
const KIND = /(?:^|[/_-])(feat|feature|fix|bug|bugfix|chore|refactor|docs|test|hotfix)(?:[/_-]|$)/i;

let withBranch = 0;
let withPr = 0;
let withTicket = 0;
let withKind = 0;

console.log('agent                                    cost    kind     ticket      pr');
console.log('-'.repeat(88));

for (const row of rows) {
  const branch = row.branches[0] ?? '';
  const pr = row.prs[0] ?? '';
  const kind = branch.match(KIND)?.[1]?.toLowerCase() ?? '';
  const ticket = (branch.match(TICKET) ?? row.name?.match(TICKET))?.[1] ?? '';

  if (branch) withBranch += 1;
  if (pr) withPr += 1;
  if (ticket) withTicket += 1;
  if (kind) withKind += 1;

  console.log(
    `${(row.name ?? row.id).slice(0, 38).padEnd(40)}` +
      `$${(row.raw_cost_cents / 100).toFixed(2).padStart(6)}  ` +
      `${(kind || '-').padEnd(9)}${(ticket || '-').padEnd(12)}${pr ? pr.split('/').pop() : '-'}`,
  );
}

const total = rows.length;
const pct = (n) => `${n}/${total} (${Math.round((n / total) * 100)}%)`;

console.log('\ncoverage across agents:');
console.log(`  has a branch name : ${pct(withBranch)}`);
console.log(`  has a pull request: ${pct(withPr)}`);
console.log(`  branch states kind: ${pct(withKind)}`);
console.log(`  has a ticket id   : ${pct(withTicket)}`);

const branches = rows.flatMap((row) => row.branches);
console.log('\nall distinct branches:');
for (const branch of [...new Set(branches)]) console.log(`  ${branch}`);

await pool.end();
