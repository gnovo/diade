# Díade

> **A private shared-life application for exactly two people.**  
> One place to coordinate daily life, remember what matters, and spend less effort coordinating.

---

## Brand & Concept

* **Name:** Díade
* **Concept:** The Dyad — two distinct elements forming one shared space.
* **Palette:**
  * Primary: `#0D4F46` (Deep Pine)
  * Secondary: `#65C5B3` (Mint Accent)
  * Accent: `#A7E3D6` (Soft Highlight)
  * Background: `#F7FAF9` (Off-white canvas)
  * Surface: `#FFFFFF` (Card surface)
  * Text: `#0F172A` (Slate dark)
  * Muted: `#64748B` (Secondary text)

---

## Monorepo Structure

```text
diade/
├── apps/
│   ├── api/                     # Cloudflare Worker + Hono + Drizzle + Better Auth
│   ├── mobile/                  # React Native with Expo CNG + NativeWind
│   └── web/                     # Future React + Vite web client
│
├── packages/
│   ├── domain/                  # Entities, domain logic, recurrence calculations
│   ├── contracts/               # API endpoints, sync payloads, OpenAPI types
│   ├── validation/              # Zod validation schemas
│   ├── api-client/              # Typed REST client
│   ├── design-tokens/           # Brand color tokens, typography & spacing
│   └── config/                  # Shared TypeScript, ESLint & Prettier configs
│
├── database/
│   ├── schema/                  # Database schema definitions
│   └── migrations/              # Drizzle SQL migrations
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Tech Stack

* **Edge Backend:** [Hono](https://hono.dev) on [Cloudflare Workers](https://workers.cloudflare.com)
* **Database:** PostgreSQL on [Neon](https://neon.tech) via [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
* **ORM:** [Drizzle ORM](https://orm.drizzle.team)
* **Authentication:** [Better Auth](https://better-auth.com) (Google OAuth + Bearer session tokens for mobile, HTTP-only cookies for web)
* **Mobile Client:** React Native with **Expo CNG** (Continuous Native Generation, 100% local native builds) + [NativeWind](https://www.nativewind.dev)
* **Local Persistence:** Embedded SQLite (`expo-sqlite`) with custom Outbox/Cursor sync protocol
* **Monitoring:** [Sentry](https://sentry.io) for Workers and Mobile with strict PII scrubbing

---

## Quickstart

### Prerequisites
* Node.js `>= 20.0.0`
* pnpm `>= 10.0.0`

### Setup
```bash
pnpm install
```

### Development
```bash
# Run all development servers
pnpm dev

# Run API locally
pnpm --filter @diade/api dev

# Run typechecks & tests
pnpm typecheck
pnpm test
```
