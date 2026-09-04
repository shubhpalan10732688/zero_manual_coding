import process from 'node:process';

import pg from 'pg';

/**
 * Reconciles the "shipped nothing" figure against "nothing merged" on /app/impact.
 * They should differ only by agents that opened a pull request nobody merged.
 */

process.loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const money = (cents) => `$${(Number(cents ?? 0) / 100).toFixed(2)}`;

const { rows } = await pool.query(`
  SELECT
    CASE
      WHEN pr_number IS NULL THEN 'no pull request at all'
      WHEN NOT shipped      THEN 'pull request opened, never merged'
      ELSE 'merged'
    END AS outcome,
    COUNT(*)::int AS agents,
    SUM(raw_cost_cents) AS cents
  FROM v_agent_impact
  GROUP BY 1
  ORDER BY cents DESC
`);

console.log('outcome                              agents      cost');
for (const row of rows) {
  console.log(`${row.outcome.padEnd(36)} ${String(row.agents).padStart(6)}  ${money(row.cents).padStart(8)}`);
}

const { rows: drafts } = await pool.query(`
  SELECT agent_name, pr_number, raw_cost_cents
  FROM v_agent_impact
  WHERE pr_number IS NOT NULL AND NOT shipped
  ORDER BY raw_cost_cents DESC
`);

console.log('\nagents whose pull request was never merged:');
for (const d of drafts) {
  console.log(`  #${d.pr_number}  ${money(d.raw_cost_cents).padStart(8)}  ${d.agent_name}`);
}

const { rows: waste } = await pool.query(
  'SELECT no_pr_agents, no_pr_cents, total_cents FROM v_agent_waste',
);
console.log('\nv_agent_waste currently reports:');
console.log(
  `  ${waste[0].no_pr_agents} agents, ${money(waste[0].no_pr_cents)} of ${money(waste[0].total_cents)}`,
);

await pool.end();
