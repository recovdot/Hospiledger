# HospiLedger: Product Spec (MVP)

Status: Draft v0.2. Source: MVP Flows 1 to 5 and the Solana devnet anchoring decision. Items marked TBD or Proposed are not from the flows and need a decision.

---

## 1. Summary

HospiLedger turns used hospitality equipment into a documented, AI-inspected digital asset. A seller uploads basic data and photos. The AI reads the equipment identity, detects damage, scores condition, and estimates fair value. The seller reviews and approves. The system anchors the passport hash on Solana devnet and publishes a **Digital Asset Passport** that buyers can view and verify.

Focus of MVP: prove asset condition and give each asset a trusted digital identity. The hash of each published passport is anchored on Solana devnet. No escrow.

## 2. Problem

Buyers of used hospitality equipment (refrigerators, ovens, and similar) cannot easily verify condition, damage, or fair price before purchase. Sellers cannot easily prove quality. This slows deals and lowers trust.

## 3. Goals and Non-Goals

### Goals
- G1. A seller can create a passport for one asset in a single session.
- G2. AI produces a structured inspection from photos: identity, OCR, damage, condition score, value range.
- G3. Seller stays in control: every passport is reviewed and approved before publish.
- G4. Published passports are shareable by link and QR. Anyone can verify integrity by recomputing the passport hash and comparing it to the hash stored on Solana devnet.

### Non-Goals (MVP)
- No escrow, payment holding, or settlement.
- No full passport data on-chain. Only the hash is stored on-chain.
- No mainnet.
- No inspector workflows or buyer verification workflows until those flows are specified.
- No native mobile app.

## 4. Users

| Role | Description | Main needs |
|---|---|---|
| Seller | Owner of hospitality assets who wants to sell | Prove condition fast, publish a trusted passport |
| Buyer | Investor or business wanting to buy used equipment | Judge condition and price without a site visit |
| Inspector | Professional who inspects equipment | TBD (flow not defined) |
| Admin | Platform operator | TBD (flow not defined) |

## 5. MVP Scope

| Flow | Name | In MVP |
|---|---|---|
| 1 | User registration and setup | Yes |
| 2 | Create asset (input and evidence) | Yes |
| 3 | AI inspection | Yes |
| 4 | Generate digital asset passport | Yes |
| 5 | Seller review and approval | Yes |
| 6 | Verification | Not specified |
| 7 | Sharing report | Partly (public passport link, QR, and integrity check only) |
| 8 | Transaction support | Not specified |

---

## 6. Epics and Requirements

### Epic 1: Registration and Setup (Flow 1)

**Goal:** role-based access so each user lands in the right dashboard.

**Stories**
- E1-S1. As a new user, I register with name, email, password, company name, phone, and role.
- E1-S2. As a user, I choose Seller, Buyer, or Inspector.
- E1-S3. As a user, I complete my company profile.
- E1-S4. As a user, I land on the dashboard for my role after login.

**Acceptance criteria**
- AC1. Registration requires name, email, password, company name, phone, and role. Missing fields show a specific error.
- AC2. On success the system creates a user, a company, and a role assignment.
- AC3. Seller goes to Seller Dashboard, Buyer to Buyer Dashboard, Inspector to Inspector Dashboard.
- AC4. A user cannot open another role's dashboard.
- AC5. Admin role cannot be selected at registration.
- AC6. A logged-out user only sees the landing page and public passports.

**Dashboards (initial content)**
- Seller: manage assets, view reports, manage sales.
- Buyer: search assets, view reports, run verification.
- Inspector: manage inspections, create reports, monitor tasks. Content TBD.

### Epic 2: Create Asset (Flow 2)

**Goal:** collect equipment data and photo evidence, then submit for AI inspection.

**Stories**
- E2-S1. As a seller, I add a new equipment record.
- E2-S2. As a seller, I upload required photos.
- E2-S3. As a seller, I submit the asset for AI inspection.

**Equipment fields:** category, brand, model, serial number, year, capacity, location, previous usage.

**Required photos:** front, side, back, nameplate. Optional: damage.

**Acceptance criteria**
- AC1. Category, brand, and model are required. Other fields are optional but encouraged. (Proposed)
- AC2. Submit is blocked until the four required photos exist.
- AC3. The system validates each photo for format and clarity. Unclear photos are rejected with a reason and the seller can replace them.
- AC4. Valid photos are stored and linked to the asset.
- AC5. On submit the system creates a passport draft with an Asset ID (`HPL-YYYY-NNNNN`) and status moves `draft` to `submitted`.
- AC6. The seller sees a hint to upload clear, original photos that show real condition.
- AC7. A seller can only see and edit assets of their own company.

### Epic 3: AI Inspection (Flow 3)

**Goal:** turn photos and data into a structured inspection.

**Analyses**
1. Equipment recognition: category, brand, model, confidence.
2. Nameplate OCR: serial number, voltage, capacity, manufacturing date.
3. Damage detection: scratch, rust, broken component, dent, dirty condition, missing parts, with overall severity.
4. Condition scoring: physical, visual, completeness, overall (0 to 100), and grade.
5. Fair value estimation: estimate and range with confidence, based on brand, age, condition, market data.

**Acceptance criteria**
- AC1. Inspection starts automatically after a successful submit. Status moves to `ai_processing`.
- AC2. Output is validated against a fixed schema before saving.
- AC3. Unreadable OCR fields are empty, never guessed.
- AC4. Value is shown as an estimate with a range and confidence, never as a single certain price.
- AC5. On success status moves to `ai_complete`. On failure after one retry status moves to `ai_failed` and the seller sees an error with an option to retry.
- AC6. Raw AI output is stored and never edited afterward.
- AC7. The seller sees inspection progress without refreshing the page.

### Epic 4: Generate Digital Asset Passport (Flow 4)

**Goal:** combine AI result and seller data into one digital identity.

**Passport contents:** Asset ID, category, brand, model, condition score, damage level, value estimate, evidence photos, seller information, timestamp.

**Acceptance criteria**
- AC1. When inspection completes, the system creates the passport content from AI result, seller data, and photos.
- AC2. Each passport has a unique Asset ID.
- AC3. On publish, the system computes a SHA-256 hash of the canonical JSON of the passport content and submits it to Solana devnet. The system stores a PassportRecord with version, inspection reference, transaction signature, cluster, slot, chain status, and anchored timestamp. No hash is stored in the database. (Proposed: anchor at publish only, not per draft version.)
- AC4. Passport moves to `pending_review` and is not visible to buyers yet.
- AC5. Once published, the passport has a shareable link and a QR code.
- AC6. Verification rebuilds the canonical JSON from stored data, hashes it, and compares it to the hash read from the Solana transaction. A mismatch is flagged.

### Epic 5: Seller Review and Approval (Flow 5)

**Goal:** keep a human in control of what gets published.

**Stories**
- E5-S1. As a seller, I read the AI draft: brand, model, condition score, damage, value, photos.
- E5-S2. As a seller, I accept the AI result.
- E5-S3. As a seller, I edit incorrect data and add notes.
- E5-S4. As a seller, I publish the approved passport.

**Acceptance criteria**
- AC1. The review screen shows AI values next to evidence photos for comparison.
- AC2. Accept marks the AI result as final and moves status to `approved`.
- AC3. Edit lets the seller correct data and add manual notes. Edits and notes are saved separately from AI output.
- AC4. After an edit the seller must confirm before status becomes `approved`.
- AC5. Publish is only possible from `approved`.
- AC6. Publishing creates a PassportRecord and submits the hash transaction to Solana devnet. The passport becomes `published` and visible only after the transaction is confirmed. (Proposed)
- AC7. The published passport shows which values were AI-generated and which were seller-edited. (Proposed)
- AC8. If the transaction fails after retries, status stays `approved`, the seller sees an error, and the seller can retry. (Proposed)

### Epic 6: Public Passport View (partial Sharing Report)

**Goal:** let buyers open and verify a published passport.

**Acceptance criteria**
- AC1. Anyone with the link or QR can open a published passport without logging in. (Proposed, confirm)
- AC2. Unpublished passports return not found.
- AC3. The page shows verified information, condition score, damage summary, value estimate range, photos, timestamp, verification status, and a link to the transaction on Solana Explorer (devnet cluster).
- AC4. Seller contact details are hidden from guests. (Proposed)
- AC5. The page has a verify action that recomputes the hash and compares it to the on-chain hash. Result is one of: match, mismatch, not found, unreachable. (Proposed)

---

## 7. Status Lifecycle

`draft` > `submitted` > `ai_processing` > `ai_complete` > `pending_review` > `approved` > `published`

Side states:
- `ai_processing` > `ai_failed` (retry returns to `ai_processing`).
- Publish attempt with failed transaction: status stays `approved`, seller sees an error, retry allowed. No `published` status until the transaction is confirmed. (Proposed)

Decisions:
- One status list replaces mixed names in the flow images ("Ready for AI Inspection", "Verified Draft", "Passport Active").
- Publish happens once, after seller approval. Flows 2 and 4 also mention publish, and Flow 5 owns it.
- Publish completes only when the Solana transaction is confirmed. (Proposed)

## 8. Key Data

Company, Profile (role, company, phone), Asset, AssetPhoto, AiInspection, Passport, PassportRecord (version log with Solana anchor), SellerReview.

PassportRecord fields: `id`, `passport_id`, `version`, `inspection_id`, `chain_status`, `chain_cluster`, `tx_signature`, `slot`, `anchored_at`, `created_at`, `updated_at`. No hash columns. The on-chain hash is the only integrity record.

See `AGENTS.md` for the schema.

## 9. Non-Functional Requirements

- **Security:** private photo storage, signed URLs, role checks server-side, no client access to service keys.
- **Chain keys:** fee-payer keypair is server-side only and never exposed to the client. Use a separate key per cluster.
- **Integrity:** AI output and integrity records are append-only.
- **Hashing:** canonical JSON (fixed key order, no whitespace) then SHA-256, so recompute is deterministic. One implementation shared by anchor and verify.
- **Devnet:** SOL comes from a faucet. Faucet rate limits apply.
- **Language:** Bahasa Indonesia UI. Currency as `Rp45.000.000`.
- **Responsiveness:** usable on mobile browsers, since sellers upload photos from phones. (Proposed)
- **Performance:** target time from submit to AI complete is TBD.
- **Accessibility:** basic keyboard and contrast support. (Proposed)

## 10. Success Metrics (Proposed, none given in flows)

| Metric | Definition | Target |
|---|---|---|
| Passport completion rate | Assets that reach `published` divided by assets submitted | TBD |
| Time to passport | Submit to `pending_review` | TBD |
| AI failure rate | Inspections ending `ai_failed` | TBD |
| Anchor failure rate | Publish attempts ending with a failed transaction | TBD |
| Seller edit rate | Passports where seller chose edit | Track only |
| Buyer views per passport | Public passport opens | Track only |

## 11. Risks

- AI misreads photos or gives a poor value estimate. Mitigation: confidence display, seller review, value range.
- Sellers upload misleading photos. Mitigation: quality checks now, inspector verification later.
- Devnet has no permanence guarantee and can be reset. With no database hash, a reset removes the only integrity proof. Mitigation: re-anchor from stored passport data after a reset (this commits current content and cannot prove earlier content), and move to mainnet after MVP.
- Users may read "on Solana" as permanent or unchangeable. The database can still change, and the anchor lets anyone detect that. Mitigation: consistent copy, "tercatat di Solana Devnet".
- Value estimates depend on market data. The source for that data is undefined.
- Publish depends on RPC and faucet-funded fees. Low signer balance or RPC outage blocks publish. Mitigation: balance check before each job, retry with backoff.

## 12. Open Questions

1. Who verifies passports after publish (Verification flow), and how?
2. What does the Inspector do, and how are inspectors approved instead of self-selected?
3. What is in the Sharing Report beyond the public passport page?
4. What does Transaction Support include without escrow?
5. Where does market data for valuation come from?
6. What is the minimum confidence for AI values before they are flagged?
7. Can guests view published passports, or only logged-in buyers?
8. Which background job runner handles inspection and anchoring?
9. Photo limits: max file size, max photos per asset.
10. Can a seller edit and republish a passport later? If yes, how are versions shown to buyers, and how is an older version verified when no hash is stored in the database?
11. Which asset categories are supported at launch?
12. Hash input: AGENTS.md assumes asset fields, approved inspection values, seller edits and notes, and photo file hashes. Raw AI output is not included. Confirm.
13. Anchor at publish only, or at every content version?
14. Memo program or custom program for the anchor transaction? (Memo is simplest.)
15. Who pays fees and how is the signer key stored in deploy?
16. Retry limit and timeout for failed devnet transactions?