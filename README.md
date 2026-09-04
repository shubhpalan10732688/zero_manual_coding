# Zero Manual Coding

A public wall of what people achieved by directing an AI agent instead of typing every line
themselves, and the workspace behind it.

Two halves, deliberately unequal:

- **The shared half** — the achievement wall, the commands and rules catalogue, the resource
  shelf and the AI news feed. Anyone with a work email can read and write it. The wall at `/`
  is readable without signing in at all.
- **The measured half** — your own Cloud Agent cost, cache behaviour and shipped work, read
  from the Cursor API. This needs a personal Cursor API key, which is optional. Without one
  the workspace hides those pages rather than showing you empty ones.

The split matters because the two kinds of number are not comparable and the product never
adds them together. Cost is measured and nobody wrote it; effort saved is written by the
person who did the work and no system can check it. Every surface that shows a saving says
who claimed it.

## Running it locally

On Windows, double-click `start-local.cmd`. It checks prerequisites, writes `.env` and
`web/.env.local` from the examples if they are missing, generates an encryption key, installs
dependencies, starts an in-process Postgres and the web server, waits for the health check,
and opens a browser. Pass `fresh` to reset the database first.

Otherwise:

```bash
npm install && npm install --prefix web
cp .env.example .env && cp web/.env.example web/.env.local   # then fill in ENCRYPTION_KEY
npm run dev:db                 # PGlite on :5433, migrations applied, seed loaded
npm run dev --prefix web       # http://localhost:3000
```

The seed creates five people and a populated wall. To sign in as one of them without a real
Cursor key, set `ALLOW_DEV_SESSION=true` and run `npm run dev:session -- ada@corp.test`; it
prints a cookie to paste into the browser console. That script refuses to run without the
flag, because it is a login with no authentication whatsoever.

## Layout

| Path | What |
|---|---|
| `web/app/page.tsx`, `web/app/landing/` | The public wall and the practice write-up |
| `web/app/login/` | Sign-in: email required, Cursor key optional |
| `web/app/app/` | The workspace — wall, commands, rules, resources, news, connections, and the measured pages |
| `src/auth/`, `src/users/` | Sessions in Postgres, and per-person credentials sealed with AES-256-GCM |
| `src/client/` | The Cursor Admin and Cloud Agents API client |
| `src/ingest/`, `src/enrich/` | Pulling agent history, and joining it to GitHub pull requests and Jira tickets |
| `db/migrations/` | Forward-only SQL, applied in filename order |

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full suite, including migrations applied against a real Postgres |
| `npm run typecheck` / `npm run lint` | Root TypeScript and ESLint |
| `npm run migrate` | Apply pending migrations |
| `npm run nightly` | Refresh everyone's agents, enrich, then pull news. This is the cron entry |
| `npm run connect -- --list` | Who has a working Cursor key, and whose has broken |
| `npm run ingest` | Team-wide IDE metrics. Needs a Team Admin API key; optional |

## Deploying

`docs/deploy-gcp-vm.md` is the current path: one VM, Postgres, nginx, a nightly cron.

Read the section on who can sign in before you launch. Because the Cursor API key is
optional, an email address is a claim rather than a credential, which makes
`ALLOWED_EMAIL_DOMAINS` and the network boundary the only two access controls there are. The
landing page at `/` is public by design and shows real names, real ticket keys and real
savings, so "the network boundary" has to mean something.
