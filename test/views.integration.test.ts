import fs from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

/**
 * Runs the migrations and every metric view against a real Postgres engine (PGlite),
 * so the SQL the dashboard depends on is exercised rather than assumed. Dates are
 * relative to CURRENT_DATE, matching how the views themselves are written.
 */

jest.setTimeout(120_000);

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');

let db: PGlite;

async function scalar<T = number>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error(`No rows for: ${sql}`);
  return Object.values(row)[0] as T;
}

beforeAll(async () => {
  db = await PGlite.create();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }

  await seed();
});

afterAll(async () => {
  await db?.close();
});

async function seed(): Promise<void> {
  await db.exec(`
    INSERT INTO cursor_member (email, user_id, name, role, is_removed) VALUES
      ('alice@corp.test', 'user_a', 'Alice', 'member', FALSE),
      ('bob@corp.test',   'user_b', 'Bob',   'member', FALSE),
      ('carol@corp.test', 'user_c', 'Carol', 'owner',  FALSE),
      ('dave@corp.test',  'user_d', 'Dave',  'member', TRUE);

    INSERT INTO member_directory (email, team, cost_center) VALUES
      ('alice@corp.test', 'Platform', 'CC-1'),
      ('bob@corp.test',   'Platform', 'CC-1'),
      ('carol@corp.test', 'Payments', 'CC-2');
  `);

  // Alice: heavy, accepts 40% of Tab suggestions, uses agent and cmdk.
  // Bob: light, accepts 10%, chat only.
  // Both active on each of the last 7 days.
  await db.exec(`
    INSERT INTO cursor_daily_usage
      (email, day, is_active, total_tabs_shown, total_tabs_accepted, total_accepts, total_rejects,
       accepted_lines_added, chat_requests, composer_requests, agent_requests, cmdk_usages)
    SELECT 'alice@corp.test', (CURRENT_DATE - g.day_offset), TRUE, 100, 40, 8, 2, 100, 10, 4, 5, 3
      FROM generate_series(1, 7) AS g(day_offset);

    INSERT INTO cursor_daily_usage
      (email, day, is_active, total_tabs_shown, total_tabs_accepted, total_accepts, total_rejects,
       accepted_lines_added, chat_requests, composer_requests, agent_requests, cmdk_usages)
    SELECT 'bob@corp.test', (CURRENT_DATE - g.day_offset), TRUE, 100, 10, 5, 5, 20, 20, 0, 0, 0
      FROM generate_series(1, 7) AS g(day_offset);
  `);

  // Carol holds a seat, was active 60 days ago, nothing since.
  await db.exec(`
    INSERT INTO cursor_daily_usage (email, day, is_active, total_tabs_shown, total_tabs_accepted)
    VALUES ('carol@corp.test', CURRENT_DATE - 60, TRUE, 10, 5),
           ('carol@corp.test', CURRENT_DATE - 2, FALSE, 0, 0);
  `);

  await db.exec(`
    INSERT INTO cursor_usage_event
      (event_key, ts, email, model, kind, max_mode, is_headless, charged_cents, conversation_id,
       input_tokens, output_tokens)
    VALUES
      ('k1', now() - INTERVAL '2 days', 'alice@corp.test', 'claude-4.5-sonnet', 'Usage-based', TRUE,  FALSE, 100, 'conv-a', 1000, 200),
      ('k2', now() - INTERVAL '2 days', 'alice@corp.test', 'claude-4.5-sonnet', 'Usage-based', TRUE,  FALSE, 100, 'conv-a', 900,  150),
      ('k3', now() - INTERVAL '1 day',  'alice@corp.test', 'gpt-5',             'Usage-based', FALSE, FALSE,  50, 'conv-b', 500,  100),
      ('k4', now() - INTERVAL '1 day',  'bob@corp.test',   'gpt-5',             'Usage-based', FALSE, TRUE,   10, 'conv-c', 100,   20);
  `);
}

describe('v_seat', () => {
  it('counts only members still on the team', async () => {
    expect(await scalar('SELECT COUNT(*)::int FROM v_seat')).toBe(3);
  });

  it('falls back to Unassigned when the directory has no entry', async () => {
    await db.exec(
      `INSERT INTO cursor_member (email, name, role, is_removed) VALUES ('erin@corp.test', 'Erin', 'member', FALSE)`,
    );
    expect(
      await scalar<string>(`SELECT team FROM v_seat WHERE email = 'erin@corp.test'`),
    ).toBe('Unassigned');
    await db.exec(`DELETE FROM cursor_member WHERE email = 'erin@corp.test'`);
  });
});

describe('v_developer_daily', () => {
  it('derives the acceptance rates the API does not provide', async () => {
    const row = await db.query<{ tab: number; apply: number }>(
      `SELECT tab_acceptance_rate::float8 AS tab, apply_acceptance_rate::float8 AS apply
         FROM v_developer_daily
        WHERE email = 'alice@corp.test' LIMIT 1`,
    );
    expect(row.rows[0]!.tab).toBeCloseTo(0.4);
    expect(row.rows[0]!.apply).toBeCloseTo(0.8);
  });

  it('yields no rate rather than a divide-by-zero when nothing was shown', async () => {
    expect(
      await scalar(
        `SELECT COUNT(*)::int FROM v_developer_daily
          WHERE email = 'carol@corp.test' AND total_tabs_shown = 0 AND tab_acceptance_rate IS NOT NULL`,
      ),
    ).toBe(0);
  });

  it('excludes removed members entirely', async () => {
    expect(
      await scalar(`SELECT COUNT(*)::int FROM v_developer_daily WHERE email = 'dave@corp.test'`),
    ).toBe(0);
  });
});

describe('v_developer_weekly', () => {
  it('divides summed totals rather than averaging daily rates', async () => {
    const rates = await db.query<{ rate: number }>(
      `SELECT DISTINCT tab_acceptance_rate::float8 AS rate
         FROM v_developer_weekly WHERE email = 'alice@corp.test'`,
    );
    expect(rates.rows.map((row) => row.rate)).toEqual([0.4]);
  });

  it('counts active days', async () => {
    expect(
      await scalar(
        `SELECT SUM(active_days)::int FROM v_developer_weekly WHERE email = 'bob@corp.test'`,
      ),
    ).toBe(7);
  });
});

describe('v_weekly_benchmark', () => {
  it('takes the median across developers, so one power user cannot move the bar', async () => {
    const median = await scalar<number>(
      `SELECT median_tab_acceptance_rate::float8 FROM v_weekly_benchmark ORDER BY week_start DESC LIMIT 1`,
    );
    // Alice 0.4, Bob 0.1 -> 0.25.
    expect(median).toBeCloseTo(0.25);
  });
});

describe('v_feature_breadth_14d', () => {
  it('flags the modes each developer actually touched', async () => {
    const rows = await db.query<{
      email: string;
      uses_agent: boolean;
      uses_cmdk: boolean;
      uses_chat: boolean;
    }>(`SELECT email, uses_agent, uses_cmdk, uses_chat FROM v_feature_breadth_14d ORDER BY email`);

    const byEmail = Object.fromEntries(rows.rows.map((row) => [row.email, row]));
    expect(byEmail['alice@corp.test']).toMatchObject({ uses_agent: true, uses_cmdk: true });
    expect(byEmail['bob@corp.test']).toMatchObject({ uses_agent: false, uses_cmdk: false, uses_chat: true });
  });

  it('includes seats with no recent activity at all', async () => {
    const carol = await db.query<{ active_days: number; uses_tab: boolean }>(
      `SELECT active_days::int AS active_days, uses_tab FROM v_feature_breadth_14d WHERE email = 'carol@corp.test'`,
    );
    expect(carol.rows[0]).toMatchObject({ active_days: 0, uses_tab: false });
  });
});

describe('v_conversation_cost and v_developer_cost_30d', () => {
  it('rolls events up per conversation', async () => {
    const conv = await db.query<{ events: number; cents: number }>(
      `SELECT events::int AS events, charged_cents::float8 AS cents
         FROM v_conversation_cost WHERE conversation_id = 'conv-a'`,
    );
    expect(conv.rows[0]).toMatchObject({ events: 2, cents: 200 });
  });

  it('computes cost per conversation and the max-mode share of spend', async () => {
    const alice = await db.query<{
      conversations: number;
      per_conversation: number;
      max_share: number;
    }>(
      `SELECT conversations::int AS conversations,
              cents_per_conversation::float8 AS per_conversation,
              max_mode_spend_share::float8 AS max_share
         FROM v_developer_cost_30d WHERE email = 'alice@corp.test'`,
    );
    expect(alice.rows[0]!.conversations).toBe(2);
    expect(alice.rows[0]!.per_conversation).toBeCloseTo(125);
    expect(alice.rows[0]!.max_share).toBeCloseTo(0.8);
  });

  it('reports zero rather than null for a seat with no events', async () => {
    const carol = await db.query<{ cents: number; conversations: number }>(
      `SELECT charged_cents::float8 AS cents, conversations::int AS conversations
         FROM v_developer_cost_30d WHERE email = 'carol@corp.test'`,
    );
    expect(carol.rows[0]).toMatchObject({ cents: 0, conversations: 0 });
  });

  it('attributes headless spend separately, since background agents are not a person typing', async () => {
    expect(
      await scalar(
        `SELECT headless_charged_cents::float8 FROM v_developer_cost_30d WHERE email = 'bob@corp.test'`,
      ),
    ).toBe(10);
  });
});

describe('v_weekly_active', () => {
  it('measures activation against licensed seats, not against active users', async () => {
    const row = await db.query<{ active: number; seats: number; rate: number }>(
      `SELECT weekly_active_developers::int AS active, licensed_seats::int AS seats,
              activation_rate::float8 AS rate
         FROM v_weekly_active ORDER BY week_start DESC LIMIT 1`,
    );
    expect(row.rows[0]!.seats).toBe(3);
    expect(row.rows[0]!.rate).toBeCloseTo(row.rows[0]!.active / 3);
  });
});

describe('v_zero_activity_seats', () => {
  it('surfaces the seat that has not been used in 30 days', async () => {
    const rows = await db.query<{ email: string; last_active_day: string }>(
      'SELECT email, last_active_day::text AS last_active_day FROM v_zero_activity_seats',
    );
    expect(rows.rows.map((row) => row.email)).toEqual(['carol@corp.test']);
    expect(rows.rows[0]!.last_active_day).toBeTruthy();
  });
});

describe('spend rollups', () => {
  it('groups spend by model', async () => {
    const rows = await db.query<{ model: string; cents: number }>(
      `SELECT model, SUM(charged_cents)::float8 AS cents FROM v_spend_by_model_daily
        GROUP BY model ORDER BY cents DESC`,
    );
    expect(rows.rows).toEqual([
      { model: 'claude-4.5-sonnet', cents: 200 },
      { model: 'gpt-5', cents: 60 },
    ]);
  });

  it('groups spend by the team dimension we supply, not one Cursor knows about', async () => {
    expect(
      await scalar(
        `SELECT SUM(charged_cents)::float8 FROM v_spend_by_team_weekly WHERE team = 'Platform'`,
      ),
    ).toBe(260);
  });
});

describe('v_adoption_funnel_30d', () => {
  it('steps down from licensed seats to habitual users', async () => {
    const row = await db.query<{
      licensed_seats: number;
      activated: number;
      agent_adopters: number;
      habitual_users: number;
    }>(
      `SELECT licensed_seats::int AS licensed_seats, activated::int AS activated,
              agent_adopters::int AS agent_adopters, habitual_users::int AS habitual_users
         FROM v_adoption_funnel_30d`,
    );
    expect(row.rows[0]).toMatchObject({
      licensed_seats: 3,
      activated: 2,
      agent_adopters: 1,
      habitual_users: 0,
    });
  });
});

describe('v_observed_retention', () => {
  it('reports the earliest window a probe actually found data in', async () => {
    await db.exec(`
      INSERT INTO retention_probe (source, window_start, window_end, rows_returned) VALUES
        ('daily-usage', DATE '2025-01-01', DATE '2025-01-30', 0),
        ('daily-usage', DATE '2025-02-01', DATE '2025-02-28', 12),
        ('daily-usage', DATE '2025-03-01', DATE '2025-03-30', 40);
    `);

    expect(
      await scalar<string>(
        `SELECT earliest_day_with_data::text FROM v_observed_retention WHERE source = 'daily-usage'`,
      ),
    ).toBe('2025-02-01');
  });
});
