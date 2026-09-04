-- Demo content for the /app workspace, for local development only.
--
-- Deliberately synthetic and deterministic: no randomness, no real people, so screenshots
-- and manual testing are reproducible. It fills the parts of the product that only exist
-- because someone wrote something — the board, the library, the shelf, the feed — because
-- every one of those pages is a different design problem when it is empty and when it is not,
-- and only one of those can be checked against nothing.
--
-- Cloud Agent rows are included too, since the dashboard is unreadable without them and a
-- real key cannot be used in a test. Never load this where real data is ingested.

TRUNCATE achievement, achievement_collaborator, achievement_reaction,
         shared_asset, shared_asset_vote,
         resource, resource_vote,
         news_item, action_state
  RESTART IDENTITY CASCADE;

DELETE FROM agent_work_item WHERE email LIKE '%@corp.test';
DELETE FROM cloud_agent_run WHERE email LIKE '%@corp.test';
DELETE FROM cloud_agent     WHERE email LIKE '%@corp.test';

-- ---------------------------------------------------------------- people

INSERT INTO app_user (email, first_name, last_name, team_name, job_title) VALUES
  ('ada@corp.test',       'Ada',       'Lovelace',  'Platform', 'Principal Engineer'),
  ('grace@corp.test',     'Grace',     'Hopper',    'Platform', 'Staff Engineer'),
  ('alan@corp.test',      'Alan',      'Turing',    'Platform', 'Senior Engineer'),
  ('katherine@corp.test', 'Katherine', 'Johnson',   'Payments', 'Senior Engineer'),
  ('edsger@corp.test',    'Edsger',    'Dijkstra',  'Data',     'Engineering Manager')
ON CONFLICT (email) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name  = EXCLUDED.last_name,
  team_name  = EXCLUDED.team_name,
  job_title  = EXCLUDED.job_title;

-- ---------------------------------------------------------------- Cloud Agents
--
-- Five agents with different endings, because the dashboard's whole argument is that they are
-- not the same thing: one merged, one still in review, one that opened nothing, one that
-- failed, and one with poor cache reuse. Each shape drives a different recommendation.

INSERT INTO cloud_agent
  (id, email, name, status, repo_url, agent_url, created_at, updated_at,
   input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, total_tokens,
   raw_cost_cents, charged_cents, usage_fetched_at)
VALUES
  ('agent-cfg', 'ada@corp.test', 'Config Manager route and read-only viewer', 'FINISHED',
   'https://github.com/corp/vcap-ui', 'https://cursor.com/agents/agent-cfg',
   now() - INTERVAL '4 days',  now() - INTERVAL '4 days',
   180000, 24000, 320000, 1450000, 1974000, 412.500000, 0, now()),

  ('agent-flag', 'ada@corp.test', 'Feature flag demo harness', 'FINISHED',
   'https://github.com/corp/vcap-ui', 'https://cursor.com/agents/agent-flag',
   now() - INTERVAL '9 days',  now() - INTERVAL '9 days',
   96000, 14000, 210000, 640000, 960000, 214.000000, 0, now()),

  ('agent-auth', 'ada@corp.test', 'Okta session refresh edge cases', 'FINISHED',
   'https://github.com/corp/vcap-api', 'https://cursor.com/agents/agent-auth',
   now() - INTERVAL '13 days', now() - INTERVAL '13 days',
   240000, 31000, 480000, 210000, 961000, 388.000000, 0, now()),

  ('agent-spike', 'ada@corp.test', 'Investigate slow config query', 'ERROR',
   'https://github.com/corp/vcap-api', 'https://cursor.com/agents/agent-spike',
   now() - INTERVAL '17 days', now() - INTERVAL '17 days',
   142000, 9000, 260000, 40000, 451000, 176.500000, 0, now()),

  ('agent-grace', 'grace@corp.test', 'Payments ledger reconciliation script', 'FINISHED',
   'https://github.com/corp/payments', 'https://cursor.com/agents/agent-grace',
   now() - INTERVAL '6 days',  now() - INTERVAL '6 days',
   120000, 18000, 240000, 900000, 1278000, 268.000000, 0, now());

-- Runs. Cache reads dominate on the agents that were continued and are absent on the ones
-- that were started fresh every time, which is what makes the cold-start figures move.
INSERT INTO cloud_agent_run
  (id, agent_id, email, status, created_at, updated_at, duration_ms, repo_url, branch, pr_url,
   input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, total_tokens,
   raw_cost_cents, charged_cents)
VALUES
  ('run-cfg-1', 'agent-cfg', 'ada@corp.test', 'FINISHED',
   now() - INTERVAL '4 days', now() - INTERVAL '4 days', 1620000,
   'https://github.com/corp/vcap-ui', 'feature/VCAP-1192-config-viewer', NULL,
   90000, 11000, 320000, 180000, 601000, 186.000000, 0),
  ('run-cfg-2', 'agent-cfg', 'ada@corp.test', 'FINISHED',
   now() - INTERVAL '4 days' + INTERVAL '2 hours', now() - INTERVAL '4 days' + INTERVAL '2 hours',
   980000, 'https://github.com/corp/vcap-ui', 'feature/VCAP-1192-config-viewer',
   'https://github.com/corp/vcap-ui/pull/482',
   90000, 13000, 0, 1270000, 1373000, 226.500000, 0),

  ('run-flag-1', 'agent-flag', 'ada@corp.test', 'FINISHED',
   now() - INTERVAL '9 days', now() - INTERVAL '9 days', 720000,
   'https://github.com/corp/vcap-ui', 'feature/VCAP-1177-flag-demo',
   'https://github.com/corp/vcap-ui/pull/470',
   96000, 14000, 210000, 640000, 960000, 214.000000, 0),

  ('run-auth-1', 'agent-auth', 'ada@corp.test', 'FINISHED',
   now() - INTERVAL '13 days', now() - INTERVAL '13 days', 1140000,
   'https://github.com/corp/vcap-api', 'chore/session-refresh', NULL,
   140000, 19000, 300000, 60000, 519000, 232.000000, 0),
  ('run-auth-2', 'agent-auth', 'ada@corp.test', 'FINISHED',
   now() - INTERVAL '12 days', now() - INTERVAL '12 days', 660000,
   'https://github.com/corp/vcap-api', 'chore/session-refresh', NULL,
   100000, 12000, 180000, 150000, 442000, 156.000000, 0),

  ('run-spike-1', 'agent-spike', 'ada@corp.test', 'ERROR',
   now() - INTERVAL '17 days', now() - INTERVAL '17 days', 300000,
   'https://github.com/corp/vcap-api', 'spike/slow-config-query', NULL,
   142000, 9000, 260000, 40000, 451000, 176.500000, 0),

  ('run-grace-1', 'agent-grace', 'grace@corp.test', 'FINISHED',
   now() - INTERVAL '6 days', now() - INTERVAL '6 days', 900000,
   'https://github.com/corp/payments', 'feature/PAY-318-reconciliation',
   'https://github.com/corp/payments/pull/91',
   120000, 18000, 240000, 900000, 1278000, 268.000000, 0);

-- Enrichment, as GitHub and Jira would have filled it in. One merged, one open, one with a
-- ticket but no pull request, one with neither.
INSERT INTO agent_work_item
  (agent_id, email, pr_number, pr_url, pr_title, pr_state, pr_merged, pr_merged_at,
   additions, deletions, changed_files,
   ticket_key, ticket_type, ticket_summary, ticket_status, project_key,
   work_type, work_type_source, summary, summary_source)
VALUES
  ('agent-cfg', 'ada@corp.test', 482, 'https://github.com/corp/vcap-ui/pull/482',
   'VCAP-1192: config manager route and read-only viewer', 'closed', TRUE,
   now() - INTERVAL '3 days', 1840, 120, 34,
   'VCAP-1192', 'Story', 'Config Manager route and read-only viewer', 'Done', 'VCAP',
   'feature', 'jira_issue_type', 'Config Manager route and read-only viewer', 'jira_summary'),

  ('agent-flag', 'ada@corp.test', 470, 'https://github.com/corp/vcap-ui/pull/470',
   'VCAP-1177: flag demo harness', 'open', FALSE, NULL, 460, 30, 9,
   'VCAP-1177', 'Story', 'Feature flag demo harness', 'In Review', 'VCAP',
   'feature', 'jira_issue_type', 'Feature flag demo harness', 'jira_summary'),

  ('agent-auth', 'ada@corp.test', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL,
   'unknown', 'none', 'Okta session refresh edge cases', 'agent_name'),

  ('agent-spike', 'ada@corp.test', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL,
   'unknown', 'none', 'Investigate slow config query', 'agent_name'),

  ('agent-grace', 'grace@corp.test', 91, 'https://github.com/corp/payments/pull/91',
   'PAY-318: ledger reconciliation script', 'closed', TRUE,
   now() - INTERVAL '5 days', 720, 210, 12,
   'PAY-318', 'Bug', 'Ledger reconciliation drifts after refunds', 'Done', 'PAY',
   'bug', 'jira_issue_type', 'Ledger reconciliation drifts after refunds', 'jira_summary');

-- ---------------------------------------------------------------- the board

INSERT INTO achievement
  (author_email, title, ticket_keys, repo, pr_url, context, delivered,
   help_planning, help_implementation, benefits_note,
   effort_saved_pct, time_saved_days, team_name, tags, happened_on)
VALUES
  ('ada@corp.test',
   'Config Manager route and read-only viewer',
   ARRAY['VCAP-1192', 'VCAP-1177'],
   'corp/vcap-ui',
   'https://github.com/corp/vcap-ui/pull/482',
   'Developers had no in-app way to inspect global and per-app configuration stored in Secrets Manager. Every check meant opening the AWS console, with no scope navigation and no path from the dashboard into config management.',
   'A new `config-manager` feature library and a top-level `/config-manager` route, following the shell-replacement pattern we already use for `/storybook` and `/flag-demo`, behind the existing auth gate. Two entry points: a dashboard tile for frontend apps, and a persistent left-panel link. The screen reuses the standard header, renders its own scope list, and shows read-only config in interchangeable tree and JSON views from one parsed model.',
   'It read the epic artefacts first — the masterplan, the story plan, the README mockups — so it did not have to guess the architecture. That mattered: shell replacement versus embedding in the dashboard filter panel, and raw per-scope config versus merged, are decisions you cannot infer from the code.',
   'The story plan''s affected-files list acted as a checklist: routes, the new library scaffold, the dashboard tile, the shell and viewer components, the GraphQL service and the store. Repo rules kept it on our conventions — barrel exports, no changes to the shared header, CodeMirror rather than Monaco for the JSON view.',
   'Scaffolding a new library, a store, a data-access layer, an expandable tree viewer, a JSON viewer and two dashboard entry points would have taken two to three days by hand.',
   65, 2.5, 'Platform', ARRAY['scaffolding', 'frontend'], current_date - 4),

  ('grace@corp.test',
   'Ledger reconciliation drift after refunds',
   ARRAY['PAY-318'],
   'corp/payments',
   'https://github.com/corp/payments/pull/91',
   'Reconciliation had been drifting by small amounts for weeks and nobody could reproduce it. The refund path was suspected but the ledger writes are spread across three services.',
   'A reconciliation script that replays a day of ledger events and reports the first divergence, plus the fix: refunds were being written with the original transaction''s timestamp rather than their own, so same-day refunds sorted before the payment they reversed.',
   'I described the symptom and it asked for the ordering guarantees rather than the code. That reframed it from a rounding problem to an ordering problem, which is what it turned out to be.',
   'It wrote the replay harness and the property test that would have caught the original bug. I would not have written the harness by hand for a one-off investigation, which is exactly why it had gone unfound for weeks.',
   'The fix was twenty minutes once the cause was clear. The three days were the investigation.',
   40, 1.5, 'Payments', ARRAY['debugging', 'testing'], current_date - 6),

  ('alan@corp.test',
   'Retired the hand-written GraphQL types',
   ARRAY['VCAP-1204'],
   'corp/vcap-ui',
   NULL,
   'Our GraphQL types were maintained by hand and had drifted from the schema in eleven places, two of which were silently wrong at runtime.',
   'Codegen wired into the build, every hand-written type deleted, and the eleven mismatches fixed. The two runtime bugs turned out to be nullable fields we had typed as required.',
   NULL,
   'The mechanical part — deleting a type, finding its usages, adapting them to the generated shape — is what took the time, and it was almost entirely delegated. I reviewed each change rather than making it.',
   'A day of tedious, error-prone editing compressed into an afternoon of review.',
   70, 1, 'Platform', ARRAY['refactor', 'typescript'], current_date - 11);

INSERT INTO achievement_collaborator (achievement_id, name, email) VALUES
  (1, 'Grace Hopper', 'grace@corp.test'),
  (1, 'Alan Turing', 'alan@corp.test'),
  (2, 'Katherine Johnson', 'katherine@corp.test');

-- One emoji only: the board counts likes, and a mixed set could not be summed into a
-- sentence. See migration 008.
INSERT INTO achievement_reaction (achievement_id, email, emoji) VALUES
  (1, 'grace@corp.test', '👍'),
  (1, 'alan@corp.test', '👍'),
  (1, 'edsger@corp.test', '👍'),
  (1, 'katherine@corp.test', '👍'),
  (2, 'ada@corp.test', '👍'),
  (2, 'edsger@corp.test', '👍'),
  (3, 'ada@corp.test', '👍');

-- ---------------------------------------------------------------- commands and rules

INSERT INTO shared_asset
  (kind, slug, title, description, body, category, tags, glob_pattern, always_apply,
   author_email, status, copies)
VALUES
  ('command', 'review-diff-for-risk', 'Review a diff for risk',
   'The review checklist we actually use, in the order that finds problems fastest.',
   'Review the current diff for correctness and risk.

Work through these in order and stop at the first one that fails:

1. Does it do what the ticket asked? Quote the line that proves it.
2. What breaks if the input is empty, enormous, or malformed?
3. Is any error being swallowed?
4. Are the tests asserting behaviour, or restating the implementation?
5. Is anything here a breaking change for a caller outside this repository?

Report each finding as: file, line, what is wrong, what to do instead. No praise, no summary.',
   'Review', ARRAY['review'], NULL, FALSE, 'ada@corp.test', 'published', 14),

  ('command', 'write-the-missing-tests', 'Write the missing tests',
   'Finds the untested branches in what you just changed, then writes tests for them.',
   'Look at the current diff and list every branch it introduced that no test exercises.

For each one, write a test that would fail if the branch were removed. Follow the conventions
in the nearest existing test file — same runner, same naming, same fixture style.

Do not test getters, constructors, or anything whose failure would be caught by the type
checker. If a branch cannot be tested without changing the production code, say so and say
what change would be needed.',
   'Testing', ARRAY['testing'], NULL, FALSE, 'grace@corp.test', 'published', 9),

  ('command', 'explain-this-failure', 'Explain this failure',
   'For a stack trace you have not seen before, in a repository you did not write.',
   'Here is a failure. Before proposing a fix:

1. Say what the code was trying to do, in one sentence.
2. Say what actually happened, and name the line where the two diverge.
3. List what would have to be true for this to happen, and mark which of those you verified
   against the code and which you are assuming.

Only then suggest a fix. If two causes are equally likely, give both and say what would
distinguish them.',
   'Debugging', ARRAY['debugging'], NULL, FALSE, 'alan@corp.test', 'published', 6),

  ('rule', 'module-header-comments', 'Module header comments',
   'Every module explains why it exists, not what it does.',
   'Start each module with a comment explaining why it exists and what decision it embodies.

Do not narrate the code. "Parses the config file" is worthless; the export name says that. What
the reader cannot get from the code is why this module is separate from its neighbour, what it
deliberately does not do, and which constraint shaped it.

Inside the code, comment only what the code cannot say: a constraint, a trade-off, or a reason
an obvious alternative was rejected.',
   'Style', ARRAY['documentation'], NULL, TRUE, 'ada@corp.test', 'published', 21),

  ('rule', 'no-new-dependencies', 'No new dependencies without a reason',
   'The standard library first, then a dependency, and say which and why.',
   'Do not add a dependency for something the standard library or an existing dependency already
does adequately.

If a dependency is genuinely needed, say in the pull request description what it replaces, how
large it is, and what happens if it is abandoned. Prefer one that does one thing.

This applies to transitive weight too: a package that pulls in twelve others is twelve
decisions, not one.',
   'Architecture', ARRAY['dependencies'], NULL, TRUE, 'edsger@corp.test', 'published', 11),

  ('rule', 'sql-in-repositories-only', 'SQL stays in the data layer',
   'Query text belongs in one place per table, not wherever it was needed.',
   'Write SQL only in the data-access layer. A component, route handler or service that builds
query text is a component that has to be read to understand the schema.

Every query names its columns. `SELECT *` couples the caller to column order and hides a
schema change until runtime.

Cast numerics explicitly where the result is arithmetic: the driver returns NUMERIC as a
string, and a silent string turns addition into concatenation.',
   'Architecture', ARRAY['sql', 'typescript'], 'src/**/*.ts', FALSE,
   'grace@corp.test', 'published', 7);

INSERT INTO shared_asset_vote (asset_id, email) VALUES
  (1, 'grace@corp.test'), (1, 'alan@corp.test'), (1, 'edsger@corp.test'),
  (1, 'katherine@corp.test'),
  (2, 'ada@corp.test'), (2, 'edsger@corp.test'),
  (3, 'ada@corp.test'),
  (4, 'grace@corp.test'), (4, 'alan@corp.test'), (4, 'edsger@corp.test'),
  (4, 'katherine@corp.test'),
  (5, 'ada@corp.test'), (5, 'grace@corp.test'),
  (6, 'ada@corp.test');

-- ---------------------------------------------------------------- the shelf

INSERT INTO resource (title, url, kind, description, tags, repo_slug, repo_stars, stars_at,
                      featured, submitted_by)
VALUES
  ('Graphify', 'https://github.com/corp/graphify', 'repo',
   'Our own graph-rendering library. Worth reading before you write anything that draws a dependency tree — the layout code is the interesting part.',
   ARRAY['internal', 'visualisation'], 'corp/graphify', NULL, NULL, TRUE, 'ada@corp.test'),

  ('Cursor documentation', 'https://cursor.com/docs', 'doc',
   'The reference for rules, commands and Cloud Agents. The rules page in particular is worth reading properly rather than skimming: the difference between an always-applied rule and a globbed one decides whether your rules help or just compete for attention.',
   ARRAY['cursor'], NULL, NULL, NULL, TRUE, 'ada@corp.test'),

  ('Anthropic cookbook', 'https://github.com/anthropics/anthropic-cookbook', 'repo',
   'Worked examples rather than prose. The evaluation notebooks are the ones to steal from: they show how to tell whether a change to a prompt actually improved anything.',
   ARRAY['prompting', 'evals'], 'anthropics/anthropic-cookbook', 13400,
   now() - INTERVAL '2 days', FALSE, 'grace@corp.test'),

  ('OpenAI Cookbook', 'https://github.com/openai/openai-cookbook', 'repo',
   'Broad and uneven, but the retrieval and function-calling chapters are solid and save a day of trial and error each.',
   ARRAY['prompting'], 'openai/openai-cookbook', 64200, now() - INTERVAL '2 days',
   FALSE, 'alan@corp.test'),

  ('Ruff', 'https://github.com/astral-sh/ruff', 'tool',
   'Fast enough to run on save, which is the only thing that makes a linter get used. Relevant here because an agent obeys a linter it can run far better than a style guide it has to remember.',
   ARRAY['tooling', 'python'], 'astral-sh/ruff', 32800, now() - INTERVAL '2 days',
   FALSE, 'edsger@corp.test'),

  ('The Twelve-Factor App', 'https://12factor.net', 'doc',
   'Twenty minutes, still the clearest statement of why configuration belongs in the environment. Half our config-manager work exists because of the parts we got wrong.',
   ARRAY['architecture'], NULL, NULL, NULL, FALSE, 'katherine@corp.test');

INSERT INTO resource_vote (resource_id, email) VALUES
  (1, 'grace@corp.test'), (1, 'alan@corp.test'), (1, 'edsger@corp.test'),
  (2, 'ada@corp.test'), (2, 'grace@corp.test'), (2, 'katherine@corp.test'),
  (3, 'ada@corp.test'), (3, 'edsger@corp.test'),
  (4, 'ada@corp.test'),
  (5, 'grace@corp.test'), (5, 'alan@corp.test'),
  (6, 'edsger@corp.test');

-- ---------------------------------------------------------------- news
--
-- Hand-posted items only. Feed-sourced rows arrive from `npm run news`, and seeding fake ones
-- would make a broken feed look like a working one.

INSERT INTO news_item (title, url, summary, tags, posted_by, published_at) VALUES
  ('Cursor changelog',
   'https://cursor.com/changelog',
   'Worth checking before you file a bug: several things we have worked around were fixed in the last few releases.',
   ARRAY['Cursor'], 'ada@corp.test', now() - INTERVAL '2 days'),

  ('Writing effective rules for coding agents',
   'https://cursor.com/docs/context/rules',
   'The section on scoping with globs is the part most teams skip, and it is the part that stops a rules directory turning into noise.',
   ARRAY['Cursor', 'Practice'], 'grace@corp.test', now() - INTERVAL '5 days');
