# Attributing agent cost to delivered work

Cursor's API says an agent ran and what it cost. It does not say whether that was a
feature or a bug fix, or whether anything shipped. That information lives in GitHub and
Jira, so the impact view is built by joining to them.

## Why not use an LLM for this

The obvious idea is to feed each agent's title to a model and ask it to classify and
summarise. It was rejected because the authoritative answer already exists and is
cheaper, and because the specific mechanism proposed cannot work.

**The data is already labelled by people.** A pull request title carries a
conventional-commit prefix the author typed (`feat(mic): ...`, `fix(mic): ...`), the body
carries a written Goal section, and the linked Jira issue carries a type chosen during
triage. Asking a model to infer any of that would be strictly less accurate than reading
it.

**A Cloud Agent cannot serve as a text endpoint.** Probing `POST /v1/agents` (see
`scripts/probe-agent-create.mjs`, which sends only invalid payloads and creates nothing)
shows a repo-less agent is *accepted* — a body with a prompt and no repository fails on
model selection rather than on a missing repository. The blocker is retrieval: there is no
endpoint that returns an agent's text. `GET /v1/agents/{id}/conversation` and
`/messages` both return 404, so an agent's only channel is committing code or opening a
pull request. Three further objections stand independently:

- Every classifier agent would appear in `GET /v1/agents` and be ingested by this
  dashboard, corrupting the cost figures it exists to report.
- Each call costs real money against the user's account.
- Observed run latency is 16 seconds to 4 minutes.

If the unclassified tail ever needs machine classification, it should use an ordinary
completion API, not a coding agent.

## How work type is decided

Ordered by trustworthiness; the first source that answers wins. Implemented in
`src/enrich/classify.ts` and covered by `test/classify.test.ts`.

1. **Jira issue type.** `Story`, `Epic` and `Improvement` map to feature; `Bug`,
   `Defect` and `Incident` map to bug. This is the organisation's own system of record.
2. **Conventional-commit prefix on the pull request title.** Matched only as a real
   prefix (`fix:` or `fix(scope):`), so the word "fix" inside a sentence is not treated
   as a declaration.
3. **Branch name segment**, such as `mic/fix/BSD-29387-...`.
4. Otherwise **unclassified**. An auto-generated three-word agent title is not evidence,
   and inventing a category would put a guess into a number that gets reported as fact.

Jira taking precedence matters in practice: PR 1231 is titled `feat(mic): ...` but its
ticket BSD-29502 is a `Bug`, so the ticket wins and the work is counted as a bug fix.

## Line counts

Additions and deletions are summed only over merged pull requests. Lines sitting in a
draft PR have not shipped, and counting them would credit an agent for work nobody
accepted.

## Running enrichment

Live, when the app can reach both systems:

```bash
export GITHUB_TOKEN=...            # repo read scope
export JIRA_BASE_URL=https://your-site.atlassian.net
export JIRA_EMAIL=...
export JIRA_API_TOKEN=...
npm run enrich
```

Either system may be omitted; enrichment degrades rather than failing. Without
`GITHUB_TOKEN` there are no pull request titles, so classification falls back to branch
names.

From exported records, for networks where the server cannot reach GitHub or Jira:

```bash
npm run enrich -- --file data/enrichment.json
```

`data/enrichment.json` holds `pullRequests[]` and `tickets[]` in the shapes defined in
`src/enrich/types.ts`. Both paths write the same `agent_work_item` rows, and the views
above them cannot tell which was used. Passing `--file` alongside configured tokens
chains them, with the APIs tried first.

## Schema

`db/migrations/006_agent_impact.sql` adds `agent_work_item` (one row per agent) and four
views: `v_agent_impact` per agent, `v_impact_by_ticket`, `v_impact_by_type`, and
`v_impact_summary`. Agents with no ticket group under `unassigned` in the ticket view and
are listed individually in the UI rather than being folded into a bucket that would look
like a real project.
