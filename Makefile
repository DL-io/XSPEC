.PHONY: start stop status logs restart e2e deploy

# Load .env if present
-include .env
export

start:
	@bash XSPEC.command

stop:
	pm2 stop all
	pm2 delete all
	@echo "XSPEC stopped."

status:
	pm2 status
	@echo ""
	@curl -sf http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null \
	  || echo "⚠  /api/health unreachable — is the terminal running?"

logs:
	pm2 logs

restart:
	pm2 restart all

e2e:
	pnpm paper:e2e

deploy:
	pnpm deploy:check && railway up
