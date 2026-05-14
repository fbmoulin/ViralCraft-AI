# ViralCraft-AI

> Multi-platform viral content generation with AI. Backend in Node.js + Express, frontend in vanilla JS, OpenAI-powered with graceful fallback.

[![CI](https://github.com/fbmoulin/ViralCraft-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/fbmoulin/ViralCraft-AI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## What it does

ViralCraft-AI generates platform-tailored viral content (Instagram, TikTok, YouTube, X/Twitter, LinkedIn, Facebook) across post / reel / story / short / thread / article formats. It scores content for virality, analyzes sentiment, and offers optimization suggestions before you publish.

## Stack

- **Runtime**: Node.js ≥ 18
- **Web**: Express 4, helmet, express-rate-limit, morgan
- **Persistence**: Sequelize ORM (SQLite default for dev, PostgreSQL for prod — Neon recommended)
- **AI**: OpenAI (`gpt-4o`, `gpt-3.5-turbo`, DALL·E 3) with deterministic fallback templates
- **Cache**: in-memory today; `ioredis` for distributed cache (Sprint 3)
- **Logging**: Winston with daily-rotating files + structured JSON
- **Frontend**: HTML + CSS + vanilla JavaScript (no framework)
- **Quality**: ESLint + Prettier + Husky + Jest + GitHub Actions

## Setup

```bash
git clone https://github.com/fbmoulin/ViralCraft-AI.git
cd ViralCraft-AI/ViralCraft-AI
cp .env.example .env       # then edit
npm install
npm start
```

App listens on `PORT` (default `5000`).

### Required env vars

| Variable | When | Notes |
|---|---|---|
| `NODE_ENV` | always | `development` \| `production` \| `test` |
| `CORS_ORIGIN` | production | CSV of allowed origins; empty denies all |
| `OPENAI_API_KEY` | for AI calls | Falls back to templated content if missing |
| `DATABASE_URL` | optional | `sqlite:./soulclap.db` (default) or `postgresql://...?sslmode=require` |
| `DEBUG_TOKEN` | production | Required to access `/api/debug`, `/api/test-ai`, etc. |
| `AI_RATE_LIMIT_PER_MIN` | optional | Per-IP limit on AI routes (default 20) |
| `LOG_LEVEL` | optional | `info` \| `warn` \| `error` \| `debug` |

See [`.env.example`](ViralCraft-AI/.env.example) for the full set including Sentry, Redis, Clerk, and Stripe placeholders (Sprints 3–5).

## Scripts

```bash
npm start            # node server.js
npm run dev          # nodemon
npm run lint         # eslint .
npm run lint:fix     # eslint --fix
npm run format       # prettier --write
npm run format:check # prettier --check (CI)
npm test             # jest
npm run test:coverage
npm run test:smoke   # legacy axios-based smoke test
npm run setup-db     # bootstrap the database
```

## API

| Method | Path | Notes |
|---|---|---|
| GET  | `/api/health` | Cached 30s; includes DB + AI status |
| GET  | `/api/test-integration` | Reports status of every subsystem |
| POST | `/api/generate` | Rate-limited; generates platform-tailored content |
| POST | `/api/suggest` | Rate-limited; lightweight title + outline suggestion |
| POST | `/api/extract` | Rate-limited; accepts image / PDF / text uploads |
| POST | `/api/generate-image` | Rate-limited; DALL·E 3 |
| GET / PUT | `/api/content`, `/api/content/:id` | CRUD of saved content |
| GET  | `/api/youtube/*` | YouTube video analysis |
| GET  | `/api/logs/*` | Server logs (dev) |
| GET / POST | `/api/debug`, `/api/test-ai`, `/api/clear-logs`, `/api/reinit-ai` | Admin — requires `x-debug-token` header in production |

All AI-intensive routes are rate-limited by IP (defaults: 20/min). All endpoints respect the `CORS_ORIGIN` whitelist.

## Project layout

```
ViralCraft-AI/
├── server.js                  # Express entrypoint
├── config/app.js              # Centralized config
├── routes/                    # Route modules
├── services/                  # Business logic (ai, database, cache, ...)
├── middleware/                # Express middleware (auth, monitoring, cache)
├── utils/                     # Logger, error handler, helpers
├── public/, static/           # Frontend (vanilla JS)
├── __tests__/                 # Jest unit tests
└── scripts/                   # CLI scripts (setup-db, test-apis)
```

## Roadmap

Hardening + SaaS-readiness in 5 sprints (≈ 4 weeks). See [`/root/.claude/plans/analise-e-procure-por-noble-mitten.md`](#) for the full plan.

| Sprint | Theme | Status |
|---|---|---|
| 1 | Security hardening (rate limits, CORS, CSP, debug auth) | ✅ |
| 2 | Quality pipeline (ESLint, Prettier, Husky, Jest, CI) | ✅ |
| 3 | Observability + refactor (Sentry, request IDs, Redis cache, repository pattern) | 🚧 |
| 4 | Multi-user auth (Clerk + User/Org/Member schema) | ⏳ |
| 5 | Billing (Stripe Checkout + Customer Portal + per-plan quotas) | ⏳ |

## Contributing

Branch off `main`, run `npm run lint && npm test` before pushing. Pre-commit hooks (lint-staged) keep formatting consistent.

## License

[MIT](LICENSE).
