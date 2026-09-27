# hospiledger

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Elysia, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Elysia** - Type-safe, high-performance framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## Durable backend worker

Background work (AI inspection, Solana anchoring, photo cleanup) runs from the `backend_jobs`
table, one `(kind, target_id)` descriptor with SKIP LOCKED leasing. A job is claimed with a lease
(60s, heartbeated every 15s, polled every 1s); the worker stops accepting claims and drains
in-flight work on graceful shutdown. Late or exhausted claims fail closed on the domain row, never
guess: an inspection moves to `ai_failed`, an anchor record stays `failed` for explicit retry, and
ambiguous legacy pending anchors require operator reconciliation (the server refuses to reuse
them without a modern descriptor).

`public_rpc_budgets` is shared by both public RPC-bearing endpoints (`publicPassports.getByCode`
and `verify`); the budget key is the server-derived request IP, falling back to one conservative
shared budget for unknown clients.

## Database workflow

- `bun run db:generate` regenerates a forward-only migration from `packages/db/src/schema`; never
  edit an applied migration; `db:push` is for local development only, never a remote project.
- The `asset_photos` uniqueness migration includes an upfront duplicate-report preflight; it
  fails migration startup listing conflicting `(asset_id, type, storage_path)` photo IDs rather
  than deleting evidence. Resolve those rows explicitly before applying.
- Existing photos that predate the immutable path convention must be re-uploaded under a new
  non-overwrite path: run `bun apps/server/src/photo-audit.ts audit` to list integrity status and
  `bun apps/server/src/photo-audit.ts repair` to copy verified bytes. Mismatched or missing
  evidence is reported and never silently re-hashed.
- Use a separate test database (`TEST_DATABASE_URL`, pathname marked `test`); tests skip unless
  isolated, never against dev/production data.

## Verification

Public passport verification recomputes the canonical hash, reads the on-chain memo and checks
the accepted evidence bytes. It can legitimately return `mismatch` after a test/devnet reset or
if photo bytes were replaced; this limitation is disclosed in UI copy, never presented as
permanent provenance.

## Inspection and seller review

- Photo confirmation rejects unsupported, undersized, unreadable, oversized, and clearly blurred or detail-free images. Rejected slots remain replaceable and block inspection submission.
- Inspections retain immutable structured recognition and condition-scoring evidence. Without a configured market-data source, new inspections intentionally omit a price estimate; historical estimates are labeled as AI estimates without market data.
- Sellers can correct allowlisted identity, equipment, condition, and damage fields without overwriting the AI row. Corrections stay in `seller_reviews`; a separate acceptance moves the passport to `approved`.
- Published views show the folded approved corrections, preserve AI score components as AI-generated, and identify seller-corrected fields. The registered company name is informational metadata and is not part of the chain-verified hash.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@hospiledger/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Project Structure

```
hospiledger/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Elysia, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run photo-audit:audit`: Inspect existing photo bytes against stored hashes (from `apps/server`)
- `bun run photo-audit:repair`: Move verified legacy photos to non-overwrite paths (from `apps/server`)
