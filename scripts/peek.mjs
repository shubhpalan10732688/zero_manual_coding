import process from 'node:process';

import pg from 'pg';

/** Prints the agent efficiency views against whatever DATABASE_URL points at. */

process.loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function show(title, sql) {
  const { rows } = await pool.query(sql);
  console.log(`\n=== ${title} ===`);
  console.table(rows);
}

await show(
  'user summary',
  `SELECT agents, runs, pull_requests, total_tokens,
          round(raw_cost_cents / 100, 2)                AS raw_cost_usd,
          round(charged_cents / 100, 2)                 AS charged_usd,
          round(subscription_absorbed_cents / 100, 2)   AS absorbed_usd,
          round(cache_reuse_rate * 100, 1)              AS cache_reuse_pct
   FROM v_agent_user_summary`,
);

await show(
  'waste signals',
  `SELECT cold_start_runs, round(cold_start_cents / 100, 2) AS cold_start_usd,
          unfinished_runs, round(unfinished_cents / 100, 2) AS unfinished_usd,
          no_pr_agents,    round(no_pr_cents / 100, 2)      AS no_pr_usd,
          total_runs,      round(total_cents / 100, 2)      AS total_usd,
          round(costliest_agent_share * 100, 1)             AS costliest_pct
   FROM v_agent_waste`,
);

await show(
  'most expensive agents',
  `SELECT left(name, 34) AS name, runs, pull_requests,
          round(raw_cost_cents / 100, 2)   AS raw_usd,
          round(raw_cents_per_run / 100, 3) AS usd_per_run,
          round(cache_reuse_rate * 100, 1)  AS cache_pct
   FROM v_agent_efficiency
   ORDER BY raw_cost_cents DESC
   LIMIT 8`,
);

await show(
  'repo activity',
  `SELECT left(repo, 44) AS repo, agents, runs, pull_requests,
          round(raw_cost_cents / 100, 2) AS raw_usd
   FROM v_agent_repo_activity ORDER BY raw_cost_cents DESC`,
);

await show(
  'run status mix',
  `SELECT status, count(*)::int AS runs, round(sum(raw_cost_cents) / 100, 2) AS raw_usd
   FROM v_agent_run_detail GROUP BY status ORDER BY runs DESC`,
);

await show(
  'daily activity',
  `SELECT day, runs, round(raw_cost_cents / 100, 2) AS raw_usd,
          round(cache_reuse_rate * 100, 1) AS cache_pct
   FROM v_agent_daily ORDER BY day DESC LIMIT 10`,
);

await pool.end();
