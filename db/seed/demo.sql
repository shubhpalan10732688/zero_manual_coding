-- Demo data for local development. Deliberately synthetic and deterministic: no
-- randomness, no real people, so screenshots and manual testing are reproducible.
-- Never load this into an environment that also ingests real data.

TRUNCATE cursor_usage_event, cursor_daily_usage, member_directory, cursor_member, ingest_run,
         retention_probe RESTART IDENTITY;

INSERT INTO cursor_member (email, user_id, name, role, is_removed) VALUES
  ('ada@corp.test',     'user_1',  'Ada Lovelace',     'owner',  FALSE),
  ('grace@corp.test',   'user_2',  'Grace Hopper',     'member', FALSE),
  ('alan@corp.test',    'user_3',  'Alan Turing',      'member', FALSE),
  ('katherine@corp.test','user_4', 'Katherine Johnson','member', FALSE),
  ('linus@corp.test',   'user_5',  'Linus Pauling',    'member', FALSE),
  ('barbara@corp.test', 'user_6',  'Barbara Liskov',   'member', FALSE),
  ('edsger@corp.test',  'user_7',  'Edsger Dijkstra',  'member', FALSE),
  ('margaret@corp.test','user_8',  'Margaret Hamilton','member', FALSE),
  ('donald@corp.test',  'user_9',  'Donald Knuth',     'member', FALSE),
  ('radia@corp.test',   'user_10', 'Radia Perlman',    'member', FALSE),
  ('jean@corp.test',    'user_11', 'Jean Bartik',      'member', FALSE),
  ('claude@corp.test',  'user_12', 'Claude Shannon',   'member', TRUE);

INSERT INTO member_directory (email, team, cost_center) VALUES
  ('ada@corp.test',      'Platform',   'CC-100'),
  ('grace@corp.test',    'Platform',   'CC-100'),
  ('alan@corp.test',     'Platform',   'CC-100'),
  ('katherine@corp.test','Payments',   'CC-200'),
  ('linus@corp.test',    'Payments',   'CC-200'),
  ('barbara@corp.test',  'Payments',   'CC-200'),
  ('edsger@corp.test',   'Data',       'CC-300'),
  ('margaret@corp.test', 'Data',       'CC-300'),
  ('donald@corp.test',   'Mobile',     'CC-400'),
  ('radia@corp.test',    'Mobile',     'CC-400');
  -- jean@corp.test is deliberately absent, to exercise the Unassigned fallback.

-- Per-developer behaviour profiles, then 12 weeks of days derived arithmetically.
WITH profile (email, activity, tab_rate, agent_level, chat_level, cmdk_level) AS (
  VALUES
    ('ada@corp.test',       6, 0.46, 9, 14, 6),
    ('grace@corp.test',     5, 0.38, 7, 11, 4),
    ('alan@corp.test',      5, 0.31, 4, 18, 0),
    ('katherine@corp.test', 4, 0.28, 3,  9, 2),
    ('linus@corp.test',     4, 0.12, 0, 22, 0),
    ('barbara@corp.test',   3, 0.22, 2,  6, 1),
    ('edsger@corp.test',    5, 0.41, 6, 10, 5),
    ('margaret@corp.test',  2, 0.18, 0,  4, 0),
    ('donald@corp.test',    3, 0.09, 1, 12, 0),
    ('radia@corp.test',     4, 0.33, 5,  8, 3)
),
day AS (SELECT generate_series(0, 83) AS ago)
INSERT INTO cursor_daily_usage
  (email, day, is_active, total_tabs_shown, total_tabs_accepted, total_accepts, total_rejects,
   total_applies, total_lines_added, accepted_lines_added, chat_requests, composer_requests,
   agent_requests, cmdk_usages, most_used_model, client_version)
SELECT
  p.email,
  CURRENT_DATE - d.ago,
  active.is_active,
  CASE WHEN active.is_active THEN 60 + p.activity * 22 + (d.ago % 7) * 9 ELSE 0 END,
  CASE WHEN active.is_active
       THEN ROUND((60 + p.activity * 22 + (d.ago % 7) * 9) * (p.tab_rate + ((d.ago % 5) - 2) * 0.012))
       ELSE 0 END,
  CASE WHEN active.is_active THEN 4 + p.activity * 2 + (d.ago % 3) ELSE 0 END,
  CASE WHEN active.is_active THEN 2 + (d.ago % 4) ELSE 0 END,
  CASE WHEN active.is_active THEN 8 + p.activity * 3 ELSE 0 END,
  CASE WHEN active.is_active THEN 120 + p.activity * 60 + (d.ago % 11) * 14 ELSE 0 END,
  CASE WHEN active.is_active THEN 40 + p.activity * 34 + (d.ago % 9) * 7 ELSE 0 END,
  CASE WHEN active.is_active THEN p.chat_level + (d.ago % 4) ELSE 0 END,
  CASE WHEN active.is_active THEN GREATEST(p.agent_level - 2, 0) + (d.ago % 3) ELSE 0 END,
  CASE WHEN active.is_active THEN p.agent_level + (d.ago % 3) ELSE 0 END,
  CASE WHEN active.is_active THEN p.cmdk_level ELSE 0 END,
  CASE WHEN p.activity >= 5 THEN 'claude-4.5-sonnet' ELSE 'auto' END,
  '1.5.2'
FROM profile p
CROSS JOIN day d
CROSS JOIN LATERAL (
  -- `activity` is how many weekdays a week this person works in Cursor, so a profile
  -- of 5 is active Monday to Friday and a profile of 2 only Monday and Tuesday.
  SELECT EXTRACT(ISODOW FROM CURRENT_DATE - d.ago) <= LEAST(p.activity, 5) AS is_active
) active;

-- Jean holds a seat and stopped using it two months ago.
INSERT INTO cursor_daily_usage (email, day, is_active, total_tabs_shown, total_tabs_accepted)
SELECT 'jean@corp.test', CURRENT_DATE - g.ago, g.ago > 55, 40, 9
  FROM generate_series(40, 70) AS g(ago);

-- One usage event per active day per developer, alternating model and max mode so the
-- cost views have something to separate.
INSERT INTO cursor_usage_event
  (event_key, ts, email, model, kind, max_mode, is_headless, is_chargeable, charged_cents,
   conversation_id, input_tokens, output_tokens)
SELECT
  md5(u.email || u.day::text || s.n::text),
  u.day::timestamptz + (9 + s.n) * INTERVAL '1 hour',
  u.email,
  CASE (s.n + u.agent_requests) % 3
    WHEN 0 THEN 'claude-4.5-sonnet'
    WHEN 1 THEN 'gpt-5'
    ELSE 'composer-2.5'
  END,
  'Usage-based',
  (s.n + u.agent_requests) % 4 = 0,
  FALSE,
  TRUE,
  18 + ((s.n * 7 + u.agent_requests * 13) % 90),
  'conv-' || md5(u.email || u.day::text || (s.n / 2)::text),
  2400 + (s.n * 311) % 5000,
  300 + (s.n * 97) % 900
FROM cursor_daily_usage u
CROSS JOIN generate_series(1, 4) AS s(n)
WHERE u.is_active AND u.day >= CURRENT_DATE - 35;

INSERT INTO ingest_run (source, window_start, window_end, rows_written, status, ran_at) VALUES
  ('members',      NULL,                                  NULL,                                 12,   'succeeded', now() - INTERVAL '4 hours'),
  ('daily-usage',  (CURRENT_DATE - 3)::timestamptz,       (CURRENT_DATE)::timestamptz,          640,  'succeeded', now() - INTERVAL '4 hours'),
  ('usage-events', (CURRENT_DATE - 3)::timestamptz,       (CURRENT_DATE)::timestamptz,          1820, 'succeeded', now() - INTERVAL '4 hours');

INSERT INTO retention_probe (source, window_start, window_end, rows_returned) VALUES
  ('daily-usage',  CURRENT_DATE - 120, CURRENT_DATE - 91, 0),
  ('daily-usage',  CURRENT_DATE - 90,  CURRENT_DATE - 61, 210),
  ('daily-usage',  CURRENT_DATE - 60,  CURRENT_DATE - 31, 240),
  ('usage-events', CURRENT_DATE - 90,  CURRENT_DATE - 61, 0),
  ('usage-events', CURRENT_DATE - 60,  CURRENT_DATE - 31, 1400);
