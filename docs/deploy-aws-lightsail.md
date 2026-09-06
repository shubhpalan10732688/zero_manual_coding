# Running the workspace on AWS Lightsail

This describes the deployment currently running in the corporate AWS Hackathon account: a
single Amazon Lightsail Ubuntu instance in `ap-south-1` serving the workspace to anyone
who can reach the instance's public IP, with Postgres on the same box, nginx terminating
TLS with a self-signed certificate, and a nightly cron. It is the shape the GCP guide
describes, translated to Lightsail because that account has no corporate DNS, no ACM
certificate, and no VPC/VPN reachable from users' laptops.

The AWS Lambda path in `serverless.yml` is a different deployment of the same code and is
unaffected by any of this. Nothing here replaces it; the two do not interact.

## What is running

| Piece | Where | Notes |
| --- | --- | --- |
| Compute | Lightsail Ubuntu 24.04 LTS, `ap-south-1` | Region: Mumbai. General-purpose $5–7/mo plan. |
| Public IP | `65.2.203.231` | Attached as a Lightsail static IP so it survives reboot. |
| Private IP | `172.26.6.171` | Internal only; ignore unless peering with an AWS VPC. |
| Repo checkout | `/opt/zmc/zero-manual-coding` | Owned by `ubuntu`. Every path below assumes this location. |
| Web app | `127.0.0.1:3000` (Next.js) | Loopback only. Not exposed to the internet. |
| Database | PostgreSQL on `127.0.0.1:5432` | Local socket. Not exposed to the internet. |
| Reverse proxy / TLS | nginx on `:443` | Self-signed certificate for the IP; see below. |
| Process supervisor | systemd unit `zmc.service` | Restarts on crash and on reboot. |
| Scheduled jobs | user crontab | `nightly` and, if a Team Admin key is set, `ingest`. |

Everything the app writes — sessions, board posts, commands, rules, resources, ingested
Cursor data — lives in the local Postgres. Losing the instance without a backup loses all
of that.

## What was set up, in order

Someone who wants to rebuild this from scratch can follow these steps. Everything below
is what is already present on the instance; the "next deploy" section further down is
what to do to ship an update.

### 1. Lightsail instance

Console → Lightsail → Create instance.

- Platform: **Linux operating system → Ubuntu 24.04 LTS** (not the Bitnami Node.js
  blueprint, which ships Apache and opinionated paths).
- Plan: **General purpose**, **Dual-stack**, `$5` or `$7`/month.
- Region: `ap-south-1` (Mumbai).
- Instance name: `Ubuntu-1`.

The `$5` plan has 512 MB RAM and needs a swap file to survive `npm run build --prefix
web`; the `$7` plan has 1 GB and does not. Either works.

### 2. Static IP

Console → Lightsail → **Networking** (left sidebar, not the instance tab) → **Create
static IP** in the same region, attach to the instance. Static IPs are free while
attached. The instance's Public IPv4 then becomes `65.2.203.231` and stays that way.

### 3. Firewall

Console → Lightsail → instance → **Networking → IPv4 Firewall**. Currently open:

- `SSH` `22`
- `HTTPS` `443`

Sources are `0.0.0.0/0` because this account does not have a corporate CIDR to restrict
to. That means **anyone on the internet who guesses the IP can reach the app**. See the
security note below.

Port `3000` and port `5432` are **not** open and should not be. They are reachable only
through nginx and through the SSH tunnel respectively.

### 4. Base packages

```bash
sudo apt-get update
sudo apt-get install -y git nginx postgresql
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Node 22 is what the project targets.

### 5. Local Postgres

```bash
sudo -u postgres psql
```

```sql
CREATE USER zmc_app WITH PASSWORD 'redacted';
CREATE DATABASE zero_manual_coding OWNER zmc_app;
```

Only the writing role. There is no separate read-only role on this deployment because
the public landing page and the workspace both go through the same pool. If a read-only
role is added later, mirror the `ALTER DEFAULT PRIVILEGES` line from
`docs/deploy-gcp-vm.md` or new migrations will silently break its view of the schema.

### 6. Repo checkout and env files

```bash
sudo mkdir -p /opt/zmc && sudo chown $USER /opt/zmc
git clone <repo-url> /opt/zmc/zero-manual-coding
cd /opt/zmc/zero-manual-coding
```

Two env files, matching the two processes:

`/opt/zmc/zero-manual-coding/.env` — the CLIs:

```dotenv
DATABASE_URL=postgres://zmc_app:PASSWORD@127.0.0.1:5432/zero_manual_coding
ENCRYPTION_KEY=<base64 32 bytes; generate once with node -e ...>
ALLOWED_EMAIL_DOMAINS=yourcompany.com
CURSOR_API_KEY=
PGSSLMODE=
```

`/opt/zmc/zero-manual-coding/web/.env.local` — the web app. `DATABASE_URL` and
`ENCRYPTION_KEY` **must be identical** to the values in `.env`, or the two processes will
be unable to open credentials the other one sealed.

```dotenv
DATABASE_URL=postgres://zmc_app:PASSWORD@127.0.0.1:5432/zero_manual_coding
ENCRYPTION_KEY=<same value as .env>
ALLOWED_EMAIL_DOMAINS=yourcompany.com
ADMIN_EMAILS=you@yourcompany.com
SESSION_LIFETIME_DAYS=14
PG_POOL_MAX=5
PG_IDLE_TIMEOUT_MS=10000
```

Both files should be `chmod 600` so only the running user can read them.

### 7. Install, migrate, build

```bash
cd /opt/zmc/zero-manual-coding
npm ci
npm ci --prefix web
npm run migrate
npm run preflight
npm run build --prefix web
```

`npm run migrate` must complete without errors before the app is started. The symptom
of running the app against an un-migrated database is a login page that says
`relation "app_user" does not exist`. If the migrations complain about permissions,
give `zmc_app` ownership of the database:

```bash
sudo -u postgres psql -d zero_manual_coding -c "ALTER DATABASE zero_manual_coding OWNER TO zmc_app;"
sudo -u postgres psql -d zero_manual_coding -c "GRANT ALL ON SCHEMA public TO zmc_app;"
```

Do not run `db/seed/demo.sql` or `db/seed/workspace.sql`. Both start with `TRUNCATE`
and are for local development only.

### 8. systemd unit

`/etc/systemd/system/zmc.service`:

```ini
[Unit]
Description=Zero Manual Coding
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/zmc/zero-manual-coding/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zmc
sudo systemctl status zmc
```

`NODE_ENV=production` is here because `next start` forces it anyway. Leaving it in the
unit file makes the behaviour explicit; changing it here does not disable it, because
`next start` overrides `process.env.NODE_ENV` at runtime.

### 9. nginx and self-signed TLS

The instance has no domain, so the certificate is issued to the IP itself. Browsers
will not trust it — that is what the "warning users will see" section below is about.

```bash
sudo openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/ssl/private/zmc.key \
  -out /etc/ssl/certs/zmc.crt \
  -subj "/CN=65.2.203.231" \
  -addext "subjectAltName=IP:65.2.203.231"
sudo chmod 600 /etc/ssl/private/zmc.key
```

Paste that as one line if the shell splits it on the backslashes.

`/etc/nginx/sites-available/zmc`:

```nginx
server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/ssl/certs/zmc.crt;
    ssl_certificate_key /etc/ssl/private/zmc.key;

    client_max_body_size 20m;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/zmc /etc/nginx/sites-enabled/zmc
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

`nginx -t` must say `syntax is ok` and `test is successful` before the reload.

### 10. Scheduled jobs

User crontab (`crontab -e`):

```cron
30 3 * * * cd /opt/zmc/zero-manual-coding && /usr/bin/npm run nightly >> /var/log/zmc-nightly.log 2>&1
0  4 * * * cd /opt/zmc/zero-manual-coding && /usr/bin/npm run ingest  >> /var/log/zmc-ingest.log 2>&1
```

Omit the `ingest` line if no Cursor Team Admin API key is configured — it will fail
every night otherwise and the logs will grow.

```bash
sudo touch /var/log/zmc-nightly.log /var/log/zmc-ingest.log
sudo chown ubuntu:ubuntu /var/log/zmc-nightly.log /var/log/zmc-ingest.log
```

## How users access it

The URL is:

```
https://65.2.203.231/
```

**They will see a browser warning the first time.** This is expected — the certificate
was issued to the IP by nobody but ourselves, so no browser's trust store recognises it.

To get past it:

- Chrome: **Advanced → Proceed to 65.2.203.231 (unsafe)**
- Edge: **Advanced → Continue to 65.2.203.231**
- Firefox: **Advanced → Accept the Risk and Continue**

Each user does this once per browser. After that the site loads normally.

Sign-in is the email form at `/login`. The Cursor API key is optional; leave it blank
for now unless the user actually wants the measured half of the workspace. Sessions
last 14 days.

## Security notes for this specific deployment

Read these before sharing the URL with anyone.

- **The firewall is open to `0.0.0.0/0` on 443.** Anyone who finds `65.2.203.231` on
  the internet can reach the login page. Because a Cursor key is optional, all they need
  is a work email inside `ALLOWED_EMAIL_DOMAINS` to get an account. Treat authorship on
  this deployment as "someone typed this address", not "the person named actually did".
- **The certificate is self-signed.** The browser warning is the user's only clue that
  the connection is encrypted correctly. Anyone teaching people to click through it is
  also teaching them to click through real warnings.
- **The landing page at `/` is public by design.** It shows the board, the contributors
  and the totals. Do not put ticket keys or repository names on the board that should
  not be visible to someone who reaches the URL without signing in.
- **Sessions are unencrypted end to end only over the nginx → Node hop.** That hop is
  loopback on the same machine, which is fine. Everything on the wire between the
  browser and nginx is TLS, self-signed or not.

When this is ready for anything beyond a demo, either restrict the Lightsail firewall to
a specific CIDR (a corporate NAT range or a small list of `/32`s), or put an actual SSO
gateway in front. The GCP guide's IAP approach is the equivalent recommendation there.

## Connecting to the database from a laptop

Do not open port `5432` in the Lightsail firewall. Use an SSH tunnel — the DB traffic
rides the SSH connection, no new port is exposed.

### One-time laptop setup

1. Lightsail console → **Account (top right) → SSH keys** → region **ap-south-1** →
   **Download** the default key. Save as e.g. `C:\Users\you\.ssh\lightsail-ap-south-1.pem`.
2. Lock down the file so SSH will accept it. Windows PowerShell:

   ```powershell
   icacls "C:\Users\you\.ssh\lightsail-ap-south-1.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
   ```

   macOS/Linux:

   ```bash
   chmod 600 ~/.ssh/lightsail-ap-south-1.pem
   ```

### Every time

Open the tunnel — leave the window open while working:

```powershell
ssh -i "C:\Users\you\.ssh\lightsail-ap-south-1.pem" `
    -L 15432:127.0.0.1:5432 `
    ubuntu@65.2.203.231 -N
```

This forwards `127.0.0.1:15432` on the laptop to `127.0.0.1:5432` on the server. The
`-N` flag means no shell, just the tunnel.

Then point any Postgres client at:

| Field | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `15432` |
| Database | `zero_manual_coding` |
| User | `zmc_app` |
| Password | as set on the server |
| SSL mode | `disable` (traffic is already inside SSH) |

DBeaver, pgAdmin and psql all take these fields directly. From the command line:

```powershell
psql "postgres://zmc_app:PASSWORD@127.0.0.1:15432/zero_manual_coding"
```

### Common tasks

Bulk insert from SQL:

```powershell
psql "postgres://zmc_app:PASSWORD@127.0.0.1:15432/zero_manual_coding" -f my-data.sql
```

CSV into a table, reading the file from the laptop:

```
\copy achievement(author_email,title,delivered,time_saved_days,happened_on) FROM 'C:/path/achievements.csv' CSV HEADER
```

Restore a dump:

```powershell
psql "postgres://zmc_app:PASSWORD@127.0.0.1:15432/zero_manual_coding" -f backup.sql
```

Sharing DB access with a teammate is either "give them the same `.pem` and the same
password" (fine for a hackathon), or add their SSH public key to
`/home/ubuntu/.ssh/authorized_keys` and create a per-person Postgres role with `CREATE
USER … GRANT ALL PRIVILEGES …`.

## Deploying an update

Everything below is idempotent and safe to run on a working deployment. Run it as
`ubuntu` on the instance.

```bash
cd /opt/zmc/zero-manual-coding
git fetch --all --prune
git pull                     # or: git reset --hard origin/main

npm ci
npm ci --prefix web

npm run migrate              # only applies new migrations; a no-op otherwise
npm run preflight            # sanity-checks whichever Cursor key is configured
npm run build --prefix web

sudo systemctl restart zmc
sleep 3
curl -s http://127.0.0.1:3000/api/health
```

Expected output from the last line:

```
{"ok":true}
```

If it is anything else, `journalctl -u zmc -n 100 --no-pager` shows why.

nginx does not need to be reloaded on a code change. It only needs a reload if
`/etc/nginx/sites-available/zmc` or the certificate files change. In that case:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Rebuilding on a small instance

If the instance is on the `$5` (512 MB) plan, `npm run build --prefix web` can be killed
by the kernel for running out of memory. Add a 1 GB swap file once — after that, builds
survive.

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Rolling back

Migrations are forward-only. Rolling code back to a previous commit is fine and
`npm run migrate` on the older code will find nothing to do (the migration table
records what was applied by filename). Rolling code back **past** a shipped migration
is not supported by this project — the schema is ahead of the code, which usually shows
up as columns the older code does not know about, not as errors.

If a bad deploy has to be undone quickly, the fastest safe path is:

```bash
git reset --hard <previous-good-sha>
npm ci
npm ci --prefix web
npm run build --prefix web
sudo systemctl restart zmc
```

Do not skip the `npm ci` steps — they are what make the running `node_modules` match
the checked-out `package-lock.json`.

## Things that will need attention later

**Backups do not exist yet on this deployment.** Add either Lightsail automatic
snapshots (a small monthly add-on in the Lightsail console) or a daily `pg_dump` to a
bucket, or both. Losing the instance today loses every board post and every stored
credential. The Cursor data can be re-ingested; the rest cannot.

**The certificate expires in 825 days from creation.** Regenerate with the same
`openssl req` line, then `sudo systemctl reload nginx`. There is nothing that will warn
about this before it happens.

**The public IP is currently open to the world.** Restrict the Lightsail firewall as
soon as there is a real user list. A `/32` per laptop is enough while the group is
small; a corporate NAT CIDR is the right long-term answer.

**The Secure cookie behaviour depends on nginx being up.** The app runs behind
`next start`, which forces `NODE_ENV=production`, so the session cookie is always
issued with the `Secure` flag. Browsers only send it back over HTTPS. If nginx is ever
stopped and traffic falls back to `http://65.2.203.231:3000`, login will silently break
in the same way it did during initial setup — the cookie is stored but never sent on
subsequent requests. Keep nginx running.

**Everyone's Cursor key expires or is revoked eventually.** The refresh records the
failure against the user and keeps going. `npm run connect -- --list` shows who is
currently broken.

**One VM is one point of failure.** Acceptable for an internal demo, and the recovery
is a Postgres backup plus a redeploy. Once backups exist, restoring the database is
the only irreplaceable part of any recovery.
