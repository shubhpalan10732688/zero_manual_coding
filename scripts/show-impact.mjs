import process from 'node:process';

import pg from 'pg';

process.loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const money = (cents) => `$${((cents ?? 0) / 100).toFixed(2)}`;

const { rows: tickets } = await pool.query(
  `SELECT * FROM v_impact_by_ticket ORDER BY raw_cost_cents DESC`,
);

console.log('IMPACT BY TICKET\n');
for (const t of tickets) {
  const lines = t.additions ? `+${t.additions}/-${t.deletions ?? 0}` : 'no code shipped';
  console.log(
    `${t.ticket_key.padEnd(12)} ${(t.work_type ?? '?').padEnd(10)} ${money(t.raw_cost_cents).padStart(8)}  ` +
      `${String(t.agents).padStart(2)} agents  ${t.shipped_agents}/${t.agents} shipped  ${lines}`,
  );
  console.log(`             ${(t.summary ?? '').slice(0, 88)}`);
  console.log(`             ticket type: ${t.ticket_type ?? '-'} | status: ${t.ticket_status ?? '-'}\n`);
}

const { rows: types } = await pool.query(
  `SELECT * FROM v_impact_by_type ORDER BY raw_cost_cents DESC`,
);
console.log('\nBY WORK TYPE\n');
for (const t of types) {
  console.log(
    `${t.work_type.padEnd(12)} ${money(t.raw_cost_cents).padStart(8)}  ${String(t.agents).padStart(2)} agents  ` +
      `${t.shipped_agents} shipped  +${t.additions ?? 0}/-${t.deletions ?? 0}`,
  );
}

const { rows: summary } = await pool.query(`SELECT * FROM v_impact_summary`);
console.log('\nSUMMARY\n');
console.log(summary[0]);

await pool.end();
