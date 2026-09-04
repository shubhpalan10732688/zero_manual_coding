-- What each agent actually produced, joined from the pull request it opened and the
-- ticket that PR referenced.
--
-- Cursor knows only that an agent ran and what it cost. Whether that was a feature or a
-- bug fix, and whether anything shipped, lives in GitHub and Jira. This table holds that
-- enrichment so the cost data can be reported against real delivered work.

CREATE TABLE IF NOT EXISTS agent_work_item (
  agent_id              TEXT PRIMARY KEY REFERENCES cloud_agent (id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,

  -- Pull request, when the agent opened one.
  pr_number             INTEGER,
  pr_url                TEXT,
  pr_title              TEXT,
  pr_state              TEXT,
  pr_merged             BOOLEAN,
  pr_merged_at          TIMESTAMPTZ,
  pr_author             TEXT,
  additions             INTEGER,
  deletions             INTEGER,
  changed_files         INTEGER,

  -- Ticket, when the branch or PR referenced one.
  ticket_key            TEXT,
  ticket_type           TEXT,
  ticket_summary        TEXT,
  ticket_status         TEXT,
  ticket_status_category TEXT,
  project_key           TEXT,
  project_name          TEXT,

  -- feature | bug | chore | refactor | docs | test | unknown.
  work_type             TEXT NOT NULL DEFAULT 'unknown',
  -- Which source decided it, so a guess is never presented as a fact.
  work_type_source      TEXT NOT NULL DEFAULT 'none',
  summary               TEXT,
  summary_source        TEXT,

  enriched_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_work_item_email ON agent_work_item (email);
CREATE INDEX IF NOT EXISTS idx_agent_work_item_ticket ON agent_work_item (ticket_key);

-- One row per agent: what it cost, and what came out of it.
CREATE OR REPLACE VIEW v_agent_impact AS
SELECT
  a.id                            AS agent_id,
  a.email,
  a.name                          AS agent_name,
  a.repo_url,
  a.created_at,
  e.runs,
  e.raw_cost_cents,
  w.pr_number,
  w.pr_url,
  w.pr_title,
  w.pr_merged,
  w.additions,
  w.deletions,
  w.changed_files,
  w.ticket_key,
  w.ticket_type,
  w.ticket_summary,
  w.ticket_status,
  w.project_key,
  COALESCE(w.work_type, 'unknown')      AS work_type,
  COALESCE(w.work_type_source, 'none')  AS work_type_source,
  -- Falls back to the agent's own title, which Cursor generates from the prompt.
  COALESCE(w.summary, a.name)           AS summary,
  COALESCE(w.summary_source, 'agent_name') AS summary_source,
  -- Shipped means merged, not merely that a pull request exists.
  COALESCE(w.pr_merged, FALSE)          AS shipped,
  -- Distinguishes "we looked and nothing merged" from "enrichment never ran", which
  -- otherwise look identical and would let an unenriched account report total failure.
  (w.agent_id IS NOT NULL)              AS enriched
FROM cloud_agent a
LEFT JOIN v_agent_efficiency e ON e.id = a.id
LEFT JOIN agent_work_item w ON w.agent_id = a.id;

-- Grouped by ticket, which is the unit of work people actually recognise. Agents with no
-- ticket collapse into one honest bucket rather than being spread across invented ones.
CREATE OR REPLACE VIEW v_impact_by_ticket AS
SELECT
  email,
  COALESCE(ticket_key, 'unassigned')                      AS ticket_key,
  MAX(project_key)                                        AS project_key,
  MAX(ticket_type)                                        AS ticket_type,
  MAX(ticket_status)                                      AS ticket_status,
  -- Prefer the ticket's own summary, then a pull request title, then the agent name.
  COALESCE(MAX(ticket_summary), MAX(pr_title), MAX(summary)) AS summary,
  MODE() WITHIN GROUP (ORDER BY work_type)                AS work_type,
  COUNT(*)::int                                           AS agents,
  COALESCE(SUM(runs), 0)::int                             AS runs,
  SUM(raw_cost_cents)                                     AS raw_cost_cents,
  COUNT(*) FILTER (WHERE shipped)::int                    AS shipped_agents,
  COUNT(DISTINCT pr_number) FILTER (WHERE pr_number IS NOT NULL)::int AS pull_requests,
  -- Only merged diffs count. Lines sitting in a draft pull request have not shipped, and
  -- including them would credit an agent for work nobody accepted.
  SUM(additions) FILTER (WHERE shipped)                   AS additions,
  SUM(deletions) FILTER (WHERE shipped)                   AS deletions,
  SUM(changed_files) FILTER (WHERE shipped)               AS changed_files,
  MIN(created_at)                                         AS first_started_at,
  MAX(created_at)                                         AS last_started_at
FROM v_agent_impact
GROUP BY email, COALESCE(ticket_key, 'unassigned');

CREATE OR REPLACE VIEW v_impact_by_type AS
SELECT
  email,
  work_type,
  COUNT(*)::int                        AS agents,
  COUNT(*) FILTER (WHERE shipped)::int AS shipped_agents,
  SUM(raw_cost_cents)                  AS raw_cost_cents,
  SUM(additions) FILTER (WHERE shipped) AS additions,
  SUM(deletions) FILTER (WHERE shipped) AS deletions,
  -- Meaningless where nothing shipped, hence the guard rather than a zero.
  SUM(raw_cost_cents) / NULLIF(COUNT(*) FILTER (WHERE shipped), 0) AS cents_per_shipped
FROM v_agent_impact
GROUP BY email, work_type;

CREATE OR REPLACE VIEW v_impact_summary AS
SELECT
  email,
  COUNT(*)::int                                              AS agents,
  COUNT(*) FILTER (WHERE shipped)::int                        AS shipped_agents,
  COUNT(DISTINCT ticket_key) FILTER (WHERE ticket_key IS NOT NULL)::int AS tickets,
  COUNT(*) FILTER (WHERE work_type = 'feature')::int          AS feature_agents,
  COUNT(*) FILTER (WHERE work_type = 'bug')::int              AS bug_agents,
  COUNT(*) FILTER (WHERE work_type = 'unknown')::int          AS unclassified_agents,
  SUM(raw_cost_cents)                                         AS raw_cost_cents,
  SUM(raw_cost_cents) FILTER (WHERE work_type = 'feature')    AS feature_cents,
  SUM(raw_cost_cents) FILTER (WHERE work_type = 'bug')        AS bug_cents,
  SUM(raw_cost_cents) FILTER (WHERE NOT shipped)              AS unshipped_cents,
  SUM(additions) FILTER (WHERE shipped)                       AS additions,
  SUM(deletions) FILTER (WHERE shipped)                       AS deletions,
  COUNT(*) FILTER (WHERE enriched)::int                       AS enriched_agents,
  -- Opened a pull request that nobody merged. Counted apart from agents that produced
  -- nothing at all, because the two call for different advice.
  COUNT(*) FILTER (WHERE pr_number IS NOT NULL AND NOT shipped)::int AS unmerged_pr_agents,
  SUM(raw_cost_cents) FILTER (WHERE pr_number IS NOT NULL AND NOT shipped) AS unmerged_pr_cents
FROM v_agent_impact
GROUP BY email;
