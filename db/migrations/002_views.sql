-- Metric views. The dashboard reads only from these, never from raw tables, so
-- metric definitions live in one place and the web role needs no table grants.

-- Licensed seats: everyone still on the team.
CREATE OR REPLACE VIEW v_seat AS
SELECT
  m.email,
  m.name,
  m.role,
  COALESCE(d.team, 'Unassigned')        AS team,
  COALESCE(d.cost_center, 'Unassigned') AS cost_center,
  d.manager_email
FROM cursor_member m
LEFT JOIN member_directory d ON d.email = m.email
WHERE NOT m.is_removed;

-- Per-developer per-day with the ratios the raw API does not give us.
CREATE OR REPLACE VIEW v_developer_daily AS
SELECT
  u.email,
  u.day,
  s.team,
  s.cost_center,
  u.is_active,
  u.total_tabs_shown,
  u.total_tabs_accepted,
  u.total_tabs_accepted::numeric / NULLIF(u.total_tabs_shown, 0)                AS tab_acceptance_rate,
  u.total_accepts,
  u.total_rejects,
  u.total_accepts::numeric / NULLIF(u.total_accepts + u.total_rejects, 0)       AS apply_acceptance_rate,
  u.total_applies,
  u.total_lines_added,
  u.accepted_lines_added,
  u.chat_requests,
  u.composer_requests,
  u.agent_requests,
  u.cmdk_usages,
  u.most_used_model,
  u.client_version
FROM cursor_daily_usage u
JOIN v_seat s ON s.email = u.email;

-- Weekly rollup of activity. Weeks are ISO (Monday start).
CREATE OR REPLACE VIEW v_developer_weekly AS
SELECT
  email,
  date_trunc('week', day)::date                                                 AS week_start,
  COUNT(*) FILTER (WHERE is_active)                                             AS active_days,
  SUM(total_tabs_shown)                                                         AS tabs_shown,
  SUM(total_tabs_accepted)                                                      AS tabs_accepted,
  SUM(total_tabs_accepted)::numeric / NULLIF(SUM(total_tabs_shown), 0)          AS tab_acceptance_rate,
  SUM(total_accepts)                                                            AS accepts,
  SUM(total_rejects)                                                            AS rejects,
  SUM(total_accepts)::numeric
    / NULLIF(SUM(total_accepts) + SUM(total_rejects), 0)                        AS apply_acceptance_rate,
  SUM(accepted_lines_added)                                                     AS accepted_lines_added,
  SUM(chat_requests)                                                            AS chat_requests,
  SUM(composer_requests)                                                        AS composer_requests,
  SUM(agent_requests)                                                           AS agent_requests,
  SUM(cmdk_usages)                                                              AS cmdk_usages
FROM v_developer_daily
GROUP BY email, date_trunc('week', day);

-- Team-wide benchmark for the same week, so a developer sees themselves in context
-- without seeing anyone else's numbers. Median, not mean: a few power users would
-- otherwise drag the bar somewhere nobody can reach.
CREATE OR REPLACE VIEW v_weekly_benchmark AS
SELECT
  week_start,
  COUNT(*)                                                                       AS developers,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY tab_acceptance_rate)               AS median_tab_acceptance_rate,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY apply_acceptance_rate)             AS median_apply_acceptance_rate,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY accepted_lines_added)              AS median_accepted_lines_added,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY agent_requests)                    AS median_agent_requests,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY tab_acceptance_rate)              AS p75_tab_acceptance_rate
FROM v_developer_weekly
WHERE active_days > 0
GROUP BY week_start;

-- Which modes has each developer actually touched recently. Drives the
-- "you have never used X" nudges.
CREATE OR REPLACE VIEW v_feature_breadth_14d AS
SELECT
  s.email,
  COALESCE(SUM(u.total_tabs_accepted), 0) > 0 AS uses_tab,
  COALESCE(SUM(u.chat_requests), 0) > 0       AS uses_chat,
  COALESCE(SUM(u.composer_requests), 0) > 0   AS uses_composer,
  COALESCE(SUM(u.agent_requests), 0) > 0      AS uses_agent,
  COALESCE(SUM(u.cmdk_usages), 0) > 0         AS uses_cmdk,
  COALESCE(SUM(u.bugbot_usages), 0) > 0       AS uses_bugbot,
  COALESCE(COUNT(*) FILTER (WHERE u.is_active), 0) AS active_days
FROM v_seat s
LEFT JOIN cursor_daily_usage u
  ON u.email = s.email
 AND u.day >= (CURRENT_DATE - INTERVAL '14 days')
GROUP BY s.email;

-- One row per agent session. conversationId is also the documented join key to the
-- AI Code Tracking API, so this view is the seam for milestone 2.
CREATE OR REPLACE VIEW v_conversation_cost AS
SELECT
  conversation_id,
  MIN(email)                                                   AS email,
  MIN(ts)                                                      AS started_at,
  MAX(ts)                                                      AS ended_at,
  COUNT(*)                                                     AS events,
  SUM(charged_cents)                                           AS charged_cents,
  SUM(charged_cents) FILTER (WHERE max_mode)                   AS max_mode_charged_cents,
  SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))  AS tokens,
  bool_or(is_headless)                                         AS had_headless
FROM cursor_usage_event
WHERE conversation_id IS NOT NULL
GROUP BY conversation_id;

-- Cost efficiency per developer over the trailing 30 days. High cost per
-- conversation with a high max-mode share usually means heavy models on light work.
CREATE OR REPLACE VIEW v_developer_cost_30d AS
SELECT
  s.email,
  s.team,
  COALESCE(SUM(e.charged_cents), 0)                                            AS charged_cents,
  COUNT(DISTINCT e.conversation_id)                                            AS conversations,
  COALESCE(SUM(e.charged_cents), 0)
    / NULLIF(COUNT(DISTINCT e.conversation_id), 0)                             AS cents_per_conversation,
  COALESCE(SUM(e.charged_cents) FILTER (WHERE e.max_mode), 0)
    / NULLIF(SUM(e.charged_cents), 0)                                          AS max_mode_spend_share,
  COALESCE(SUM(e.charged_cents) FILTER (WHERE e.is_headless), 0)               AS headless_charged_cents
FROM v_seat s
LEFT JOIN cursor_usage_event e
  ON e.email = s.email
 AND e.ts >= (now() - INTERVAL '30 days')
GROUP BY s.email, s.team;

-- Adoption. Denominator is licensed seats, which is why daily usage must be
-- ingested with pagination: without it the API returns active users only.
CREATE OR REPLACE VIEW v_weekly_active AS
SELECT
  w.week_start,
  COUNT(*) FILTER (WHERE w.active_days > 0)  AS weekly_active_developers,
  COUNT(*) FILTER (WHERE w.active_days >= 4) AS habitual_developers,
  (SELECT COUNT(*) FROM v_seat)              AS licensed_seats,
  COUNT(*) FILTER (WHERE w.active_days > 0)::numeric
    / NULLIF((SELECT COUNT(*) FROM v_seat), 0) AS activation_rate
FROM v_developer_weekly w
GROUP BY w.week_start;

-- Paid seats with nothing to show for the last 30 days.
CREATE OR REPLACE VIEW v_zero_activity_seats AS
SELECT
  s.email,
  s.name,
  s.team,
  s.cost_center,
  MAX(u.day) FILTER (WHERE u.is_active) AS last_active_day
FROM v_seat s
LEFT JOIN cursor_daily_usage u ON u.email = s.email
GROUP BY s.email, s.name, s.team, s.cost_center
HAVING COALESCE(MAX(u.day) FILTER (WHERE u.is_active), DATE '1970-01-01')
       < (CURRENT_DATE - INTERVAL '30 days');

CREATE OR REPLACE VIEW v_spend_by_model_daily AS
SELECT
  (e.ts AT TIME ZONE 'UTC')::date AS day,
  e.model,
  COUNT(*)                        AS events,
  SUM(e.charged_cents)            AS charged_cents,
  SUM(COALESCE(e.input_tokens, 0))  AS input_tokens,
  SUM(COALESCE(e.output_tokens, 0)) AS output_tokens
FROM cursor_usage_event e
GROUP BY 1, 2;

CREATE OR REPLACE VIEW v_spend_by_team_weekly AS
SELECT
  date_trunc('week', e.ts AT TIME ZONE 'UTC')::date AS week_start,
  s.team,
  COUNT(DISTINCT e.email)  AS developers,
  SUM(e.charged_cents)     AS charged_cents
FROM cursor_usage_event e
JOIN v_seat s ON s.email = e.email
GROUP BY 1, 2;

-- Seats -> any activity -> agent adopters -> habitual users, trailing 30 days.
CREATE OR REPLACE VIEW v_adoption_funnel_30d AS
SELECT
  (SELECT COUNT(*) FROM v_seat) AS licensed_seats,
  COUNT(DISTINCT u.email) FILTER (WHERE u.is_active) AS activated,
  COUNT(DISTINCT u.email) FILTER (WHERE u.agent_requests > 0) AS agent_adopters,
  COUNT(DISTINCT u.email) FILTER (WHERE u.agent_requests > 0 AND u.chat_requests > 0) AS multi_mode_users,
  (
    SELECT COUNT(*) FROM (
      SELECT email
      FROM cursor_daily_usage
      WHERE day >= (CURRENT_DATE - INTERVAL '30 days') AND is_active
      GROUP BY email
      HAVING COUNT(*) >= 15
    ) habitual
  ) AS habitual_users
FROM cursor_daily_usage u
WHERE u.day >= (CURRENT_DATE - INTERVAL '30 days');
