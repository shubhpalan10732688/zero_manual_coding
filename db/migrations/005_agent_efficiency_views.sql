-- Efficiency views for the self-service Cloud Agent dashboard.
--
-- A note on cost, because the two numbers mean different things. raw_cost_cents is what
-- the tokens were worth at list price; charged_cents is what the subscription actually
-- billed, and is frequently zero. Anything framed as a saving here is the gap between
-- them, or spend on work that produced nothing, never a projection of a bill.

CREATE OR REPLACE VIEW v_agent_run_detail AS
SELECT
  r.id,
  r.agent_id,
  r.email,
  a.name AS agent_name,
  r.status,
  r.created_at,
  r.duration_ms,
  COALESCE(r.repo_url, a.repo_url) AS repo_url,
  COALESCE(
    NULLIF(
      regexp_replace(COALESCE(r.repo_url, a.repo_url), '^(https?://)?(www\.)?github\.com/', ''),
      ''
    ),
    'unknown'
  ) AS repo,
  r.branch,
  r.pr_url,
  r.input_tokens,
  r.output_tokens,
  r.cache_read_tokens,
  r.cache_write_tokens,
  r.total_tokens,
  r.raw_cost_cents,
  r.charged_cents,
  -- Share of the context that came from cache rather than being sent fresh. Cached
  -- reads are billed far below fresh input, so this is the main efficiency dial.
  r.cache_read_tokens::numeric
    / NULLIF(r.cache_read_tokens + r.input_tokens + r.cache_write_tokens, 0) AS cache_reuse_rate,
  -- A run that filled the cache and never read from it paid to build context that
  -- nothing reused.
  (r.cache_write_tokens > 0 AND r.cache_read_tokens = 0) AS is_cold_start,
  (r.status = 'FINISHED') AS finished,
  r.raw_cost_cents / NULLIF(r.total_tokens, 0) * 1000 AS cents_per_1k_tokens
FROM cloud_agent_run r
LEFT JOIN cloud_agent a ON a.id = r.agent_id;

CREATE OR REPLACE VIEW v_agent_efficiency AS
SELECT
  a.id,
  a.email,
  a.name,
  a.status,
  a.repo_url,
  a.agent_url,
  a.created_at,
  a.total_tokens,
  a.raw_cost_cents,
  a.charged_cents,
  a.cache_read_tokens::numeric
    / NULLIF(a.cache_read_tokens + a.input_tokens + a.cache_write_tokens, 0) AS cache_reuse_rate,
  COUNT(r.id)::int                                        AS runs,
  COUNT(r.id) FILTER (WHERE r.status = 'FINISHED')::int    AS finished_runs,
  COUNT(r.id) FILTER (WHERE r.pr_url IS NOT NULL)::int     AS runs_with_pr,
  COUNT(DISTINCT r.pr_url)::int                            AS pull_requests,
  SUM(r.duration_ms)                                       AS total_duration_ms,
  a.raw_cost_cents / NULLIF(COUNT(r.id), 0)                AS raw_cents_per_run
FROM cloud_agent a
LEFT JOIN cloud_agent_run r ON r.agent_id = a.id
GROUP BY a.id;

CREATE OR REPLACE VIEW v_agent_user_summary AS
SELECT
  a.email,
  COUNT(DISTINCT a.id)::int                       AS agents,
  COALESCE(SUM(e.runs), 0)::int                   AS runs,
  COALESCE(SUM(e.pull_requests), 0)::int          AS pull_requests,
  SUM(a.total_tokens)                             AS total_tokens,
  SUM(a.raw_cost_cents)                           AS raw_cost_cents,
  SUM(a.charged_cents)                            AS charged_cents,
  -- What the plan covered rather than what you avoided spending.
  SUM(a.raw_cost_cents) - SUM(a.charged_cents)    AS subscription_absorbed_cents,
  SUM(a.cache_read_tokens)::numeric
    / NULLIF(SUM(a.cache_read_tokens + a.input_tokens + a.cache_write_tokens), 0)
                                                  AS cache_reuse_rate,
  MIN(a.created_at)                               AS first_agent_at,
  MAX(a.created_at)                               AS last_agent_at
FROM cloud_agent a
LEFT JOIN v_agent_efficiency e ON e.id = a.id
GROUP BY a.email;

-- The recoverable patterns, per user. Each is money already spent on work that either
-- produced nothing or rebuilt context it could have reused.
--
-- Note the deliberate asymmetry: cold starts and unfinished work are judged per run,
-- but "produced no pull request" is judged per agent. A follow-up run inside an agent
-- that did open a PR is part of that PR's cost, not waste, and counting it as waste
-- would indict normal iteration.
CREATE OR REPLACE VIEW v_agent_waste AS
WITH runs AS (
  SELECT
    email,
    SUM(raw_cost_cents) FILTER (WHERE is_cold_start)  AS cold_start_cents,
    COUNT(*) FILTER (WHERE is_cold_start)::int        AS cold_start_runs,
    SUM(raw_cost_cents) FILTER (WHERE NOT finished)   AS unfinished_cents,
    COUNT(*) FILTER (WHERE NOT finished)::int         AS unfinished_runs,
    SUM(raw_cost_cents)                               AS total_cents,
    COUNT(*)::int                                     AS total_runs
  FROM v_agent_run_detail
  GROUP BY email
),
agents AS (
  SELECT
    email,
    SUM(raw_cost_cents) FILTER (WHERE pull_requests = 0) AS no_pr_cents,
    COUNT(*) FILTER (WHERE pull_requests = 0)::int       AS no_pr_agents,
    COUNT(*)::int                                        AS total_agents,
    MAX(raw_cost_cents)                                  AS costliest_agent_cents
  FROM v_agent_efficiency
  GROUP BY email
)
SELECT
  r.email,
  COALESCE(r.cold_start_cents, 0)  AS cold_start_cents,
  r.cold_start_runs,
  COALESCE(r.unfinished_cents, 0)  AS unfinished_cents,
  r.unfinished_runs,
  COALESCE(a.no_pr_cents, 0)       AS no_pr_cents,
  a.no_pr_agents,
  a.total_agents,
  r.total_cents,
  r.total_runs,
  -- How lopsided the spend is. One runaway agent is the most common cost story.
  a.costliest_agent_cents / NULLIF(r.total_cents, 0) AS costliest_agent_share
FROM runs r
JOIN agents a ON a.email = r.email;

CREATE OR REPLACE VIEW v_agent_repo_activity AS
SELECT
  a.email,
  -- Repo URLs arrive both as full https URLs and as bare github.com paths, sometimes
  -- for the same repository, so both forms collapse to owner/name.
  COALESCE(
    NULLIF(regexp_replace(a.repo_url, '^(https?://)?(www\.)?github\.com/', ''), ''),
    'unknown'
  )                                                 AS repo,
  COUNT(DISTINCT a.id)::int                         AS agents,
  COALESCE(SUM(e.runs), 0)::int                     AS runs,
  COALESCE(SUM(e.pull_requests), 0)::int            AS pull_requests,
  SUM(a.raw_cost_cents)                             AS raw_cost_cents
FROM cloud_agent a
LEFT JOIN v_agent_efficiency e ON e.id = a.id
GROUP BY a.email, 2;

CREATE OR REPLACE VIEW v_agent_daily AS
SELECT
  email,
  (created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*)::int                         AS runs,
  SUM(raw_cost_cents)                   AS raw_cost_cents,
  SUM(total_tokens)                     AS total_tokens,
  AVG(cache_reuse_rate)                 AS cache_reuse_rate
FROM v_agent_run_detail
WHERE created_at IS NOT NULL
GROUP BY email, 2;

-- Cost against position in the conversation. Each follow-up carries the whole prior
-- context, so later runs in an agent tend to cost more than the first. Averaging by
-- position across agents shows whether that curve is steep enough to be worth acting on.
CREATE OR REPLACE VIEW v_agent_run_position AS
WITH ordered AS (
  SELECT
    email,
    agent_id,
    raw_cost_cents,
    total_tokens,
    ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY created_at) AS run_number
  FROM v_agent_run_detail
  WHERE created_at IS NOT NULL
)
SELECT
  email,
  run_number::int,
  COUNT(*)::int        AS runs,
  AVG(raw_cost_cents)  AS avg_raw_cost_cents,
  AVG(total_tokens)    AS avg_total_tokens
FROM ordered
GROUP BY email, run_number;

-- Connection health, for the dashboard footer and the refresh job.
CREATE OR REPLACE VIEW v_connected_user AS
SELECT
  u.email,
  u.first_name,
  u.last_name,
  k.key_name,
  k.connected_at,
  k.last_validated_at,
  k.last_used_at,
  k.last_error,
  (k.email IS NOT NULL) AS has_key
FROM app_user u
LEFT JOIN user_api_key k ON k.email = u.email;
