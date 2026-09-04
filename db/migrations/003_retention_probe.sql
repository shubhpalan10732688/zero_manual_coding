-- Cursor does not document how far back the usage APIs will serve data, so the
-- backfill CLI probes backwards and records what it actually found. This table is the
-- evidence behind "our history starts on X", which matters once the dashboard makes
-- claims about trends.

CREATE TABLE IF NOT EXISTS retention_probe (
  id                BIGSERIAL PRIMARY KEY,
  probed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  source            TEXT NOT NULL,
  window_start      DATE NOT NULL,
  window_end        DATE NOT NULL,
  rows_returned     INTEGER NOT NULL,
  http_status       INTEGER,
  note              TEXT
);

CREATE INDEX IF NOT EXISTS idx_retention_probe_source ON retention_probe (source, window_start);

CREATE OR REPLACE VIEW v_observed_retention AS
SELECT
  source,
  MIN(window_start) FILTER (WHERE rows_returned > 0) AS earliest_day_with_data,
  MAX(window_end)   FILTER (WHERE rows_returned > 0) AS latest_day_with_data,
  MAX(probed_at)                                     AS last_probed_at
FROM retention_probe
GROUP BY source;
