# What a personal Cursor API key can actually see

Measured on 2026-08-12 against `https://api.cursor.com` with a User API Key
(`crsr_...`, scope shown as "Admin" in the dashboard). Reproduce with
`node --use-system-ca scripts/probe-user-scope.mjs`.

This matters because the dashboard idea of "let each person paste their own key" is
bounded entirely by this list. The Cursor dashboard labels these keys "User API Keys"
and describes them as covering "your Cursor account, including the headless version of
the Cursor Agent CLI and Cloud Agent API" — which is exactly what the probe found.

## Reachable

| Endpoint | Returns |
| --- | --- |
| `GET /v1/me` | `apiKeyName`, `userId`, `userEmail`, `userFirstName`, `userLastName`, `createdAt` |
| `GET /v1/models` | 27 models: `id`, `displayName`, `aliases`, `variants`. **No pricing.** |
| `GET /v1/agents?limit=100` | Cloud agents: `id`, `name`, `status`, `env`, `repos`, `url`, `createdAt`, `updatedAt`, `latestRunId` |
| `GET /v1/agents/{id}` | Same fields for one agent |
| `GET /v1/agents/{id}/usage` | `totalUsage` (`inputTokens`, `outputTokens`, `cacheWriteTokens`, `cacheReadTokens`, `totalTokens`), `cost` (`rawCostCents`, `chargedCents`), plus the same per run |
| `GET /v1/agents/{id}/runs` | `id`, `status`, `createdAt`, `updatedAt`, `durationMs`, `git.branches[]` with `repoUrl`, `branch`, `prUrl` |

## Denied (401 "Invalid Team API Key")

Every Admin and Analytics endpoint: `/teams/members`, `/teams/daily-usage-data`,
`/teams/filtered-usage-events`, `/teams/spend`, `/analytics/team/*`,
`/analytics/by-user/*`, `/analytics/ai-code/*`. Organization endpoints return
"Invalid Organization API Key".

## Not found (404)

`/v1/usage`, `/v1/me/usage`, `/v1/usage-events`, `/v1/spend`, `/v1/analytics/usage`,
and per-agent `messages`, `conversation`, `logs`, `diff`.

## Consequences for a self-service dashboard

Possible with a personal key:

- Cloud agent inventory: how many, which repos, which branches, which PRs, run
  durations, success and failure counts.
- Token consumption and `rawCostCents` per agent and per run.
- Cache efficiency, which is the strongest saving signal available. In the sample data
  one run wrote 74,326 cache tokens and read none (28.77 cents), while a later run on
  the same agent read 149,291 cached tokens for 6.52 cents.
- The gap between `rawCostCents` and `chargedCents`, i.e. what the subscription absorbed.

Not possible with a personal key:

- **Which model was used.** Absent from the agent, usage and run payloads. The
  `/v1/models` catalogue lists what exists, never what was chosen.
- **Prompt or conversation text.** Both `messages` and `conversation` return 404. The
  only proxy is the auto-generated agent `name`, such as "Csv upload search".
- **All IDE activity**: Tab completions, editor chat, Cmd+K, accepted lines, active
  days. This is the bulk of everyday Cursor usage and none of it is user-key visible.
- **Real billed spend**, per-request costs, or anything reconcilable to an invoice.

## History depth

The account probed returned 21 agents spanning 2026-07-17 to 2026-08-10 with no
`nextCursor`, so that appears to be the complete list rather than a page. Whether
older agents are pruned by a retention rule or simply never existed cannot be
distinguished from the API alone.
