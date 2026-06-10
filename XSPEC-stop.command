#!/usr/bin/env bash
# XSPEC-stop.command — double-click to stop all XSPEC processes

cd "$(dirname "$0")"

OR=$'\033[38;5;208m' B=$'\033[1m' R=$'\033[0m' DIM=$'\033[2m' GR=$'\033[32m'

PM2_BIN="./node_modules/.bin/pm2"
[[ ! -x "$PM2_BIN" ]] && command -v pm2 &>/dev/null && PM2_BIN="pm2"

printf "\n  ${OR}${B}XSPEC${R}  Stopping all services…\n\n"

"$PM2_BIN" stop all 2>/dev/null && printf "  ✓  pm2 stop all\n" || printf "  –  (no pm2 processes running)\n"
"$PM2_BIN" delete all 2>/dev/null && printf "  ✓  pm2 delete all\n" || true

printf "\n  ${GR}XSPEC stopped.${R}\n"
printf "  ${DIM}Launch again: double-click XSPEC.command${R}\n\n"
