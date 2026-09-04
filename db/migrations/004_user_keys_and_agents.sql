-- Self-service mode: a person connects their own Cursor user key and gets their own
-- Cloud Agent history back. Separate from the Admin API tables, because this data has a
-- different owner, a different key and a different blast radius.

CREATE TABLE IF NOT EXISTS app_user (
  email           TEXT PRIMARY KEY,
  cursor_user_id  BIGINT,
  first_name      TEXT,
  last_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Someone else's credential, at rest. The plaintext never lands here: ciphertext, iv
-- and auth_tag come from AES-256-GCM, and the master key lives outside the database, so
-- a database dump on its own reveals nothing usable.
CREATE TABLE IF NOT EXISTS user_api_key (
  email             TEXT PRIMARY KEY REFERENCES app_user (email) ON DELETE CASCADE,
  key_name          TEXT,
  -- SHA-256 prefix. Lets us recognise a re-submitted key without decrypting.
  key_fingerprint   TEXT NOT NULL,
  ciphertext        BYTEA NOT NULL,
  iv                BYTEA NOT NULL,
  auth_tag          BYTEA NOT NULL,
  key_version       INTEGER NOT NULL DEFAULT 1,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_validated_at TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ,
  last_error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_api_key_fingerprint ON user_api_key (key_fingerprint);

CREATE TABLE IF NOT EXISTS cloud_agent (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL,
  name                TEXT,
  status              TEXT,
  env_type            TEXT,
  env_name            TEXT,
  repo_url            TEXT,
  agent_url           TEXT,
  latest_run_id       TEXT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ,
  -- Rolled up from /v1/agents/{id}/usage.
  input_tokens        BIGINT NOT NULL DEFAULT 0,
  output_tokens       BIGINT NOT NULL DEFAULT 0,
  cache_write_tokens  BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens   BIGINT NOT NULL DEFAULT 0,
  total_tokens        BIGINT NOT NULL DEFAULT 0,
  -- raw_cost_cents is what the work was worth at list price; charged_cents is what the
  -- subscription actually billed. They are usually different and both are interesting.
  raw_cost_cents      NUMERIC(14, 6) NOT NULL DEFAULT 0,
  charged_cents       NUMERIC(14, 6) NOT NULL DEFAULT 0,
  usage_fetched_at    TIMESTAMPTZ,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cloud_agent_email ON cloud_agent (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_agent_repo ON cloud_agent (repo_url);

CREATE TABLE IF NOT EXISTS cloud_agent_run (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  email               TEXT NOT NULL,
  status              TEXT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ,
  duration_ms         BIGINT,
  repo_url            TEXT,
  branch              TEXT,
  pr_url              TEXT,
  input_tokens        BIGINT NOT NULL DEFAULT 0,
  output_tokens       BIGINT NOT NULL DEFAULT 0,
  cache_write_tokens  BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens   BIGINT NOT NULL DEFAULT 0,
  total_tokens        BIGINT NOT NULL DEFAULT 0,
  raw_cost_cents      NUMERIC(14, 6) NOT NULL DEFAULT 0,
  charged_cents       NUMERIC(14, 6) NOT NULL DEFAULT 0,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cloud_agent_run_agent ON cloud_agent_run (agent_id);
CREATE INDEX IF NOT EXISTS idx_cloud_agent_run_email ON cloud_agent_run (email, created_at DESC);
