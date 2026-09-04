-- The shared workspace behind /app: who is signed in, which of their own systems they have
-- connected, and the content the organisation writes for itself.
--
-- Everything before this migration is a warehouse: rows arrive from an API and nobody edits
-- them. These tables are the opposite. They are written by people through the web app, so
-- they carry an author, a timestamp and a moderation state, and they are deliberately kept
-- apart from the ingested tables so a bad post can never corrupt a metric.

-- ---------------------------------------------------------------- accounts and sessions

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- Free text on purpose. Squad names in a large organisation are neither stable nor
-- authoritative anywhere we can read them, so the person who knows theirs types it.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS job_title TEXT;

-- A session is a row rather than only a signed cookie, so signing out actually revokes and
-- an admin can see who has an open session. Only the hash is stored: a database dump then
-- contains nothing that can be replayed as a login.
CREATE TABLE IF NOT EXISTS app_session (
  token_hash   TEXT PRIMARY KEY,
  email        TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_session_email ON app_session (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_session_expiry ON app_session (expires_at);

-- ---------------------------------------------------------------- connected systems

-- GitHub and Jira credentials, one row per person per provider. Cursor's own connectors
-- cannot be read or created through any API, so this is not a mirror of them: it is the
-- separate credential this app needs to read pull request and ticket state itself.
--
-- Sealed with the same AES-256-GCM envelope as user_api_key, for the same reason: the
-- plaintext is someone else's credential and must not survive a database dump.
CREATE TABLE IF NOT EXISTS user_integration (
  email             TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('github', 'jira')),
  -- Who the credential turned out to belong to, as reported by the provider.
  account_label     TEXT,
  -- Jira only: the site the token authenticates against.
  base_url          TEXT,
  -- Jira basic auth needs the account email alongside the token.
  account_email     TEXT,
  secret_ciphertext BYTEA NOT NULL,
  secret_iv         BYTEA NOT NULL,
  secret_auth_tag   BYTEA NOT NULL,
  key_version       INTEGER NOT NULL DEFAULT 1,
  scopes            TEXT,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_validated_at TIMESTAMPTZ,
  last_error        TEXT,
  PRIMARY KEY (email, provider)
);

-- ---------------------------------------------------------------- Zero Manual Coding Board

-- One delivered piece of work, written up by the person who delivered it.
--
-- The form asks for four of these columns: the title, what was delivered, and the two
-- savings. The rest stay here and stay nullable, because they are worth having when somebody
-- does record them and a column is far cheaper to leave empty than to add back later.
--
-- Keeping the savings as their own numeric columns rather than part of a free-text body is
-- what makes the board summable — "142 days saved this quarter" is only possible if the
-- saving was ever a number.
CREATE TABLE IF NOT EXISTS achievement (
  id                  BIGSERIAL PRIMARY KEY,
  author_email        TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  -- Ticket keys as typed, e.g. {VCAP-1192}. Uppercased on write so filters are stable.
  ticket_keys         TEXT[] NOT NULL DEFAULT '{}',
  repo                TEXT,
  pr_url              TEXT,
  context             TEXT,
  delivered           TEXT,
  help_planning       TEXT,
  help_implementation TEXT,
  benefits_note       TEXT,
  -- Self-reported, and labelled as such everywhere it is shown. Never mixed into the
  -- measured cost figures that come from the Cursor API.
  effort_saved_pct    NUMERIC(5, 2) CHECK (effort_saved_pct IS NULL OR (effort_saved_pct >= 0 AND effort_saved_pct <= 100)),
  time_saved_days     NUMERIC(6, 2) CHECK (time_saved_days IS NULL OR time_saved_days >= 0),
  team_name           TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  happened_on         DATE NOT NULL DEFAULT current_date,
  status              TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievement_recent ON achievement (happened_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_achievement_author ON achievement (author_email, happened_on DESC);
CREATE INDEX IF NOT EXISTS idx_achievement_team ON achievement (team_name);

-- Credit for work that was not done alone. Names are free text because a collaborator may
-- not have signed in here yet, and the email is filled in when they can be matched.
CREATE TABLE IF NOT EXISTS achievement_collaborator (
  achievement_id BIGINT NOT NULL REFERENCES achievement (id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT,
  PRIMARY KEY (achievement_id, name)
);

CREATE TABLE IF NOT EXISTS achievement_reaction (
  achievement_id BIGINT NOT NULL REFERENCES achievement (id) ON DELETE CASCADE,
  email          TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  emoji          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (achievement_id, email, emoji)
);

-- ---------------------------------------------------------------- commands and rules

-- Cursor exposes no API for team rules or commands: the dashboard is the only place they
-- exist, and the Admin API reports only that one changed. So this is not a sync of them.
-- It is the organisation's own catalogue, which people copy into .cursor/ or into the
-- Cursor dashboard themselves, with an author's name attached so the good ones spread.
CREATE TABLE IF NOT EXISTS shared_asset (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('command', 'rule')),
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  body          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'General',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  -- Rules only: which files the rule should apply to, and whether it always applies.
  glob_pattern  TEXT,
  always_apply  BOOLEAN NOT NULL DEFAULT FALSE,
  author_email  TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  -- How many times someone copied it. The only adoption signal available to us, since we
  -- cannot see what anyone actually installed.
  copies        INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS idx_shared_asset_kind ON shared_asset (kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_asset_author ON shared_asset (author_email);

CREATE TABLE IF NOT EXISTS shared_asset_vote (
  asset_id   BIGINT NOT NULL REFERENCES shared_asset (id) ON DELETE CASCADE,
  email      TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, email)
);

-- ---------------------------------------------------------------- resources

CREATE TABLE IF NOT EXISTS resource (
  id           BIGSERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,
  kind         TEXT NOT NULL DEFAULT 'repo' CHECK (kind IN ('repo', 'doc', 'tool', 'video', 'course')),
  description  TEXT,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  -- Filled in opportunistically from the GitHub API; null means never looked up rather
  -- than zero stars.
  repo_stars   INTEGER,
  repo_slug    TEXT,
  stars_at     TIMESTAMPTZ,
  featured     BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_by TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_kind ON resource (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS resource_vote (
  resource_id BIGINT NOT NULL REFERENCES resource (id) ON DELETE CASCADE,
  email       TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, email)
);

-- ---------------------------------------------------------------- AI news

CREATE TABLE IF NOT EXISTS news_source (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  feed_url        TEXT NOT NULL,
  homepage        TEXT,
  category        TEXT NOT NULL DEFAULT 'AI',
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  last_error      TEXT,
  items_seen      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS news_item (
  id           BIGSERIAL PRIMARY KEY,
  source_id    TEXT REFERENCES news_source (id) ON DELETE SET NULL,
  -- Set when a person posted the link instead of a feed producing it. Both kinds live in
  -- one table because the reader does not care which arrived how.
  posted_by    TEXT REFERENCES app_user (email) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL UNIQUE,
  summary      TEXT,
  author       TEXT,
  published_at TIMESTAMPTZ,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_item_recent ON news_item (published_at DESC NULLS LAST, id DESC);

-- Feeds worth reading on day one. Editable from the app afterwards; a source that cannot be
-- reached records its error rather than silently returning nothing.
--
-- Every URL here was fetched before being listed, which is worth doing because a vendor
-- publishing news does not imply a vendor publishing a feed: Anthropic, the obvious omission,
-- serves a 404 at every conventional path. Their announcements arrive here through the
-- aggregators instead.
INSERT INTO news_source (id, name, feed_url, homepage, category) VALUES
  ('cursor-changelog', 'Cursor changelog', 'https://cursor.com/changelog/rss.xml', 'https://cursor.com/changelog', 'Cursor'),
  ('openai-news',      'OpenAI news',      'https://openai.com/news/rss.xml',      'https://openai.com/news',      'Models'),
  ('google-ai',        'Google AI blog',   'https://blog.google/technology/ai/rss/', 'https://blog.google/technology/ai', 'Models'),
  ('github-changelog', 'GitHub changelog', 'https://github.blog/changelog/feed/',  'https://github.blog/changelog', 'Tooling'),
  ('github-ai',        'GitHub AI blog',   'https://github.blog/ai-and-ml/feed/',  'https://github.blog/ai-and-ml', 'Tooling'),
  ('simon-willison',   'Simon Willison',   'https://simonwillison.net/atom/everything/', 'https://simonwillison.net', 'Practice'),
  ('hn-frontpage',     'Hacker News',      'https://hnrss.org/frontpage?points=250', 'https://news.ycombinator.com', 'Industry')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- action backlog state

-- Recommendations are derived from the warehouse every time the page loads, so they are not
-- stored. What is stored is the person's decision about one: acted on it, or not now. The
-- key is the generator's stable identifier for that recommendation.
CREATE TABLE IF NOT EXISTS action_state (
  email      TEXT NOT NULL REFERENCES app_user (email) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done', 'dismissed')),
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, action_key)
);

-- ---------------------------------------------------------------- read models

-- The board feed, with the counts the cards show. Collaborators and reactions are
-- aggregated here so a page of twenty cards is one query rather than sixty.
CREATE OR REPLACE VIEW v_achievement_card AS
SELECT a.id,
       a.author_email,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), a.author_email) AS author_name,
       a.title,
       a.ticket_keys,
       a.repo,
       a.pr_url,
       a.context,
       a.delivered,
       a.help_planning,
       a.help_implementation,
       a.benefits_note,
       a.effort_saved_pct::float8   AS effort_saved_pct,
       a.time_saved_days::float8    AS time_saved_days,
       COALESCE(a.team_name, u.team_name) AS team_name,
       a.tags,
       a.happened_on,
       a.created_at,
       a.status,
       COALESCE(r.reactions, 0)::int      AS reactions,
       COALESCE(c.collaborators, 0)::int  AS collaborators,
       COALESCE(c.names, '{}')            AS collaborator_names
FROM achievement a
JOIN app_user u ON u.email = a.author_email
LEFT JOIN (
  SELECT achievement_id, COUNT(*) AS reactions
  FROM achievement_reaction
  GROUP BY achievement_id
) r ON r.achievement_id = a.id
LEFT JOIN (
  SELECT achievement_id, COUNT(*) AS collaborators, array_agg(name ORDER BY name) AS names
  FROM achievement_collaborator
  GROUP BY achievement_id
) c ON c.achievement_id = a.id;

-- Board headline figures. Self-reported savings are summed only where somebody supplied a
-- number, and the count of contributing posts travels with the total so the reader can see
-- how much of the board it rests on.
CREATE OR REPLACE VIEW v_board_totals AS
SELECT COUNT(*)::int                                            AS posts,
       COUNT(DISTINCT author_email)::int                         AS contributors,
       COUNT(*) FILTER (WHERE happened_on >= current_date - 30)::int AS posts_30d,
       COALESCE(SUM(time_saved_days), 0)::float8                 AS days_saved,
       COUNT(*) FILTER (WHERE time_saved_days IS NOT NULL)::int   AS posts_with_days,
       COALESCE(AVG(effort_saved_pct), 0)::float8                AS avg_effort_saved_pct,
       COUNT(*) FILTER (WHERE effort_saved_pct IS NOT NULL)::int  AS posts_with_effort,
       COALESCE(SUM(cardinality(ticket_keys)), 0)::int            AS tickets_referenced
FROM achievement
WHERE status = 'published';

CREATE OR REPLACE VIEW v_board_leaderboard AS
SELECT a.author_email                                                      AS email,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), a.author_email) AS name,
       COALESCE(a.team_name, u.team_name)                                   AS team_name,
       COUNT(*)::int                                                        AS posts,
       COALESCE(SUM(a.time_saved_days), 0)::float8                          AS days_saved,
       MAX(a.happened_on)                                                   AS latest_post
FROM achievement a
JOIN app_user u ON u.email = a.author_email
WHERE a.status = 'published'
GROUP BY a.author_email, u.first_name, u.last_name, a.team_name, u.team_name;

CREATE OR REPLACE VIEW v_shared_asset_card AS
SELECT s.id,
       s.kind,
       s.slug,
       s.title,
       s.description,
       s.body,
       s.category,
       s.tags,
       s.glob_pattern,
       s.always_apply,
       s.author_email,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), s.author_email) AS author_name,
       s.status,
       s.copies,
       s.created_at,
       s.updated_at,
       COALESCE(v.votes, 0)::int AS votes
FROM shared_asset s
JOIN app_user u ON u.email = s.author_email
LEFT JOIN (
  SELECT asset_id, COUNT(*) AS votes FROM shared_asset_vote GROUP BY asset_id
) v ON v.asset_id = s.id;

CREATE OR REPLACE VIEW v_resource_card AS
SELECT r.id,
       r.title,
       r.url,
       r.kind,
       r.description,
       r.tags,
       r.repo_stars,
       r.repo_slug,
       r.featured,
       r.submitted_by,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), r.submitted_by) AS submitted_by_name,
       r.status,
       r.created_at,
       COALESCE(v.votes, 0)::int AS votes
FROM resource r
JOIN app_user u ON u.email = r.submitted_by
LEFT JOIN (
  SELECT resource_id, COUNT(*) AS votes FROM resource_vote GROUP BY resource_id
) v ON v.resource_id = r.id;
