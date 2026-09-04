-- Core warehouse tables for Cursor Admin API data.
--
-- Everything joins on email. userId is a number in /teams/daily-usage-data but an
-- encoded user_... string in /teams/members, so it is not a safe join key.

CREATE TABLE IF NOT EXISTS cursor_member (
  email           TEXT PRIMARY KEY,
  user_id         TEXT,
  name            TEXT,
  role            TEXT,
  is_removed      BOOLEAN     NOT NULL DEFAULT FALSE,
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Org-supplied dimensions the Cursor API does not know about. Populated by you,
-- never overwritten by ingestion, so team and cost-center rollups survive re-ingest.
CREATE TABLE IF NOT EXISTS member_directory (
  email           TEXT PRIMARY KEY,
  team            TEXT,
  cost_center     TEXT,
  manager_email   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cursor_daily_usage (
  email                       TEXT NOT NULL,
  day                         DATE NOT NULL,
  user_id                     BIGINT,
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
  total_lines_added           INTEGER NOT NULL DEFAULT 0,
  total_lines_deleted         INTEGER NOT NULL DEFAULT 0,
  accepted_lines_added        INTEGER NOT NULL DEFAULT 0,
  accepted_lines_deleted      INTEGER NOT NULL DEFAULT 0,
  total_applies               INTEGER NOT NULL DEFAULT 0,
  total_accepts               INTEGER NOT NULL DEFAULT 0,
  total_rejects               INTEGER NOT NULL DEFAULT 0,
  total_tabs_shown            INTEGER NOT NULL DEFAULT 0,
  total_tabs_accepted         INTEGER NOT NULL DEFAULT 0,
  composer_requests           INTEGER NOT NULL DEFAULT 0,
  chat_requests               INTEGER NOT NULL DEFAULT 0,
  agent_requests              INTEGER NOT NULL DEFAULT 0,
  cmdk_usages                 INTEGER NOT NULL DEFAULT 0,
  bugbot_usages               INTEGER NOT NULL DEFAULT 0,
  most_used_model             TEXT,
  apply_most_used_extension   TEXT,
  tab_most_used_extension     TEXT,
  client_version              TEXT,
  ingested_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_day ON cursor_daily_usage (day);
CREATE INDEX IF NOT EXISTS idx_daily_usage_active ON cursor_daily_usage (day) WHERE is_active;

-- /teams/filtered-usage-events has no event identifier, so event_key is a synthetic
-- hash of the identifying fields. Two genuinely identical events in the same
-- millisecond collapse into one row; that is the accepted trade for idempotent re-ingest.
CREATE TABLE IF NOT EXISTS cursor_usage_event (
  event_key           TEXT PRIMARY KEY,
  ts                  TIMESTAMPTZ NOT NULL,
  email               TEXT,
  model               TEXT,
  kind                TEXT,
  max_mode            BOOLEAN,
  is_headless         BOOLEAN,
  is_chargeable       BOOLEAN,
  is_token_based_call BOOLEAN,
  requests_costs      NUMERIC(12, 4),
  charged_cents       NUMERIC(12, 5) NOT NULL DEFAULT 0,
  cursor_token_fee    NUMERIC(12, 5),
  input_tokens        BIGINT,
  output_tokens       BIGINT,
  cache_read_tokens   BIGINT,
  cache_write_tokens  BIGINT,
  conversation_id     TEXT,
  service_account_id  TEXT,
  cloud_agent_id      TEXT,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_event_ts ON cursor_usage_event (ts);
CREATE INDEX IF NOT EXISTS idx_usage_event_email_ts ON cursor_usage_event (email, ts);
CREATE INDEX IF NOT EXISTS idx_usage_event_conversation ON cursor_usage_event (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingest_run (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  window_start  TIMESTAMPTZ,
  window_end    TIMESTAMPTZ,
  rows_written  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ran_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingest_run_source ON ingest_run (source, started_at DESC);
