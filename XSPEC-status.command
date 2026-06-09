#!/usr/bin/env bash
# XSPEC-status.command — double-click to check XSPEC system status

cd "$(dirname "$0")"

OR=$'\033[38;5;208m' B=$'\033[1m' R=$'\033[0m' DIM=$'\033[2m'
GR=$'\033[32m' RED=$'\033[31m'
OK="${GR}✓${R}" FAIL="${RED}✗${R}"

# Load .env
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

printf "\n  ${OR}${B}XSPEC${R}  System Status  ${DIM}$(date '+%Y-%m-%d %H:%M:%S')${R}\n\n"

# ── pm2 status ────────────────────────────────────────────────────────────────
printf "  ${B}Processes${R}\n\n"
pm2_json=$(pm2 jlist 2>/dev/null || echo "[]")
services=(terminal scanner research execution reconciliation calibration alerts)
for svc in "${services[@]}"; do
  full="polyshore-${svc}"
  row=$(python3 -c "
import sys, json
try:
  data = json.loads('''${pm2_json}''')
  app = next((a for a in data if a['name'] == '${full}'), None)
  if app:
    env = app['pm2_env']
    uptime_ms = env.get('pm_uptime', 0)
    restarts = env.get('restart_time', 0)
    status = env.get('status', 'unknown')
    import time
    uptime_s = (time.time()*1000 - uptime_ms) / 1000 if uptime_ms else 0
    m, s = divmod(int(uptime_s), 60)
    h, m = divmod(m, 60)
    upstr = f'{h}h{m:02d}m' if h else f'{m}m{s:02d}s'
    print(f'{status}|{upstr}|{restarts}')
  else:
    print('missing||')
except Exception as e:
  print('unknown||')
" 2>/dev/null || echo "unknown||")
  status="${row%%|*}"; rest="${row#*|}"
  uptime="${rest%%|*}"; restarts="${rest#*|}"
  if [[ "$status" == "online" ]]; then
    printf "    ${OK}  %-16s  ${GR}RUNNING${R}  ${DIM}up %s  restarts %s${R}\n" "$svc" "$uptime" "$restarts"
  else
    printf "    ${FAIL}  %-16s  ${RED}%s${R}\n" "$svc" "${status^^}"
  fi
done

printf "\n"

# ── health endpoint ───────────────────────────────────────────────────────────
printf "  ${B}Health Endpoint${R}\n\n"
health_raw=$(curl -sf http://localhost:3000/api/health 2>/dev/null || echo "")
if [[ -n "$health_raw" ]]; then
  printf "    ${OK}  http://localhost:3000/api/health\n\n"
  # Worker heartbeats from health payload
  printf "  ${B}Worker Heartbeats${R}\n\n"
  python3 -c "
import json, sys
try:
  d = json.loads('''${health_raw}''')
  workers = d.get('workers', [])
  if not workers:
    print('    No worker heartbeats reported yet.')
  for w in workers:
    name = w.get('worker','?')
    status = w.get('status','?')
    ts = w.get('lastHeartbeatAt','?')
    sym = '✓' if status == 'ok' else '✗'
    print(f'    {sym}  {name:<22}  {ts}')
except Exception as e:
  print(f'    (parse error: {e})')
" 2>/dev/null || printf "    (could not parse health response)\n"
else
  printf "    ${FAIL}  http://localhost:3000/api/health  ${RED}unreachable${R}\n"
  printf "        ${DIM}Is the terminal app running? Try: pm2 logs polyshore-terminal${R}\n"
fi

printf "\n"
