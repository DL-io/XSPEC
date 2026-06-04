# XSPEC Terminal - Mission Control Dashboard

## Overview

The XSPEC Terminal is the flagship operating interface for the XSPEC Autonomous Event Trading Platform. It provides institutional-grade visibility into portfolio performance, market intelligence, risk exposure, execution activity, and system health through a premium control surface.

## Pages

### Mission Control (`/`)
The main dashboard provides:
- **Command Bar** - Real-time equity, P&L, exposure, system status
- **Equity Curve** - Interactive performance chart
- **Opportunity Queue** - High-conviction signals sorted by edge
- **Active Portfolio** - Open positions with P&L
- **Live Activity Feed** - Audit event timeline
- **Risk Fortress** - All risk gates and their status
- **Reconciliation Summary** - Venue/local state sync status
- **Worker Health** - Infrastructure health indicators

### Portfolio (`/portfolio`)
Manage active positions:
- Summary metrics (equity, exposure, cash, positions)
- Positions table with market details
- Category exposure breakdown

### Opportunities (`/opportunities`)
View all detected opportunities:
- Sort by edge, confidence, or recency
- Signal cards with metrics and progress bars
- Risk approval status indicators

### Reconciliation (`/reconciliation`)
Manage venue reconciliation:
- Status indicator (matched/mismatch)
- Incident details and history
- Operator actions (acknowledge/clear)
- Troubleshooting guide

### System Health (`/health`)
Monitor infrastructure:
- Worker status summary
- Individual worker cards with heartbeat tracking
- Last error reporting
- Worker responsibilities reference

## Data Flow

```
Terminal UI
    ↓
API Routes (/api/*)
    ↓
Repositories
    ↓
MySQL Database
```

### API Endpoints

- **GET /api/overview** - Portfolio state, safety, reconciliation, audit history
- **GET /api/signals** - Opportunity signals with metrics
- **GET /api/health** - Worker status heartbeats
- **GET /api/reconciliation** - Mismatch incident state
- **PATCH /api/reconciliation** - Acknowledge or clear incidents
- **GET /api/safety** - Kill switch and authorization state
- **PATCH /api/safety** - Update safety controls

## Database Access

The terminal accesses these repositories:

- `PortfolioRepository` - Portfolio snapshots
- `ConfigOverrideRepository` - Safety state
- `ReconciliationIncidentRepository` - Mismatch incidents
- `DecisionAuditRepository` - Trade decisions and audit history
- `OrderRepository` - Order tracking and state
- `WorkerHealthRepository` - Worker status and heartbeats
- `PerformanceRepository` - Calibration metrics

## Development

### Setup

```bash
pnpm install
```

### Development Server

```bash
cd apps/terminal
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
pnpm build
```

### Type Check

```bash
pnpm typecheck
```

### Tests

```bash
pnpm test
```

## Environment Variables

Required for API routes to function:

- `DATABASE_URL` - MySQL connection string
- `NODE_ENV` - Development or production

## Architecture

### Client-Side
- Next.js 14+ App Router
- React 19 with hooks
- TypeScript (strict mode)
- CSS Modules for styling
- Recharts for visualization
- Auto-polling (5-10s intervals)

### Server-Side
- Next.js API routes
- Repository pattern for data access
- Rate limiting and auth checks
- Error handling and validation

### Database
- MySQL with Drizzle ORM
- Optimized queries via repositories
- Real-time state snapshots

## Styling

Uses CSS Modules with institutional aesthetic:
- Dark theme (#151515 background)
- Green for healthy/success
- Orange for warnings
- Red for errors/emergency
- Monospace fonts for precision (market IDs, values)
- Responsive grid layouts

## Performance

- First page load: < 2s
- Equity chart render: < 500ms
- API response time: < 500ms
- Auto-refresh interval: 5-10s
- No blocking operations
- Graceful error handling

## Deployment

The terminal is deployed as part of the XSPEC monorepo:

```bash
# Build entire monorepo
pnpm build

# Deploy terminal app
cd apps/terminal
pnpm start
```

## Production Checklist

✅ All tests passing  
✅ TypeScript strict mode  
✅ No console errors  
✅ Mobile responsive  
✅ Error boundaries present  
✅ Rate limiting enabled  
✅ Auth headers validated  
✅ Database connections optimized  
✅ API timeout handling  
✅ Graceful empty states  

## Support

For detailed implementation information, see:
- `MISSION_CONTROL_IMPLEMENTATION.md` - Architecture and design
- `.github/MISSION_CONTROL_READY.md` - Deployment guide
- `apps/terminal/app/api/` - API route handlers
- `packages/db/src/repositories.ts` - Data access patterns

## Future Enhancements

- Real-time WebSocket updates
- Advanced audit filtering
- Export to CSV/PDF
- Multi-tenant selector
- Dark/light mode toggle
- Custom risk parameters UI
- Playbook automation editor
- Historical performance analytics
