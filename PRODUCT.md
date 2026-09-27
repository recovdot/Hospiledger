# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the **Seller** — an individual or small company owner listing used
hospitality equipment (refrigerators, ovens, similar). Their job: prove an
asset's real condition quickly and credibly, without an inspector's visit,
by publishing a verifiable Digital Asset Passport. Secondary users, confirmed
but not the MVP design priority: the Buyer (judges condition/value without a
site visit, reads the public passport, re-verifies integrity), the
platform-based Admin (later; role exists in auth model, no designed flows),
and a prospective Inspector role (role exists in auth model, but **no
behavior is specified yet** — do not invent screens for it).

## Product Purpose

Physical used-equipment trade currently depends on trust the buyer can't
verify: condition is claimed, not evidenced, and "fair price" is asserted,
not derived. HospiLedger replaces that with an envidence-driven pipeline:
a seller captures an asset (data + photos), AI inspection generates a
structured report (identity, OCR nameplate, damage findings, condition
score, fair-value range), the seller reviews, edits, and approves, and the
approved passport's content hash is anchored as a note on Solana Devnet.
Success for MVP = a completed passport reaching `published` with confirmed
on-chain anchoring, then being re-verifiable by anyone via link/QR.

## Positioning

The "asset trust" claim a competitor cannot truthfully copy: **both** a
structured AI inspection the seller reviews and **both** a
cryptographically anchored hash that anyone can recheck against a public
ledger. Condition reports alone (paper inspectors, templates, other MVPs in
this hackathon space) do not anchor; tampering stays detectable. The MVP
explicitly does NOT promise escrow, settlement, or permanence on Devnet —
copy must never make those claims.

## Operating Context

- Sellers photograph and upload from phones (non-office, real-condition
  rooms), then review on either phone or desktop. Mobile-usable is a
  recorded requirement, not negotiable.
- Bahasa Indonesia is the product language; currency rendered as
  `Rp45.000.000`. Copy must respect this (see AGENTS.md "UI Copy Rules").
- Registration/sign-in flows through Supabase Auth; role lives in
  `profiles.role`, never in client-side metadata.
- Solana anchoring is Devnet for MVP; the UI copy names the result
  neutrally ("tercatat di Solana"), never the cluster name, never
  mainnet/permanence claims.
- Hackathon/MVP scope; product spec is a working draft,
  `PRODUCT_SPEC.md` v0.2, with explicitly open TBDs (inspector flow,
  verification flow, market-data source, value-pipe).

## Capabilities and Constraints

Confirmed (from PRODUCT_SPEC and AGENTS.md):
- Passport lifecycle: `draft → submitted → ai_processing → ai_complete →
  pending_review → approved → published`, side state `ai_failed`. Publish
  completes **only** after on-chain anchor confirmed.
- Required photo set: front, side, back, nameplate; optional damage photo.
  Photo upload is user-evidence, phone camera origin.
- AI output is never edited after save; seller corrections live in
  `seller_reviews.edits`, are displayed side-by-side with the AI reading at
  review time.
- Passport content hash is canonical-JSON + SHA-256 of asset data + approved
  inspection + seller edits + photo file hashes; the hash lives only in a
  Solana memo, not in any database column.
- Verification result is one of: `match`, `mismatch`, `pending`, `not_found`,
  `unreachable` — the UI must present all of these as distinct states, never
  collapse to a binary.
- Buyers/guests can see ONLY passports of state `published`.
- AI is advisory: the seller reviews and approves; original AI output is
  never overwritten.

**Resolved 2026-09-26:** the failing pair was retired. Primary fill and focus
rings use `#a53df5` (white text = 4.58:1, AA) via the theme tokens
(`--primary`, `--color-brand`); the darker hover fill is `--color-brand-active`
`#8f2fd6`; chips use text-grade `--color-brand-strong` (`#8f2fd6` light /
`#d9b6ff` dark). `#b154f9` survives only as a decorative landing gradient
shade where no text sits on it. Dark mode is enabled with a computed .dark
palette (background #121212, foreground #fafafa, accent text #d9b6ff).

## Brand Commitments

- Name: **HospiLedger** (fixed; asset-code format `HPL-YYYY-NNNNN` is
  derived from it and must be preserved).
- Tagline: *Asset trust builds opportunity.*
- Voice/tx: Bahasa Indonesia first. Short declarative sentences. AI outputs
  are always labeled as AI-generated and the seller's approval state is
  always visible next to them — never presented as fact.
- Existing DESIGN.md (Krepling-derived adaptation for the landing page) is
  the visual reference; it stays untouched by this init.

## Evidence on Hand

Implemented so far (verified by file listing and browser smoke, 2026-09-26):
- Landing page: `apps/web/src/components/landing/` (light-only Krepling-adapted
  world; stays light even when the app theme is dark — recorded limitation,
  not a bug to fix silently).
- App shell/auth: `components/dashboard/shell.tsx` (with `ThemeToggle`),
  `components/auth/` (login, register, role guard, dashboard wrapper), routes
  `_authed.tsx`, `login.tsx` (parses OAuth `authError` from the callback),
  `register.tsx`, `auth.callback.tsx`.
- Seller flows: routes `_authed/seller/` (list, new, asset detail incl.
  staged processing/ai_failed guidance/missing-photo precision, passport
  view, review with per-field seller-attention flags), shared
  `components/passport/` (status/chain badges, per-slot photo upload,
  condition score with progressbar role, damage list, verify result with
  live region).
- Public passport: route `passport.$assetCode.tsx` (integrity section first,
  seller-edit provenance badges, honest range-not-price copy line).
- Buyer: routes `_authed/buyer.tsx` (search with inline invalid-code error).
- Domain core: `packages/shared/src` (asset-code, hashing, memo, limits,
  passport-content, status-transitions, schemas, enums; co-located tests).
- Tokens: `packages/ui/src/styles/globals.css` (light + dark shadcn tokens,
  brand purple pair, canvas/stage Krepling tokens) — single source.
- Removed: the duplicated UI tree (`components/app/shell.tsx`,
  `components/seller/{asset-create-form,asset-list,asset-workspace,
  review-view}.tsx`, `components/buyer/buyer-search.tsx`,
  `components/passport/public-passport-view.tsx`) — patterns were merged into
  the routed screens, then deleted so audits can't drift against dead code.
- Server: `apps/server/src` is a skeleton (8 files; env, context, logger).
  Known not-yet-started surface; MUST NOT be invented as existing.

## Product Principles

Seller first, decisively. When a design tradeoff stops between seller and
buyer polish, lend to the seller (photo-capture clarity, review-screen
comparison, retry flow smoothness).

Evidence beats claims. Every screen favors observed asset data, actual
photo, computed score, real hash verification over marketing story; no
invented testimonials, benchmarks, or enterprise logos.

Human-controlled, AI-assisted. AI always appears labeled and the seller's
approval state is always visible; product never treats AI output as final
or as fact beyond its confidence level.

Integrity is visible, not hidden. Chain anchoring, verification outcome,
and provenance (AI vs seller-edited) are statuses that deserve first-class
readable UI states, not a footer footnote.

Trust claims are bounded. No copy claims permanence, tamper-proofing,
escrow, or security the MVP does not provide. On-chain = tamper-evident
only; Devnet = non-permanent. Honest wording is a feature, not a disclaimer.

## Accessibility & Inclusion

Binding: WCAG 2.2 AA. Primary need cases: sellers photographing/uploading
from phones (touch targets, responsive flows) + text contrast on the pastel
and dark-section palette inherited from DESIGN.md. Known named conflict to
resolve (not here): white-on-#b154f9 fails AA for text.
