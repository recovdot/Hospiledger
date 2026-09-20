# HospiLedger: Agent Instructions

## Project Overview

**HospiLedger** is a trust platform for used hospitality equipment (commercial refrigerators, ovens, and similar). Sellers upload photos and basic data. AI inspects the asset, and the system produces a shareable **Digital Asset Passport**: a verifiable identity with condition score, damage report, value estimate, and evidence photos. The hash of each published passport is anchored on Solana Devnet. That on-chain hash is the only integrity record, so tampering can be detected.

Tagline: *Asset trust builds opportunity.*

MVP pipeline: Upload Asset > AI Inspection > Asset Passport > Verification > Sharing Report > Transaction Support.

Core user value: buyers can trust the condition of a used asset without seeing it in person.

### Product Guardrails

- **No escrow in MVP.** Do not build payment holding or settlement.
- **Anchor hashes, not data.** Only a SHA-256 hash, the asset code, and the version go on Solana. Never put photos, personal data, prices, or contact details on-chain.
- **The chain is the only integrity record.** Do not store the passport hash in the database. Do not add `dataHash` or `prevHash` columns. The database stores only a pointer to the transaction.
- **Tamper-evident, not tamper-proof.** The database can still be changed. Solana anchoring lets anyone detect that a change happened. Devnet can be reset, so anchors are not permanent. UI copy must say "tercatat di Solana" and name the cluster (Devnet). Never claim mainnet, permanence, or that data cannot be changed.
- **AI is not the final judge.** The seller reviews and approves every passport before publish. Original AI output is never overwritten.
- **Inspector and Verification flows are not specified yet.** Do not invent behavior for them. Ask first.
- **Users never need a wallet or crypto.** The platform signer pays all fees.

---

## Technology Stack

Scaffolded with Better-T-Stack (`create-better-t-stack`).

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| Runtime / package manager | Bun |
| Backend | Elysia |
| API layer | tRPC, mounted on Elysia |
| Validation | Zod (tRPC inputs and shared schemas) |
| Database | PostgreSQL (Supabase-hosted) |
| ORM | Drizzle ORM + Drizzle Kit |
| Auth | Supabase Auth |
| File storage | Supabase Storage |
| Frontend | React + Vite |
| Routing | TanStack Router |
| Server state | TanStack Query with the tRPC client |
| AI inspection | Vision-capable LLM API with structured outputs |
| Blockchain | Solana, Devnet for MVP (cluster configurable) |
| Solana SDK | `@solana/kit` + `@solana-program/memo` (server only) |
| On-chain method | Memo program transaction carrying the passport hash |
| Background jobs | TBD |
| Testing | `bun test` |

---

## Repository Structure

```
apps/
  server/                 Elysia + tRPC
    src/
      index.ts            App entry, tRPC mount, CORS
      trpc/
        context.ts        Builds context: verified Supabase user, profile, role
        procedures.ts     publicProcedure, protectedProcedure, roleProcedure()
        routers/          profile, assets, photos, inspections, passports, reviews, publicPassports
      services/           Business logic (asset, inspection, passport, review, integrity, storage)
        chain/            Solana anchoring and verification
      agents/prompts/     AI system prompts
      lib/                Supabase admin client, AI client, solana.ts, logger
  web/                    React app
    src/
      routes/             TanStack Router file-based routes
        _authed/          Requires session
          seller/         Seller dashboard, assets, review
          buyer/          Buyer dashboard, search, reports
          inspector/      Inspector dashboard (flow TBD)
        passport.$assetCode.tsx   Public passport view
      lib/
        trpc.ts           tRPC client and TanStack Query setup
        supabase.ts       Supabase browser client (auth session only)
      components/
packages/
  db/                     Drizzle schema, client, migrations
  shared/                 Zod schemas, enums, canonical hashing, types shared by server and web
```

---

## Architecture Principles

1. **Strict Decoupling**: `apps/web` never imports from `apps/server/src/services`. It only uses the tRPC client and the `AppRouter` type.
2. **Thin routers**: tRPC procedures parse input, call one service, return the result. No business rules in routers.
3. **Shared Source of Truth**: Database shape lives in `packages/db`. Enums, Zod schemas, canonical hashing, and types shared across the network live in `packages/shared`. Do not redeclare them.
4. **Engine Isolation**: `apps/server/src/services` must not import from `apps/web`.
5. **Append-only integrity**: `passport_records` rows are never updated or deleted, except to fill in chain anchoring fields.
6. **Drizzle is the only database access path** from the server. No raw SQL except Drizzle's `sql` helper with a reason.
7. **Browser never writes to the database, storage, or chain directly.** The Supabase client in the browser is for the auth session only.
8. **One hashing function.** Canonical JSON and SHA-256 live in `packages/shared`. Never re-implement.

---

## Development Environment

### Local Setup

```bash
bun install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
bun run db:push      # dev only
bun run dev
```

### Database Scripts

| Command | Purpose |
|---|---|
| `bun run db:generate` | Generate SQL migration from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:push` | Sync schema directly (local dev only, never production) |
| `bun run db:studio` | Open Drizzle Studio |

### Environment Variables

| Key | Where | Description |
|---|---|---|
| `DATABASE_URL` | server | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | server | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Server-only. Never expose to the browser |
| `AI_API_KEY` | server | AI provider key for inspection |
| `CORS_ORIGIN` | server | Allowed frontend origin |
| `SOLANA_CLUSTER` | server | `devnet` (default). Change here to switch cluster |
| `SOLANA_RPC_URL` | server | RPC endpoint for the chosen cluster |
| `SOLANA_SIGNER_SECRET` | server | Keypair that pays fees and signs memos. Devnet key only |
| `MEMO_PROGRAM_ADDRESS` | server | Optional override of the Memo program address |
| `VITE_SUPABASE_URL` | web | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | web | Public anon key |
| `VITE_SERVER_URL` | web | tRPC server base URL |
| `VITE_SOLANA_EXPLORER_CLUSTER` | web | Cluster name for explorer links only |

Never commit credentials or keypairs. Never hardcode database passwords in this file.

---

## Auth and Roles

### Auth flow

1. Browser signs up or logs in through Supabase Auth and holds the session.
2. Browser sends the access token as `Authorization: Bearer <token>` on every tRPC call.
3. tRPC context verifies the token with Supabase, then loads the user's `profiles` row.
4. `protectedProcedure` requires a verified user with a profile. `roleProcedure(...roles)` also checks `profiles.role`.
5. Role is read from `profiles.role` only. Never trust `user_metadata`, because users can edit it.

### Registration

- Flow 1 collects name, email, password, company name, phone, role.
- After Supabase sign-up, a `profile.complete` procedure creates the company and the profile in one transaction.
- Self-selectable roles: `seller`, `buyer`, `inspector`. `admin` is never selectable and is assigned manually.

### Roles

| Role | Description |
|---|---|
| `guest` | Landing page and public passport view only |
| `seller` | Manage assets, review AI results, approve and publish passports, retry failed anchors on own passports, view own reports |
| `buyer` | Search assets, view published passports and reports, request verification |
| `inspector` | Manage inspections, create reports, monitor tasks (flow TBD) |
| `admin` | Platform management, inspection audit, retry failed anchors |

- Each role routes to its own dashboard after login.
- Sellers can only read and edit assets belonging to their own company.
- Buyers and guests can only read passports with status `published`.
- Authorization checks live in services, not only in procedure guards.
- Enable RLS on every table with no anon policies, so the Supabase public API cannot read them. The server connects directly and enforces access in services.

---

## Database Conventions

- Drizzle configured with `casing: "snake_case"`. Write camelCase in TypeScript, get snake_case in PostgreSQL.
- All tables have `id` (`uuid().defaultRandom().primaryKey()`), `createdAt`, `updatedAt`. Exception: `profiles.id` equals the Supabase auth user id.
- Foreign keys always explicit with `onDelete: "cascade"` or `"set null"`.
- Use `pgEnum` for closed sets (status, role, photo type, decision, chain status).
- JSONB for flexible AI output (`ocrResult`, `damageResult`, `edits`), typed with `.$type<T>()`.
- Money is `numeric({ precision: 14, scale: 2 })` in IDR. Format as `Rp45.000.000` only in UI.
- Index `assetId` on `asset_photos`, `ai_inspections`, `passports`. Index `passportId` on `passport_records` and `seller_reviews`.
- Drizzle Kit migrations are forward-only. Never edit an applied migration. To revert, write a new migration.
- `db:push` is for local development only.

---

## Key Models

```
Company          organization that owns assets
Profile          app user data (role, company, phone), 1:1 with Supabase auth user
Asset            one piece of equipment and its basic data
AssetPhoto       evidence photo (front, side, back, nameplate, damage) with file hash
AiInspection     raw AI output: identity, OCR, damage, score, value
Passport         digital identity for an asset (assetCode, status)
PassportRecord   append-only version log with Solana anchor pointer (no hash stored)
SellerReview     seller decision (accept or edit) on a passport
```

### Schema Reference (`packages/db`)

```typescript
import {
  pgTable, pgEnum, uuid, text, varchar, integer, boolean,
  numeric, jsonb, timestamp, char, unique,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
};

export const userRole = pgEnum("user_role", ["seller", "buyer", "inspector", "admin"]);
export const photoType = pgEnum("photo_type", ["front", "side", "back", "nameplate", "damage"]);
export const inspectionStatus = pgEnum("inspection_status", ["processing", "complete", "failed"]);
export const damageSeverity = pgEnum("damage_severity", ["low", "medium", "high"]);
export const passportStatus = pgEnum("passport_status", [
  "draft", "submitted", "ai_processing", "ai_complete",
  "pending_review", "approved", "published", "ai_failed",
]);
export const reviewDecision = pgEnum("review_decision", ["accept", "edit"]);
export const chainStatus = pgEnum("chain_status", ["pending", "confirmed", "failed"]);

export const companies = pgTable("companies", {
  id: uuid().defaultRandom().primaryKey(),
  name: varchar({ length: 200 }).notNull(),
  ...timestamps,
});

export const profiles = pgTable("profiles", {
  id: uuid().primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
  name: varchar({ length: 200 }).notNull(),
  phone: varchar({ length: 30 }),
  role: userRole().notNull(),
  ...timestamps,
});

export const assets = pgTable("assets", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid().notNull().references(() => companies.id, { onDelete: "cascade" }),
  createdBy: uuid().references(() => profiles.id, { onDelete: "set null" }),
  category: varchar({ length: 100 }).notNull(),
  brand: varchar({ length: 100 }).notNull(),
  model: varchar({ length: 100 }).notNull(),
  serialNumber: varchar({ length: 100 }),
  year: integer(),
  capacity: varchar({ length: 100 }),
  location: varchar({ length: 200 }),
  previousUsage: text(),
  ...timestamps,
});

export const assetPhotos = pgTable("asset_photos", {
  id: uuid().defaultRandom().primaryKey(),
  assetId: uuid().notNull().references(() => assets.id, { onDelete: "cascade" }),
  type: photoType().notNull(),
  storagePath: text().notNull(),
  fileSha256: char({ length: 64 }).notNull(),
  qualityOk: boolean().notNull().default(false),
  ...timestamps,
});

export const aiInspections = pgTable("ai_inspections", {
  id: uuid().defaultRandom().primaryKey(),
  assetId: uuid().notNull().references(() => assets.id, { onDelete: "cascade" }),
  status: inspectionStatus().notNull().default("processing"),
  detectedBrand: varchar({ length: 100 }),
  detectedModel: varchar({ length: 100 }),
  confidence: numeric({ precision: 4, scale: 3 }),
  ocrResult: jsonb().$type<NameplateOcr>(),
  damageResult: jsonb().$type<DamageFinding[]>(),
  damageSeverity: damageSeverity(),
  conditionScore: integer(),
  grade: varchar({ length: 3 }),
  valueEstimate: numeric({ precision: 14, scale: 2 }),
  valueMin: numeric({ precision: 14, scale: 2 }),
  valueMax: numeric({ precision: 14, scale: 2 }),
  ...timestamps,
});

export const passports = pgTable("passports", {
  id: uuid().defaultRandom().primaryKey(),
  assetCode: varchar({ length: 30 }).notNull().unique(),
  assetId: uuid().notNull().references(() => assets.id, { onDelete: "cascade" }),
  inspectionId: uuid().references(() => aiInspections.id, { onDelete: "set null" }),
  status: passportStatus().notNull().default("draft"),
  publishedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const passportRecords = pgTable("passport_records", {
  id: uuid().defaultRandom().primaryKey(),
  passportId: uuid().notNull().references(() => passports.id, { onDelete: "cascade" }),
  inspectionId: uuid().references(() => aiInspections.id, { onDelete: "set null" }),
  version: integer().notNull(),
  chainStatus: chainStatus().notNull().default("pending"),
  chainCluster: varchar({ length: 20 }),
  txSignature: text(),
  slot: integer(),
  anchoredAt: timestamp({ withTimezone: true }),
  ...timestamps,
}, (table) => [unique().on(table.passportId, table.version)]);

export const sellerReviews = pgTable("seller_reviews", {
  id: uuid().defaultRandom().primaryKey(),
  passportId: uuid().notNull().references(() => passports.id, { onDelete: "cascade" }),
  reviewerId: uuid().references(() => profiles.id, { onDelete: "set null" }),
  decision: reviewDecision().notNull(),
  edits: jsonb().$type<Record<string, unknown>>(),
  notes: text(),
  reviewedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
});
```

Notes:
- The QR code and share link are derived from `assetCode`. Do not store them.
- Photos store `storagePath`, not a URL. URLs are signed on read.
- `fileSha256` is computed server-side when the upload is confirmed.
- `passport_records` has no hash columns. The hash lives only in the on-chain memo and is recomputed from passport content when needed.
- `txSignature` is the only pointer from a record to its on-chain hash.
- `chainCluster` is stored per record so records stay labeled with the cluster they were anchored on.

### Passport Status Lifecycle

```
draft > submitted > ai_processing > ai_complete > pending_review > approved > published
                        |
                        v
                    ai_failed
```

- One status list only. Do not add synonyms ("Verified Draft", "Passport Active").
- Failed image validation keeps the asset in `draft`.
- Seller edits keep the passport in `pending_review`. Edits go to `seller_reviews.edits`.
- Publish happens once, after `approved`.
- Publish waits for chain confirmation. `passports.publish` creates a `passport_records` row with `chainStatus = pending` and starts the anchor job. Status moves to `published` only after the anchor is confirmed. (Proposed)
- If anchoring fails after retries, the record gets `chainStatus = failed` and the passport stays `approved`. The seller can retry.
- Only `published` passports are visible to buyers and guests.
- Transitions go through one `transitionPassportStatus()` service that rejects illegal jumps.

### Asset Code Format

`HPL-{YYYY}-{5-digit sequence}`, for example `HPL-2026-00001`. Generated server-side inside a transaction. Never client-generated.

---

## Photo Storage (Supabase Storage)

- One private bucket: `asset-photos`. No public bucket.
- Path convention: `{companyId}/{assetId}/{photoType}-{uuid}.{ext}`.
- Upload: client calls `photos.createUploadUrl`, the server checks ownership and returns a signed upload URL, the browser uploads directly, then client calls `photos.confirmUpload`. The service verifies the file exists, computes `fileSha256`, then creates the `asset_photos` row.
- Read: the server returns short-lived signed URLs. For public passports, the server signs URLs only for `published` passports.
- Accept JPEG, PNG, WebP. Enforce a max file size (limit TBD).
- Deleting an asset must also delete its storage objects.

---

## AI Inspection Pipeline

Triggered when the seller submits an asset with the minimum photo set (front, side, back, nameplate). Damage photo is optional.

### Stage 1: Image Validation

Check format, resolution, and clarity. Store valid images. Reject unclear photos with a specific reason. AI does not start until validation passes.

### Stage 2: Equipment Recognition

Output: category, brand, model, confidence (0-1).

### Stage 3: Nameplate OCR

Output: serial number, voltage, capacity, manufacturing date. Unreadable fields are `null`. Never guess.

### Stage 4: Damage Detection

Detect: scratch, rust, broken component, dent, dirty condition, missing parts. Output: list of findings and overall severity (`low` | `medium` | `high`).

### Stage 5: Condition Scoring

```typescript
{
  physical: number,      // 0-100
  visual: number,        // 0-100
  completeness: number,  // 0-100
  overall: number,       // 0-100
  grade: string          // A, A-, B+, etc.
}
```

### Stage 6: Fair Value Estimation

Inputs: brand, age, condition, market data. Output: estimate, min, max, confidence. Always show as a range, never a single certain number.

Full output is saved to `ai_inspections`, then a draft passport is generated.

---

## LLM Conventions

- **Structured output**: always enforce a JSON schema and validate the reply with Zod before saving. Never parse freeform text.
- **Fallback**: if validation fails, retry once. If the retry fails, set inspection `failed`, passport `ai_failed`, and surface the error. Never silently swallow.
- **Confidence**: below the review threshold (TBD), flag the field for seller attention instead of presenting it as fact.
- **No fabrication**: unreadable OCR fields stay `null`. Value estimates without market data must say so.
- **Immutability**: AI output rows are never edited. Seller corrections go to `seller_reviews`.
- **System prompts** live in `apps/server/src/agents/prompts/`, not inline in service code.
- **No LLM calls inside a request.** Inspection runs through a service and a background job. The client polls the inspection status or subscribes to it.

---

## Passport Integrity Record

One layer: the Solana anchor. The chain is the source of truth. The database stores only a pointer to the transaction (`txSignature`), never the hash.

### Hash content

- `contentHash` = SHA-256 of canonical JSON (sorted keys, no whitespace) of: assetCode, asset fields, approved inspection values, seller edits, seller notes, and the `fileSha256` of every evidence photo.
- Computed on demand for anchoring and for verification. Never stored in the database.
- Canonicalization lives in one function in `packages/shared`.

### When a record is written

- On publish only. One row per publish. (Proposed: draft, generation, and approval steps are not anchored.)
- Publish waits for chain confirmation. The passport is not `published` until the anchor is `confirmed`. The seller sees "Menunggu pencatatan Solana" meanwhile. (Proposed, see open decisions.)

---

## Solana Anchoring

- Network: Devnet for MVP. Cluster comes from `SOLANA_CLUSTER`. No cluster name hardcoded in code or UI.
- Method: Memo program transaction. Memo text format: `hpl:v1:{assetCode}:{version}:{contentHash}`.
- Signer: one server-held keypair. Users never need a wallet or SOL.
- Anchoring runs in a background job after `passports.publish` creates the `passport_records` row. Never inside a request.
- Flow: build memo tx > sign > send > confirm > store `txSignature`, `slot`, `anchoredAt`, `chainCluster`, set `chainStatus = confirmed`, then transition the passport to `published`.
- On failure: retry with backoff. After the retry limit (TBD) set `chainStatus = failed` and log. The passport stays `approved`. A failed anchor never deletes or alters the record content.
- Anchoring must be idempotent. Before sending, check the record has no `txSignature`.
- Check signer balance at startup and before each job. If low, log an alert. Devnet faucets are rate-limited.
- Never commit the signer key. Use a separate key per cluster. Never reuse a devnet key on mainnet.
- Check the Memo program address and SDK version against current docs before coding. Do not assume from memory.
- Devnet can be reset. After a reset, confirmed anchors disappear and verification returns `not_found`. Recovery is an admin re-anchor from stored passport content. Re-anchoring commits the current content and cannot prove the content was unchanged before the reset.

### Verification (`verifyPassportAnchor()`)

1. Recompute `contentHash` from the current passport content.
2. Load the latest `confirmed` record. Fetch the transaction by `txSignature` and read the memo.
3. Compare the memo `assetCode` and `version` to the record, and the memo hash to the recomputed `contentHash`.
4. Return one result: `match`, `mismatch`, `pending`, `not_found`, or `unreachable`. RPC failure is `unreachable`, never `match`. A transaction missing from the chain is `not_found`.

Only the latest version can be verified, because content per version is not stored. (Proposed, see open decisions.)

---

## API Conventions (tRPC)

- One router per resource, merged into `appRouter`. Export `AppRouter` type for the web app.
- Every procedure has a Zod input schema from `packages/shared`. Validation happens at the procedure boundary.
- Use `TRPCError` with the correct code (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`). No `{ success: true }` returns.
- Queries for reads, mutations for writes. Mutations that change status go through the status transition service.
- No N+1: use Drizzle relational queries (`with`) or joins when loading photos and inspections.
- Public passport view uses `publicProcedure` and returns only `published` passports.
- Public verify is rate limited.

Proposed procedures (confirm before building):

```
profile.complete            mutation, after sign-up
assets.create               mutation, seller
assets.get / assets.list    query, seller (own company)
photos.createUploadUrl      mutation, seller
photos.confirmUpload        mutation, seller
inspections.start           mutation, seller
inspections.get             query, seller (poll status)
passports.get               query, seller (own) or buyer (published), includes chain status
reviews.submit              mutation, seller (accept or edit)
passports.publish           mutation, seller (approved only), creates record and starts anchor job
passports.retryAnchor       mutation, seller (own) or admin
publicPassports.getByCode   query, public
publicPassports.verify      query, public
```

---

## Frontend Conventions

- TanStack Router file-based routes. Auth and role guards run in `beforeLoad` on `_authed` and role layouts.
- Use TanStack Query through the tRPC client for all server data. No ad hoc `fetch`.
- Route params and search params are validated with Zod.
- Supabase browser client is used only for sign-in, sign-out, and session. Never for data or storage.
- Every list and detail view has loading, empty, and error states.

---

## Code Style

- Strict TypeScript: `"strict": true`.
- No `any`. No `as unknown as X` casts without a comment explaining why.
- No `console.log` in committed code. Use a structured logger.
- All public functions JSDoc'd with `@param` and `@returns`.
- Run the linter before every commit.
- **Imports**: use workspace package names (`@hospiledger/db`, `@hospiledger/shared`) across packages and `@/` inside an app. No relative paths across directories.

---

## Naming Rules

- No `data`, `result`, `response`, `payload` as variable names. Name the thing.
- No `handleX`, `processX`. Say what the function does: `generatePassport()`, `assignAssetCode()`, `anchorPassportRecord()`.
- No `isValid`. Use `hasRequiredPhotos()`, `isAnchorMatching()`.

---

## Comments Policy

**Default: no comments.** Code self-documents via naming.

Write a comment only when:
- The why is non-obvious and would take over 30 seconds to reconstruct.
- Regex or non-trivial arithmetic needs plain-English context.
- `TODO` / `FIXME` with owner and context.

---

## UI Copy Rules

- Primary language is Bahasa Indonesia. English support is optional and TBD.
- Currency format: `Rp45.000.000` (dot thousands separator).
- No placeholder text.
- No generic button labels: "Submit", "OK", "Next". Use: "Kirim untuk inspeksi AI", "Setujui passport", "Publikasikan passport".
- No generic notifications: "Saved!" becomes "Passport dipublikasikan."
- Always label AI output as AI-generated and show the seller approval state.
- Chain badge states: "Menunggu pencatatan Solana" (seller only, while publishing), "Tercatat di Solana Devnet" (seller and public, with explorer link to the stored signature), "Pencatatan gagal" (seller only, publish did not complete).
- No "Coming soon". Ship it or hide it.

---

## Testing

- Integration tests for the full pipeline: Add Asset > Upload Photos > AI Inspection > Passport > Seller Approval > Publish > Anchor Confirmed > Published.
- Unit tests for: Zod schemas, asset code generator, canonical JSON hashing, memo string builder and parser, anchor idempotency, anchor verification result mapping, condition score aggregation, status transition guard, publish gating on anchor confirmation, role guard.
- Mock AI calls, Supabase, and the Solana RPC in CI. Real Devnet is used only in a manual smoke test.
- Use a separate test database. Never run tests against a dev or production database.
- Coverage target: 80%+ on `apps/server/src/services/`.

```bash
bun test
```

---

## Open Decisions

Do not invent answers. Ask the owner.

- Background job runner for inspection and anchoring.
- AI provider and vision model.
- Value estimation market data source.
- Confidence threshold for flagging AI fields.
- Photo limits (max size, max count).
- Confirm: publish waits for chain confirmation (current draft: yes).
- Confirm: anchor at publish only, not at every content version (current draft: publish only).
- Confirm: hash input list under Passport Integrity Record (raw AI output excluded).
- Anchor retry limit and timeout.
- Signer key storage and fee payer in deploy.
- Republish and version history: how older versions are re-verified when no hash is stored in the database.
- Inspector role behavior and approval.
- Verification, Sharing Report, and Transaction Support flows.

---

## References

- See `PRODUCT_SPEC.md` for feature requirements and acceptance criteria.
- See `DESIGN.md` for visual tokens. Never hardcode colors or spacing outside it.