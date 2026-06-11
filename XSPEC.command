#!/usr/bin/env bash
# XSPEC.command — double-click in Finder to launch the full XSPEC stack

cd "$(dirname "$0")"

# ── colors ────────────────────────────────────────────────────────────────────
B=$'\033[1m' R=$'\033[0m' OR=$'\033[38;5;208m'
GR=$'\033[32m' RED=$'\033[31m' DIM=$'\033[2m' CY=$'\033[36m' YL=$'\033[33m'
OK="${GR}✓${R}" FAIL="${RED}✗${R}"

clear

# ── banner ────────────────────────────────────────────────────────────────────
printf "\n${OR}${B}"
printf "  ██╗  ██╗███████╗██████╗ ███████╗ ██████╗ \n"
printf "  ╚██╗██╔╝██╔════╝██╔══██╗██╔════╝██╔════╝ \n"
printf "   ╚███╔╝ ███████╗██████╔╝█████╗  ██║      \n"
printf "   ██╔██╗ ╚════██║██╔═══╝ ██╔══╝  ██║      \n"
printf "  ██╔╝ ██╗███████║██║     ███████╗╚██████╗ \n"
printf "  ╚═╝  ╚═╝╚══════╝╚═╝     ╚══════╝ ╚═════╝ \n"
printf "${R}\n"
printf "  ${DIM}Prediction Market Operator Terminal${R}\n"
printf "  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')${R}\n\n"

# ── load .env ─────────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── prerequisite checks ───────────────────────────────────────────────────────
printf "  ${B}Prerequisites${R}\n\n"

node_ok=false; pnpm_ok=false; pm2_ok=false

if command -v node &>/dev/null; then
  node_ver=$(node --version 2>/dev/null)
  printf "    ${OK}  %-10s  ${DIM}%s${R}\n" "node" "$node_ver"
  node_ok=true
else
  printf "    ${FAIL}  %-10s  ${RED}not found${R}\n" "node"
fi

if command -v pnpm &>/dev/null; then
  pnpm_ver=$(pnpm --version 2>/dev/null)
  printf "    ${OK}  %-10s  ${DIM}%s${R}\n" "pnpm" "$pnpm_ver"
  pnpm_ok=true
else
  printf "    ${FAIL}  %-10s  ${RED}not found${R}\n" "pnpm"
fi

PM2_BIN="./node_modules/.bin/pm2"
if [[ -x "$PM2_BIN" ]]; then
  pm2_ver=$("$PM2_BIN" --version 2>/dev/null)
  printf "    ${OK}  %-10s  ${DIM}%s (local)${R}\n" "pm2" "$pm2_ver"
  pm2_ok=true
elif command -v pm2 &>/dev/null; then
  PM2_BIN="pm2"
  pm2_ver=$(pm2 --version 2>/dev/null)
  printf "    ${OK}  %-10s  ${DIM}%s (global)${R}\n" "pm2" "$pm2_ver"
  pm2_ok=true
else
  printf "    ${FAIL}  %-10s  ${RED}not found — will install via pnpm${R}\n" "pm2"
  pm2_ok=false
fi

printf "\n"

if [[ "$node_ok" == false ]]; then
  printf "  ${RED}${B}node is required. Install from https://nodejs.org${R}\n\n"
  read -rp "  Press Enter to exit…"
  exit 1
fi

# ── install dependencies ──────────────────────────────────────────────────────
if [[ ! -d node_modules ]] || [[ pnpm-lock.yaml -nt node_modules/.modules.yaml ]]; then
  printf "  ${YL}Installing dependencies…${R}\n\n"
  pnpm install
  printf "\n"
fi

# Resolve pm2 after install if it wasn't found before
if [[ "$pm2_ok" == false ]]; then
  PM2_BIN="./node_modules/.bin/pm2"
  if [[ -x "$PM2_BIN" ]]; then
    pm2_ver=$("$PM2_BIN" --version 2>/dev/null)
    printf "    ${OK}  %-10s  ${DIM}%s (installed by pnpm)${R}\n\n" "pm2" "$pm2_ver"
    pm2_ok=true
  else
    printf "  ${RED}${B}pm2 could not be found. Run: pnpm install${R}\n\n"
    read -rp "  Press Enter to exit…"
    exit 1
  fi
fi

# ── connectivity checks ───────────────────────────────────────────────────────
printf "  ${B}Connectivity${R}\n\n"

# MySQL
if [[ -n "${DATABASE_URL:-}" ]]; then
  db_result=$(node -e "
    const m = require('mysql2/promise');
    m.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 6000 })
      .then(c => c.end())
      .then(() => process.stdout.write('ok'))
      .catch(e => process.stdout.write('err:' + e.message.split('\n')[0]));
  " 2>/dev/null)
  if [[ "$db_result" == "ok" ]]; then
    printf "    ${OK}  %-10s  ${DIM}connected${R}\n" "mysql"
  else
    printf "    ${FAIL}  %-10s  ${RED}%s${R}\n" "mysql" "${db_result#err:}"
  fi
else
  printf "    ${FAIL}  %-10s  ${RED}DATABASE_URL not set in .env${R}\n" "mysql"
fi

# Redis
if [[ -n "${REDIS_URL:-}" ]]; then
  redis_result=$(node -e "
    const { createClient } = require('redis');
    const c = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 6000, tls: process.env.REDIS_URL.startsWith('rediss') } });
    c.connect()
      .then(() => c.ping())
      .then(() => { c.disconnect(); process.stdout.write('ok'); })
      .catch(e => process.stdout.write('err:' + e.message.split('\n')[0]));
  " 2>/dev/null)
  if [[ "$redis_result" == "ok" ]]; then
    printf "    ${OK}  %-10s  ${DIM}connected${R}\n" "redis"
  else
    printf "    ${FAIL}  %-10s  ${RED}%s${R}\n" "redis" "${redis_result#err:}"
  fi
else
  printf "    ${FAIL}  %-10s  ${RED}REDIS_URL not set in .env${R}\n" "redis"
fi

printf "\n"

# ── kill stale process on port 3000 ───────────────────────────────────────────
stale_pids=$(lsof -ti:3000 2>/dev/null || true)
if [[ -n "$stale_pids" ]]; then
  printf "  Clearing port 3000… "
  echo "$stale_pids" | xargs kill -9 2>/dev/null || true
  sleep 1
  printf "done\n\n"
fi

# ── run database migrations ───────────────────────────────────────────────────
printf "  ${B}Database Migrations${R}\n\n"
if pnpm db:migrate 2>&1 | sed 's/^/    /'; then
  printf "\n    ${OK}  Migrations up to date\n\n"
else
  printf "\n    ${FAIL}  Migration failed — check DATABASE_URL and network\n\n"
  read -rp "  Press Enter to continue anyway or Ctrl+C to abort…"
fi

# ── bootstrap tenant + safety state ──────────────────────────────────────────
printf "  ${B}Bootstrap${R}\n\n"
if pnpm bootstrap 2>/dev/null; then
  printf "\n"
else
  printf "    ${FAIL}  Bootstrap failed — check DATABASE_URL and run pnpm db:migrate\n\n"
fi

# ── start via pm2 ─────────────────────────────────────────────────────────────
printf "  ${B}Starting XSPEC…${R}\n\n"
"$PM2_BIN" delete all 2>/dev/null || true
"$PM2_BIN" start ecosystem.config.cjs
printf "\n"

# ── wait for health endpoint ──────────────────────────────────────────────────
printf "  Waiting for terminal app"
ready=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    ready=true
    break
  fi
  printf "."
  sleep 1
done
printf "\n\n"

# ── open browser ──────────────────────────────────────────────────────────────
if [[ "$ready" == true ]]; then
  printf "  ${OK}  Terminal ready\n"
  open http://localhost:3000
else
  printf "  ${FAIL}  Terminal did not respond within 30s\n"
  printf "       ${DIM}$PM2_BIN logs polyshore-terminal${R}\n"
fi

printf "\n"

# ── final status table ────────────────────────────────────────────────────────
printf "  ${B}Service Status${R}\n\n"
pm2_json=$("$PM2_BIN" jlist 2>/dev/null || echo "[]")
services=(terminal scanner research execution reconciliation calibration alerts)
for svc in "${services[@]}"; do
  full="polyshore-${svc}"
  status=$(python3 -c "
import sys, json
try:
  data = json.loads('''${pm2_json}''')
  app = next((a for a in data if a['name'] == '${full}'), None)
  print(app['pm2_env']['status'] if app else 'missing')
except:
  print('unknown')
" 2>/dev/null || echo "unknown")
  if [[ "$status" == "online" ]]; then
    printf "    ${OK}  %-16s  ${GR}RUNNING${R}\n" "$svc"
  else
    printf "    ${FAIL}  %-16s  ${RED}%s${R}\n" "$svc" "${status^^}"
  fi
done

printf "\n"
printf "  ${OR}${B}XSPEC is running.${R}  http://localhost:3000\n"
printf "  ${DIM}Stop: double-click XSPEC-stop.command  ·  Logs below${R}\n"
printf "  ${DIM}────────────────────────────────────────────────────${R}\n\n"

# ── tail logs (keeps window open) ────────────────────────────────────────────
"$PM2_BIN" logs
