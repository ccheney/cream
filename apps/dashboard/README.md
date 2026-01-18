# Cream Trading Dashboard

Real-time web dashboard for the agentic trading system. Built with Next.js 16, React 19, and Turbopack.

## Overview

Comprehensive trading control center providing:

- **OODA Cycle Control** - Monitor and trigger trading cycles
- **Portfolio Monitoring** - Real-time positions, P&L, equity curves
- **Trading Decisions** - View agent decisions with rationale
- **Market Data** - Technical charts, options chains
- **Configuration** - Draft/test/promote workflow
- **Risk Analytics** - Greeks, exposure, VaR
- **Event Feed** - Real-time orders, fills, decisions

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1 + React 19 + Turbopack |
| Runtime | Bun 1.3+ |
| State | TanStack Query 5 (server), Zustand (client) |
| Auth | better-auth (Google OAuth + 2FA) |
| Charts | Lightweight-charts, Recharts |
| Styling | Tailwind CSS 4 |
| Real-time | WebSocket |

## Pages

- `/console` - Control panel with OODA status
- `/portfolio` - Positions and P&L
- `/decisions` - Trading decisions
- `/charts/[symbol]` - Technical analysis
- `/agents` - Agent network status
- `/config` - Configuration management
- `/risk` - Risk metrics
- `/options` - Options analytics

## Configuration

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_CREAM_ENV=PAPER|LIVE
```

## Development

```bash
# Install dependencies
bun install

# Start dev server (requires dashboard-api on port 3001)
bun run dev

# Build
bun run build

# Run tests
bun test src/

# E2E tests
bun test:e2e
```

## Key Directories

```
src/
├── app/           # Next.js App Router
├── components/    # React components
├── hooks/         # Custom hooks and queries
├── lib/           # API client, utilities
├── providers/     # Context providers
├── stores/        # Zustand stores
└── styles/        # Global styles and tokens
```

## Features

- **React Compiler** - Automatic memoization
- **Virtual Scrolling** - Large lists performance
- **Theme Support** - Dark/light mode
- **Accessibility** - ARIA, keyboard navigation
- **Error Boundaries** - Graceful error handling

## Dependencies

- `@cream/dashboard-types` - Shared types
- `@tanstack/react-query` - Server state
- `zustand` - Client state
- `framer-motion` - Animations
- `lightweight-charts` - Trading charts
