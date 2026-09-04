#!/usr/bin/env bash
# Provisions the ZMC dashboard on a Compute Engine VM that has no SSH access.
#
# Runs as root via the startup-script metadata key, on every boot. Each step records a
# marker under /var/lib/zmc-deploy and is skipped once it has succeeded, so a reboot
# resumes rather than restarts. Milestones go to the serial console because that is the
# only channel out of this machine; full command output goes to the log file.

set -uo pipefail

BUCKET="ltm-cme-labongcp-zmc-deploy"
APP_DIR="/opt/zmc"
STATE="/var/lib/zmc-deploy"
LOG="/var/log/zmc-deploy.log"

mkdir -p "$STATE" "$APP_DIR"
touch "$LOG"
chmod 600 "$LOG"

console() { echo "[zmc] $(date -Is) $*" | tee -a "$LOG" > /dev/console 2>/dev/null || true; }

run_step() {
  local name="$1"; shift
  if [ -f "$STATE/$name.done" ]; then
    console "SKIP  $name"
    return 0
  fi
  console "START $name"
  # Captured on the command itself: after `if cmd; then ...; fi` with no else, $? is the
  # status of the compound statement (0), not of the command that failed.
  local rc=0
  "$@" >> "$LOG" 2>&1 || rc=$?
  if [ "$rc" -eq 0 ]; then
    touch "$STATE/$name.done"
    console "OK    $name"
    return 0
  fi
  console "FAIL  $name (exit $rc). Last 40 log lines follow."
  tail -n 40 "$LOG" > /dev/console 2>/dev/null || true
  console "ZMC_DEPLOY_FAILED at $name"
  return $rc
}

# Fetches an object from the deploy bucket using the instance service account token.
# The image has no gcloud, so this goes straight at the JSON API.
gcs_get() {
  local object="$1" dest="$2" token
  token=$(curl -s -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
  [ -n "$token" ] || { echo "could not obtain metadata token"; return 1; }
  curl -sS -f -H "Authorization: Bearer $token" -o "$dest" \
    "https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${object}?alt=media"
}

# ---------------------------------------------------------------- swap
# e2-micro has 1 GB of RAM and `next build` needs several times that. Swap is what
# makes the build possible here at all; it is slow but it completes.
setup_swap() {
  if swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then return 0; fi
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  free -m
}

# ---------------------------------------------------------------- packages
install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y postgresql nginx git curl ca-certificates gnupg python3
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  node --version
  npm --version
}

# ---------------------------------------------------------------- postgres
setup_postgres() {
  systemctl enable --now postgresql

  if [ ! -f "$STATE/db.env" ]; then
    umask 077
    {
      echo "APP_PW=$(openssl rand -hex 24)"
      echo "WEB_PW=$(openssl rand -hex 24)"
    } > "$STATE/db.env"
  fi
  # shellcheck disable=SC1090
  . "$STATE/db.env"

  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='cursor_insights'" \
    | grep -q 1 || sudo -u postgres createdb cursor_insights

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d cursor_insights <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cursor_insights_app') THEN
    CREATE ROLE cursor_insights_app LOGIN PASSWORD '${APP_PW}';
  ELSE
    ALTER ROLE cursor_insights_app WITH LOGIN PASSWORD '${APP_PW}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cursor_insights_web') THEN
    CREATE ROLE cursor_insights_web LOGIN PASSWORD '${WEB_PW}';
  ELSE
    ALTER ROLE cursor_insights_web WITH LOGIN PASSWORD '${WEB_PW}';
  END IF;
END
\$\$;

GRANT ALL ON SCHEMA public TO cursor_insights_app;
GRANT USAGE ON SCHEMA public TO cursor_insights_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cursor_insights_web;

-- Default privileges are per grantor. Migrations run as cursor_insights_app, so the
-- entry that actually covers future tables is the one recorded FOR that role; the
-- postgres-owned entry alone silently misses every table a later migration adds.
ALTER DEFAULT PRIVILEGES FOR ROLE cursor_insights_app IN SCHEMA public
  GRANT SELECT ON TABLES TO cursor_insights_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO cursor_insights_web;
EOSQL
}

# ---------------------------------------------------------------- code
fetch_code() {
  gcs_get "zmc-deploy.tar.gz" /tmp/zmc-deploy.tar.gz
  tar -xzf /tmp/zmc-deploy.tar.gz -C "$APP_DIR"
  rm -f /tmp/zmc-deploy.tar.gz
  ls -la "$APP_DIR"
}

# ---------------------------------------------------------------- configuration
write_env() {
  # shellcheck disable=SC1090
  . "$STATE/db.env"

  if [ ! -f "$STATE/app.env" ]; then
    umask 077
    {
      echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
      echo "SESSION_SECRET=$(openssl rand -hex 32)"
    } > "$STATE/app.env"
  fi
  # shellcheck disable=SC1090
  . "$STATE/app.env"

  CURSOR_API_KEY=""
  if gcs_get "secrets.env" /tmp/secrets.env; then
    # shellcheck disable=SC1090
    . /tmp/secrets.env
    shred -u /tmp/secrets.env 2>/dev/null || rm -f /tmp/secrets.env
  fi

  umask 077
  cat > "$APP_DIR/.env" <<EOENV
DATABASE_URL=postgres://cursor_insights_app:${APP_PW}@127.0.0.1:5432/cursor_insights
PGSSLMODE=
CURSOR_API_KEY=${CURSOR_API_KEY}
CURSOR_API_BASE_URL=https://api.cursor.com
INGEST_LOOKBACK_DAYS=3
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ALLOWED_EMAIL_DOMAINS=ltimindtree.com
SESSION_LIFETIME_DAYS=14
LOG_LEVEL=info
EOENV

  cat > "$APP_DIR/web/.env.local" <<EOENV
DATABASE_URL_READONLY=postgres://cursor_insights_web:${WEB_PW}@127.0.0.1:5432/cursor_insights
DATABASE_URL=postgres://cursor_insights_app:${APP_PW}@127.0.0.1:5432/cursor_insights
PGSSLMODE=
ENCRYPTION_KEY=${ENCRYPTION_KEY}
SESSION_SECRET=${SESSION_SECRET}
ALLOWED_EMAIL_DOMAINS=ltimindtree.com
SESSION_LIFETIME_DAYS=14
AUTH_EMAIL_HEADER=x-forwarded-email
EOENV

  chmod 600 "$APP_DIR/.env" "$APP_DIR/web/.env.local"
  echo "env files written (values withheld)"
}

# ---------------------------------------------------------------- build
npm_install_root() {
  cd "$APP_DIR" || return 1
  npm ci --no-audit --no-fund
}

run_migrations() {
  cd "$APP_DIR" || return 1
  npm run migrate
}

build_web() {
  cd "$APP_DIR/web" || return 1
  npm ci --no-audit --no-fund
  NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2048 npm run build
}

# ---------------------------------------------------------------- service
setup_systemd() {
  chown -R www-data:www-data "$APP_DIR"

  cat > /etc/systemd/system/zmc.service <<'EOUNIT'
[Unit]
Description=Zero Manual Coding dashboard
After=network.target postgresql.service
Requires=postgresql.service

[Service]
WorkingDirectory=/opt/zmc/web
# Bound to loopback deliberately: nginx is the only thing that should reach the app.
ExecStart=/usr/bin/node /opt/zmc/web/scripts/next-with-system-ca.mjs start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=HOME=/opt/zmc
User=www-data
StandardOutput=append:/var/log/zmc-app.log
StandardError=append:/var/log/zmc-app.log

[Install]
WantedBy=multi-user.target
EOUNIT

  systemctl daemon-reload
  systemctl enable zmc
  systemctl restart zmc
  sleep 15
  systemctl is-active zmc
}

setup_nginx() {
  cat > /etc/nginx/sites-available/zmc <<'EONGINX'
server {
  listen 80 default_server;
  server_name _;

  location / {
    # Only this proxy may assert the SSO identity. The older dashboards trust this
    # header, so any inbound copy has to be cleared before it reaches the app.
    proxy_set_header X-Forwarded-Email "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3000;
  }
}
EONGINX

  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/zmc /etc/nginx/sites-enabled/zmc
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}

setup_cron() {
  cat > /etc/cron.d/zmc <<'EOCRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Cloud Agent refresh, per-user GitHub/Jira enrichment, then the news feeds.
30 3 * * * www-data cd /opt/zmc && HOME=/opt/zmc npm run nightly >> /var/log/zmc-nightly.log 2>&1
# Team-wide IDE metrics. Harmless without a Team Admin key; it just reports and exits.
0  4 * * * www-data cd /opt/zmc && HOME=/opt/zmc npm run ingest  >> /var/log/zmc-ingest.log 2>&1
EOCRON
  chmod 644 /etc/cron.d/zmc
  touch /var/log/zmc-nightly.log /var/log/zmc-ingest.log
  chown www-data:www-data /var/log/zmc-nightly.log /var/log/zmc-ingest.log
}

verify() {
  local body i
  # First start compiles nothing but does open the pool and read the schema; on a
  # shared-core instance that is slower than the service being reported active.
  for i in $(seq 1 20); do
    body=$(curl -sS --max-time 20 http://127.0.0.1:3000/api/health 2>&1) && break
    echo "health attempt $i failed, retrying"
    sleep 15
  done
  [ -n "${body:-}" ] || return 1
  echo "health: $body"
  # The route answers {"ok":false,...} with a 503 when the database round trip fails,
  # so the body has to be matched exactly rather than just searched for "ok".
  echo "$body" | grep -q '"ok":true' || return 1
  curl -sS -o /dev/null -w 'nginx http_code=%{http_code}\n' --max-time 20 http://127.0.0.1/api/health
}

main() {
  console "=== ZMC deploy starting ==="
  run_step swap             setup_swap        || exit 1
  run_step packages         install_packages  || exit 1
  run_step postgres         setup_postgres    || exit 1
  run_step code             fetch_code        || exit 1
  run_step env              write_env         || exit 1
  run_step npm_root         npm_install_root  || exit 1
  run_step migrations       run_migrations    || exit 1
  run_step build            build_web         || exit 1
  run_step systemd          setup_systemd     || exit 1
  run_step nginx            setup_nginx       || exit 1
  run_step cron             setup_cron        || exit 1

  if verify >> "$LOG" 2>&1; then
    console "ZMC_DEPLOY_COMPLETE"
  else
    console "ZMC_DEPLOY_VERIFY_FAILED — last 40 log lines follow."
    tail -n 40 "$LOG" > /dev/console 2>/dev/null || true
    exit 1
  fi
}

main
