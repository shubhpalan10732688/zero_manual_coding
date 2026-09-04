import fs from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

/**
 * The workspace read models, against a real Postgres engine.
 *
 * These views exist so a page of twenty board cards is one query rather than sixty, which
 * means their aggregation is doing real work and can be wrong in ways no type checker sees.
 * The cases that matter most are the ones involving absence: a post with no savings figure
 * must not be counted as zero days saved, and a hidden post must leave every total.
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

  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }

  await db.exec(`
    INSERT INTO app_user (email, first_name, last_name, team_name) VALUES
      ('ada@corp.test',   'Ada',   'Lovelace', 'Platform'),
      ('grace@corp.test', 'Grace', 'Hopper',   'Payments'),
      ('alan@corp.test',  NULL,    NULL,       NULL);
  `);

  // Three published posts and one hidden. Only two carry a days-saved figure, and only two
  // carry an effort percentage, so the "how many posts is this total based on" counts differ
  // from the post count — which is the whole point of reporting them.
  await db.exec(`
    INSERT INTO achievement
      (id, author_email, title, ticket_keys, effort_saved_pct, time_saved_days, team_name,
       tags, happened_on, status)
    VALUES
      (1, 'ada@corp.test',   'Config viewer',   ARRAY['VCAP-1192','VCAP-1177'], 60, 2.5, 'Platform', ARRAY['frontend'], current_date - 2,  'published'),
      (2, 'grace@corp.test', 'Ledger drift',    ARRAY['PAY-318'],               40, 1.5, 'Payments', ARRAY['debugging'], current_date - 5,  'published'),
      (3, 'alan@corp.test',  'Codegen cleanup', ARRAY['VCAP-1204'],           NULL, NULL, NULL,      ARRAY['refactor'],  current_date - 40, 'published'),
      (4, 'ada@corp.test',   'Retracted',       ARRAY['VCAP-9999'],            99, 99,   'Platform', ARRAY[]::text[],    current_date - 1,  'hidden');

    INSERT INTO achievement_collaborator (achievement_id, name, email) VALUES
      (1, 'Grace Hopper', 'grace@corp.test'),
      (1, 'Alan Turing',  NULL);

    INSERT INTO achievement_reaction (achievement_id, email, emoji) VALUES
      (1, 'grace@corp.test', '👍'),
      (1, 'alan@corp.test',  '🔥'),
      (2, 'ada@corp.test',   '👍');

    INSERT INTO shared_asset (id, kind, slug, title, body, category, author_email, status, copies) VALUES
      (1, 'command', 'review',  'Review a diff', 'body',  'Review',       'ada@corp.test',   'published', 12),
      (2, 'command', 'tests',   'Write tests',   'body',  'Testing',      'grace@corp.test', 'published',  3),
      (3, 'rule',    'headers', 'Module headers','body',  'Style',        'ada@corp.test',   'published',  7),
      (4, 'rule',    'draft',   'Not ready',     'body',  'Style',        'ada@corp.test',   'draft',      0);

    INSERT INTO shared_asset_vote (asset_id, email) VALUES
      (1, 'grace@corp.test'), (1, 'alan@corp.test'), (2, 'ada@corp.test');

    INSERT INTO resource (id, title, url, kind, submitted_by, featured, repo_stars) VALUES
      (1, 'Graphify',  'https://github.com/corp/graphify', 'repo', 'ada@corp.test',   TRUE,  NULL),
      (2, 'Cookbook',  'https://github.com/x/cookbook',    'repo', 'grace@corp.test', FALSE, 1200),
      (3, 'Some docs', 'https://docs.test',                'doc',  'alan@corp.test',  FALSE, NULL);

    INSERT INTO resource_vote (resource_id, email) VALUES
      (2, 'ada@corp.test'), (2, 'alan@corp.test'), (3, 'ada@corp.test');
  `);
});

afterAll(async () => {
  await db?.close();
});

describe('v_achievement_card', () => {
  it('names the author from their first and last name', async () => {
    expect(await scalar<string>('SELECT author_name FROM v_achievement_card WHERE id = 1')).toBe(
      'Ada Lovelace',
    );
  });

  it('falls back to the email when no name is recorded', async () => {
    expect(await scalar<string>('SELECT author_name FROM v_achievement_card WHERE id = 3')).toBe(
      'alan@corp.test',
    );
  });

  it('counts reactions per post', async () => {
    expect(await scalar('SELECT reactions FROM v_achievement_card WHERE id = 1')).toBe(2);
    expect(await scalar('SELECT reactions FROM v_achievement_card WHERE id = 3')).toBe(0);
  });

  it('aggregates collaborators, including one with no account', async () => {
    const names = await scalar<string[]>(
      'SELECT collaborator_names FROM v_achievement_card WHERE id = 1',
    );
    expect(names).toEqual(['Alan Turing', 'Grace Hopper']);
  });

  it('returns an empty array rather than null when there were no collaborators', async () => {
    expect(
      await scalar<string[]>('SELECT collaborator_names FROM v_achievement_card WHERE id = 3'),
    ).toEqual([]);
  });

  it('inherits the team from the author when the post did not state one', async () => {
    expect(await scalar<string>('SELECT team_name FROM v_achievement_card WHERE id = 2')).toBe(
      'Payments',
    );
  });

  it('keeps hidden posts readable, so their author can still find them', async () => {
    expect(await scalar('SELECT COUNT(*)::int FROM v_achievement_card')).toBe(4);
    expect(await scalar<string>('SELECT status FROM v_achievement_card WHERE id = 4')).toBe(
      'hidden',
    );
  });
});

describe('v_board_totals', () => {
  it('counts only published posts', async () => {
    expect(await scalar('SELECT posts FROM v_board_totals')).toBe(3);
  });

  it('counts distinct contributors', async () => {
    expect(await scalar('SELECT contributors FROM v_board_totals')).toBe(3);
  });

  it('counts recent posts separately from all of them', async () => {
    expect(await scalar('SELECT posts_30d FROM v_board_totals')).toBe(2);
  });

  it('sums self-reported days without letting a hidden post inflate it', async () => {
    expect(Number(await scalar('SELECT days_saved FROM v_board_totals'))).toBeCloseTo(4, 5);
  });

  it('reports how many posts the days figure rests on', async () => {
    expect(await scalar('SELECT posts_with_days FROM v_board_totals')).toBe(2);
  });

  it('averages effort over the posts that stated one, not over all posts', async () => {
    expect(Number(await scalar('SELECT avg_effort_saved_pct FROM v_board_totals'))).toBeCloseTo(
      50,
      5,
    );
    expect(await scalar('SELECT posts_with_effort FROM v_board_totals')).toBe(2);
  });

  it('counts every ticket reference, including the two on one post', async () => {
    expect(await scalar('SELECT tickets_referenced FROM v_board_totals')).toBe(4);
  });
});

describe('v_board_leaderboard', () => {
  it('gives one row per contributor', async () => {
    expect(await scalar('SELECT COUNT(*)::int FROM v_board_leaderboard')).toBe(3);
  });

  it('attributes days only to the person who reported them', async () => {
    expect(
      Number(await scalar("SELECT days_saved FROM v_board_leaderboard WHERE email = 'ada@corp.test'")),
    ).toBeCloseTo(2.5, 5);
  });

  it('reports zero rather than null for someone who saved nothing measurable', async () => {
    expect(
      Number(await scalar("SELECT days_saved FROM v_board_leaderboard WHERE email = 'alan@corp.test'")),
    ).toBe(0);
  });
});

describe('v_shared_asset_card', () => {
  it('counts votes per asset', async () => {
    expect(await scalar('SELECT votes FROM v_shared_asset_card WHERE id = 1')).toBe(2);
    expect(await scalar('SELECT votes FROM v_shared_asset_card WHERE id = 3')).toBe(0);
  });

  it('keeps a draft visible in the view, since the author has to be able to open it', async () => {
    expect(await scalar<string>('SELECT status FROM v_shared_asset_card WHERE id = 4')).toBe(
      'draft',
    );
  });

  it('names the author', async () => {
    expect(await scalar<string>('SELECT author_name FROM v_shared_asset_card WHERE id = 2')).toBe(
      'Grace Hopper',
    );
  });
});

describe('v_resource_card', () => {
  it('counts votes', async () => {
    expect(await scalar('SELECT votes FROM v_resource_card WHERE id = 2')).toBe(2);
    expect(await scalar('SELECT votes FROM v_resource_card WHERE id = 1')).toBe(0);
  });

  it('leaves an unknown star count null rather than zero', async () => {
    expect(await scalar('SELECT repo_stars FROM v_resource_card WHERE id = 1')).toBeNull();
  });

  it('carries the featured flag through', async () => {
    expect(await scalar<boolean>('SELECT featured FROM v_resource_card WHERE id = 1')).toBe(true);
  });
});

describe('cascade behaviour', () => {
  it('removes a person and everything they wrote, leaving other totals intact', async () => {
    await db.exec("DELETE FROM app_user WHERE email = 'grace@corp.test'");

    expect(await scalar('SELECT COUNT(*)::int FROM achievement')).toBe(3);
    expect(await scalar('SELECT posts FROM v_board_totals')).toBe(2);
    // Her reaction on Ada's post goes with her; the post itself does not.
    expect(await scalar('SELECT reactions FROM v_achievement_card WHERE id = 1')).toBe(1);
    expect(await scalar('SELECT votes FROM v_shared_asset_card WHERE id = 1')).toBe(1);
  });
});
