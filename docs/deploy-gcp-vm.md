# Running the workspace on a GCP VM

This describes one deployment: a single Compute Engine instance serving `/app` to the
organisation, with Postgres on the same box and a nightly cron. It is the smallest thing
that is honestly production, and it is sized for it — a few hundred people reading pages
that are mostly aggregate queries over a database measured in megabytes.

The AWS Lambda path in `serverless.yml` is a different deployment of the same code and is
unaffected by any of this. Nothing here replaces it; the two do not interact.

## What has to be true before you start

- A Cursor **User API Key** per person is **optional**. Anyone can sign in at `/login` with
  a work email alone and get the shared half of the product — the Zero Manual Coding board,
  the commands and rules, the resources and the news. Providing a key at `/login` or later
  at `/app/connections` adds the measured half: their own Cloud Agent cost, cache behaviour
  and shipped work. Read the section on who can sign in below before launch, because the
  key is also the only thing that proves identity, and making it optional makes
  `ALLOWED_EMAIL_DOMAINS` load-bearing.
- A Cursor **Team Admin API Key** is optional. With one, `npm run ingest` fills the IDE
  metrics — Tab acceptance, chat volume, accepted lines — and the member roster. Without
  one, every page that needs team data says so and the rest of the product works. Decide
  this before launch, because "editor metrics are empty" is a support question you only
  want to answer once.
- A GCP project, and the `gcloud` CLI authenticated against it.

## The instance

`e2-small` is enough. The work is Postgres and server-rendered React over a small
dataset; the memory ceiling is what matters, not the cores.

```bash
gcloud compute instances create zmc-dashboard \
  --machine-type=e2-small \
  --boot-disk-size=30GB \
  --image-family=ubuntu-2404-lts \
  --image-project=ubuntu-os-cloud \
  --tags=zmc-dashboard \
  --zone=YOUR_ZONE
```

Do not open port 3000 to the internet. The app authenticates every request under `/app`,
but it is an internal tool with no rate limiting and no WAF in front of it, and there is
no reason for it to be reachable from outside. Either keep it on the internal network and
let people reach it over VPN, or put a load balancer with your existing SSO in front of it:

This matters more than it used to. `/` is a public landing page that needs no session, and
it shows the board's totals, its most recent write-ups and its contributors by name. That
is deliberate — it is what makes the practice explicable to somebody who has not signed in
— but it means the network boundary, not the login, is what keeps internal ticket keys and
repository names internal.

```bash
# Internal only: reachable from inside the VPC, including anything on the corporate VPN.
gcloud compute firewall-rules create zmc-internal \
  --allow=tcp:3000 --target-tags=zmc-dashboard --source-ranges=YOUR_VPC_CIDR
```

Install what the app needs:

```bash
sudo apt-get update
sudo apt-get install -y postgresql nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Node 22 or newer. The code uses `AbortSignal.timeout` and `--use-system-ca`, and the
latter is what lets the RSS fetch and the Cursor API work behind a corporate TLS
inspection proxy without disabling verification.

## Postgres

Two roles, because the two halves of the product have different rights. The original
dashboards only read, so they get credentials that only read. The workspace at `/app` is
written by the people using it and cannot.

```sql
CREATE DATABASE cursor_insights;
\c cursor_insights

-- Ingestion and the workspace: writes.
CREATE ROLE cursor_insights_app LOGIN PASSWORD 'generate-something-long';
GRANT ALL ON SCHEMA public TO cursor_insights_app;

-- The read-only dashboards.
CREATE ROLE cursor_insights_web LOGIN PASSWORD 'generate-something-else';
GRANT USAGE ON SCHEMA public TO cursor_insights_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cursor_insights_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO cursor_insights_web;
```

The default-privileges line is the one that is easy to miss and fails late: without it the
read-only role loses access to every table a future migration adds, and the symptom is a
page that worked yesterday.

Back this database up. It holds things that exist nowhere else — every board post, every
command and rule anyone wrote, every resource anyone found. The ingested Cursor data can
be re-fetched; none of that can.

```bash
# Daily dump to a bucket. Retention on the bucket, not in this script.
0 2 * * * pg_dump cursor_insights | gzip | \
  gsutil cp - gs://YOUR_BUCKET/zmc/$(date +\%F).sql.gz
```

## Configuration

Two env files, because the CLIs and the web app are separate processes.

`/opt/zmc/.env` for the CLIs, from `.env.example`. The values that matter:

| Variable | Why it matters |
| --- | --- |
| `DATABASE_URL` | The writing role. |
| `ENCRYPTION_KEY` | 32 random bytes, base64. Wraps every stored Cursor, GitHub and Jira credential. |
| `CURSOR_API_KEY` | Team Admin key, if you have one. Only `npm run ingest` uses it. |
| `ALLOWED_EMAIL_DOMAINS` | Who may sign in. The only access control, now that keys are optional. |

`/opt/zmc/web/.env.local` for the app, from `web/.env.example`. `ENCRYPTION_KEY` must be
**the same value** in both: it is the key the credentials were sealed with, and the app and
the CLIs both have to open them.

Generate the encryption key once and store it where you keep secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

If it is lost, every stored credential becomes unreadable and everyone has to reconnect at
`/app/connections`. Nothing else is lost — no board post, no rule, no metric — but it is an
email to the whole organisation, so put it in Secret Manager rather than only in the file.

### Who can sign in

`ALLOWED_EMAIL_DOMAINS=yourcompany.com` — **set this.** It is the only access control on
sign-in.

Since the Cursor key became optional, an email on its own is enough to get in, and an email
is a claim rather than a credential: nothing checks that the person typing
`grace@yourcompany.com` is Grace. Anyone who can reach the deployment and knows a
colleague's address can post to the board as them. Where a key *is* given it is still
verified against the email, so a key cannot be used to impersonate its owner — but that
check no longer stands between a stranger and an account.

What this means in practice:

- The domain gate plus the network boundary are the whole perimeter. Keep both.
- If your deployment sits behind SSO at the load balancer, that is what is actually
  authenticating people, and the email form is a formality. This is the recommended shape.
- If it does not, treat board authorship as attributable-but-not-proven, which is usually
  the right level of trust for an internal wall of achievements and is the wrong level for
  anything you would act on without asking.

`ADMIN_EMAILS` is separate, and is about moderation rather than access: hiding a board post
or a news item, featuring a resource, triggering a news refresh from the UI. Team owners in
the Cursor roster get it automatically when a Team Admin key is configured; without one,
this list is the only source of admins.

## Deploying

```bash
sudo mkdir -p /opt/zmc && sudo chown $USER /opt/zmc
git clone YOUR_REPO /opt/zmc && cd /opt/zmc

npm ci
npm run migrate          # idempotent; safe to re-run on every deploy
npm run preflight        # says which kind of Cursor key you configured, if any

cd web && npm ci && npm run build
```

Run `npm run migrate` on every deploy, before restarting the app. Migrations are
`IF NOT EXISTS` throughout and the runner records what it applied, so a redeploy with no
new migrations does nothing.

Do not seed. `db/seed/demo.sql` and `db/seed/workspace.sql` are synthetic content for
local development and `TRUNCATE` the tables they fill. There is no guard on them beyond
this paragraph.

### The service

```ini
# /etc/systemd/system/zmc.service
[Unit]
Description=Zero Manual Coding dashboard
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/zmc/web
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
User=www-data

[Install]
WantedBy=multi-user.target
```

`NODE_ENV=production` is not decoration: the session cookie is only marked `Secure` in
production.

```bash
sudo systemctl enable --now zmc
sudo systemctl status zmc
```

Put nginx in front for TLS:

```nginx
location / {
  proxy_set_header Host $host;
  proxy_pass http://127.0.0.1:3000;
}
```

Nothing here trusts a proxy-supplied identity header. Every route authenticates from the
`zmc_session` cookie, or is public — which, since the landing page at `/` is deliberately
public, makes the network boundary and `ALLOWED_EMAIL_DOMAINS` the two controls that
matter. See the security note above.

## The nightly job

One entry, because two of the three stages are ordered: enrichment joins agents to the
pull requests and tickets they produced, so it has nothing to join until the refresh has
pulled the day's agents.

```cron
# Cloud Agent refresh, per-user GitHub/Jira enrichment, then the news feeds.
30 3 * * *  cd /opt/zmc && npm run nightly >> /var/log/zmc-nightly.log 2>&1

# Team-wide IDE metrics. Only with a Team Admin API key; omit this line without one.
0  4 * * *  cd /opt/zmc && npm run ingest  >> /var/log/zmc-ingest.log 2>&1
```

`npm run nightly` uses each person's own stored credentials, in turn, and never fails the
run because one of them broke. A revoked Cursor key, an expired GitHub token or a
firewalled feed is recorded against the thing that caused it — visible to its owner on
their Connections page, or on the news rail for a feed — and the loop continues. The exit
code is non-zero if any stage had a failure, which is what to alert on.

The stages individually, for debugging:

```bash
npm run refresh                      # Cloud Agents, all connected users
npm run enrich -- --email person@…   # one person, using the env-var credentials
npm run news                         # feeds only
```

### When the feeds cannot be reached

Corporate egress filtering usually blocks them, and this is the most common thing to go
wrong on a fresh install. The AI News page shows each source's last error, so the
diagnosis is on the page rather than in the log. Three options, in order of preference:
allow the seven feed hosts, set `HTTPS_PROXY` in `/opt/zmc/.env`, or leave it and let
people post links by hand — the page supports that as a first-class path, not a fallback,
and a curated feed is arguably better than an automatic one anyway.

Feeds live in the `news_source` table and can be added, disabled or repointed with SQL
without a deploy.

## Verifying a deployment

In order, because each step depends on the one before:

1. `curl localhost:3000/api/health` — the app is up and can reach Postgres.
2. Open `/` signed out. The landing page explains the practice and, once the board has
   anything on it, shows the wall and the contributors. An address outside
   `ALLOWED_EMAIL_DOMAINS` must be refused at `/login`.
3. Sign in with your own email and **no** key. You should land on `/app/board`, and the
   sidebar should show only the shared pages — no Dashboard, Impact or Actions.
4. Add your Cursor key at `/app/connections`. Those three pages should appear. A wrong key
   must be rejected, and a colleague's key against your email must also be rejected.
5. `/app` shows your Cloud Agents. If it is empty, you have no agent history — check
   `/app/connections`, which distinguishes "not connected" from "connected but nothing
   found".
6. Connect GitHub and Jira at `/app/connections`, then `npm run nightly`. `/app/impact`
   should now attribute agents to tickets.
7. Post to `/app/board`, then find it again from the feed and from `/`. That is the loop the
   product exists for; if it is awkward, nothing else matters much.

## Things that will need attention later

**Everyone's key expires or is revoked eventually.** The refresh records the failure
against the user and keeps going, and they see it at `/app/connections` next time they
look — but nothing emails them. `npm run connect -- --list` shows who is currently broken.

**One VM is one point of failure.** Acceptable for an internal dashboard, and the recovery
is the Postgres backup plus a redeploy. Restoring the database is the only irreplaceable
part.

**Sessions last 14 days** (`SESSION_LIFETIME_DAYS`), then people sign in again.
Rows are the authority rather than a signed cookie, so `DELETE FROM app_session` signs
everyone out immediately, which is the lever to pull if a laptop is lost.
