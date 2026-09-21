# Design System: Krepling (reference) + HospiLedger Landing adaptation

## HospiLedger Landing adaptation (implemented)

The landing page (`apps/web/src/components/landing/`) adapts this Krepling
system. Coding rules below are binding for landing work; the rest of this
document is the original Krepling reference.

### Tokens in code

| Token | Value | Where |
|---|---|---|
| Heading scale | `text-[2.5rem]/[1.04]/[-0.03em]` → md `3.75rem` → lg `4.25rem`, weight 400 | `primitives.tsx` `headingXl` |
| Kicker/eyebrow | 14–16px, uppercase, `tracking 0.14em`, `{colors.text-muted}` | `primitives.tsx` `kicker` |
| Hero display | mobile `3rem`, md `5.25rem`, same leading/tracking | `hero.tsx` |
| Radius | cards/panels 28px (`rounded-[28px]`), FAQ/pricing cards 28px, buttons pills (`rounded-full`) | all sections |
| Action color | purple `{colors.primary}` `#b154f9` — the only chromatic color except headline/panel gradients | `ActionButton` primary |
| Outline border | gray, 15% black on light contexts (`border-black/15`), white on dark — deviates from Krepling's purple outline for a quieter pill look | `ActionButton` outline |
| Canvas/stage | `#f1f1f1` light, `#171717` dark; dark panel fill `#242424` inside dark sections | `SectionShell`, features |
| Muted text | `#6c6b6b` on light, `#a3a3a3` on dark | all sections |
| Content gradient | `linear-gradient(135deg, #aee8f9, #c9c2f5 45%, #b78aff)` — pastel mock panel that hosts floating hero/CTA visuals | `primitives.tsx` `mockPanelGradient` |
| Gradient text | `linear-gradient(92deg, #b78aff, #c58cff, #8ab6ff)` on `<em>`, 2–4 words per headline | `primitives.tsx` `GradientWord`; CTA uses a darker twin `#a53df5 → #7048e8` for contrast on the pastel panel |
| Numeric step color | purple numbers `01–05` in the pipeline list | `services.tsx` |

### Layout conventions

- Container: `max-w-[1180px]`, px 20/32. Hero headline `max-w-4xl`.
- Full-bleed tone alternation on the page: hero, promo, about, services → canvas; features → stage; pricing, faq → canvas; cta, footer → stage.
- Sections open with a one-line huge statement headline; body copy is limited to one lead paragraph per section.
- Promo band: standout banner on the pastel `mockPanelGradient` (28px radius, max-w-4xl), bold 24/30px headline + muted subline, animated purple Sparkles tile in a white/70 squircle, gently pulsing purple pill CTA.
- Services pipeline: single white panel, 2-line rows (number + title + body) with hairline dividers (`border-black/8`), NOT a card grid.
- Features: six stacked full-width dark panels (#242424 on #171717), 28px radius, 20px gap; icon in a 56px `bg-[#b154f9]/15` tile.
- FAQ: white 28px container, hairline dividers, question rows text-xl/2xl, chevron rotates 180°.
- Footer: stage fill, 3 columns, hairline `white/10` divider, exact integrity line "Tercatat di Solana — integritas dapat diverifikasi ulang."

### Mock-visual language [S-derived]

- Float cards (passport summary, AI score chip, damage chip) sit absolutely on the `mockPanelGradient` panel and bob on independent sine-ish loops (5–7s, delays up to 1.6s, `easeInOut`, infinite). No real images.
- Hero panel depth stack: frosted "glass tubes" (white/25–35 `backdrop-blur-sm`, full-height rounded-b-full bars), soft white blur blobs, and 3 drifting labeled icon tiles (white/70 backdrop-blur chips with thin-line lucide icons: Camera, ScanLine, ChefHat) at independent 4-axis drift+rotate loops. A QR mock chip completes the mix; damage/QR chips are hidden on mobile to avoid overlap with the passport card.
- Score chip bar animates `width 0 → 82%` (1.2s easeOut, 0.6s delay) when in view.
- Passport card: white, 16px radius, mono asset code `HPL-…`, badge `Tercatat di Solana` in `#b154f9/10`.
- Score chip: `#171717` fill, white text, purple progress bar at 82%.

### Motion spec (framer-motion / `motion/react`, in `primitives.tsx` + sections)

- `Reveal`: `initial {opacity: 0, y: 32}` → `whileInView`, `once: true`, viewport margin `-80px`; 0.7s `easeOut`; optional `delay` (0.08–0.15s stagger inside grids/lists).
- `MotionCard` (feature rows) and `HoverCard` (pricing): same reveal with viewport margin `-60px`, hover lift −4/−6px as spring (`stiffness 300, damping 24`).
- Navbar: `y −72 → 0` slide-in, 0.6s easeOut, sticky with `bg-[#f1f1f1]/90 backdrop-blur`.
- Hero cascade delays 0 / 0.1 / 0.25 / 0.4s; passport panel reveals with `y: 48`, 0.9s easeOut; float loops 5–7s infinite.
- FAQ answer: `AnimatePresence` height 0 → auto + opacity, 0.3s `easeInOut`.
- Buttons/nav links: color/border `transition-colors duration-300`.
- `prefers-reduced-motion` is NOT yet handled — add a fallback before production.

### Known gaps vs Krepling reference

- No section-switcher widget, marquee rows, glass hero objects, connector-notch mock blobs, 3D renders, or video stages; replaced by CSS mock panels.
- Font is system fallback (no webfont bundled); upgrade path: swap to Inter/Hanken Grotesk 400 without touching headings markup.
- Buttons stay `disabled` placeholders until auth routes exist; then swap to `<Link>` pills, same tokens.

---

# Krepling reference (extracted)

## Overview

Krepling sells "commerce without code" by looking like a soft, tactile toy box. A light gray canvas and a charcoal stage alternate as the page scrolls. Big rounded cards stack over one another. Pastel gradient panels hold floating UI fragments that look like snapped-together blocks. Type is large, regular weight, sentence case. Saturation lives in three places: the purple action color, gradient words inside headlines, and third-party integration tiles.

The product is shown as pieces of UI (notification, cart, workflow node, template picker) joined by concave connector notches, so the page feels like the drag-and-drop builder it sells.

**Key Characteristics:**
- Alternating light and dark full-section backgrounds, swapped on scroll
- Stacked rounded cards (white, black, white) sliding over one another
- Three named gradient stages (Workflows, Storefront, Dashboard), each with a matching gradient-text twin
- Gradient text on the key phrase of section headlines
- One action color: purple `#b154f9`
- PP Radio Grotesk at weight 400 for everything except the wordmark
- Oversized headings with negative tracking
- Fluid, viewport-width-based sizing
- Sticky three-tab section switcher pinned bottom-right
- No shadows, no dark mode
- Heavy scroll-driven motion

Tags: **[E]** extracted from CSS, **[S]** estimated from screenshots.

## Colors

### Core palette [E]
Seven permanent tokens, all CSS variables on `:root`.

| Token | Hex | CSS var | Use |
|---|---|---|---|
| `{colors.ink}` | #000000 | `--color-black` | Headings, body, black cards |
| `{colors.paper}` | #ffffff | `--color-white` | White cards, text on dark |
| `{colors.canvas}` | #f1f1f1 | `--color-gray-100` | Page background, nav, inner rows |
| `{colors.gray-300}` | #b3b3b3 | `--color-gray-300` | Muted text on dark |
| `{colors.text-muted}` | #6c6b6b | `--color-gray-500` | Muted text on light |
| `{colors.gray-700}` | #2e2e2e | `--color-gray-700` | Dark panels inside black cards |
| `{colors.stage}` | #171717 | `--color-gray-900` | Dark section background, footer |
| `{colors.primary}` | #b154f9 | `--color-krepling-purple` | CTA fill, outline borders, active states |

Each color also ships an `--rgb` twin variable (for example `--color-black--rgb: 0,0,0`) for alpha use. Observed alpha variants on black: 1, 0.1, 0.3; on white: 1, 0.3, 0.4.

### Gradients [E]

| Variable | Value | Use |
|---|---|---|
| `--gradient-workflows-bg` | `linear-gradient(90.01deg, #f8d1c9 0.01%, #ddf 99.99%)` (`#ddccff` end) | Workflows stage |
| `--gradient-workflows-text` | `linear-gradient(92.37deg, #b78aff 16.58%, #fe9c72 90.82%)` | Workflows headline words |
| `--gradient-storefront-bg` | `linear-gradient(90deg, #8dc8ff 0.01%, #9dffca 99.99%)` | Storefront stage |
| `--gradient-storefront-text` | `linear-gradient(92.37deg, #a8dafa 16.58%, #99f8cd 90.82%)` | Storefront headline words |
| `--gradient-dashboard-bg` | `linear-gradient(90deg, #ccedff 0.01%, #c9a9ff 99.99%)` | Dashboard stage |
| `--gradient-dashboard-text` | `linear-gradient(95.66deg, #77b5ff 18.09%, #a782ff 88.64%)` | Dashboard headline words |
| `--gradient-krepling` | `linear-gradient(90deg, #8300e9 0.01%, #b154f9 99.99%)` | Brand purple gradient |
| (unnamed) | `linear-gradient(0deg, #f1f1f1 20%, rgba(255,255,255,0) 100%)` | Fade into canvas |

Gradient text is applied on `em` elements (clip to text). Two to four words per headline.

### Content-level colors (not system) [E]
Extractor classes 28 tokens as content. They belong to partner brand tiles and product imagery, for example `#635bff`, `#ffe01b`, `#93d33e`, `#f22f46`, `#ff7a59`, `#f9c2cf`, `#03363d`, `#ffc439`, `#00ace5`, `#e43225`, `#4b154c`, `#1ab4d7`, `#f89734`. Do not adopt them as Krepling tokens.

### Color rules
- Purple is the only chromatic system color besides gradients.
- Accessibility: white on `{colors.primary}` measures 3.81:1, which fails AA for normal text. White on `#00ace5` (a partner tile) is 2.61:1.
- Footer glow behind the closing CTA reads as dark plum [S]. No matching token exists; likely a radial gradient of purple over `{colors.stage}`.

## Typography

### Font family [E]
**PP Radio Grotesk** (Pangram Pangram, commercial). Loaded files (woff2 and woff, served from `/_next/static/media/`):
- Regular 400
- Regular Italic 400
- Bold 700
- Bold Italic 700

Font-face names are registered as `Regular`, `Italic`, `Bold`, `BoldItalic`, which is why other extractors report the family as "Regular". No Google Fonts. Substitute options: a grotesque with a compact feel such as Inter or Hanken Grotesk at 400.

### Hierarchy [E]

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `{typography.display-xxl}` | 80px | 400 | 88px | -0.8px | Hero headline |
| `{typography.display-xl-tight}` | 64px | 400 | 70px | -0.64px | Statement headlines (h1, h2) |
| `{typography.display-xl}` | 48px | 400 | 62px | normal | Inline icon-plus-phrase run |
| `{typography.display-md}` | 32px | 400 | 42px | normal | Hero side line, card titles |
| `{typography.heading-lg}` | 24px | 400 | 26px | 0.48px | Sub-headings |
| `{typography.body-22}` | 22px | 400 | 37px | 0.44px | Lead paragraphs |
| `{typography.body}` | 18px | 400 | 23px | 0.36px | Default paragraphs |
| `{typography.overline}` | 16px | 400 | 21px | 0.16px | Nav, buttons, small text |

Minimum font size observed: 16px on live page copy. Text inside product mockups renders smaller (10 to 12px) [S].

### Principles
- Scale creates hierarchy. Headings are not bold.
- Tight tracking at display sizes (about -0.01em), slightly open at body sizes (+0.02em).
- Emphasis is a gradient on `em`, not weight or italic.
- Bold 700 is loaded but appears only in the wordmark and rare labels [S].
- Sentence case. Statement headlines end with a period; card titles and FAQ questions do not.

## Layout

### Spacing [E]
- Base unit 4px
- Scale: 4, 8, 12, 16, 20, 24, 32, 48, 64, 80, 92, 96, 100, 128
- Section spacing: 48, 64, 80, 92, 96, 100, 128, 192, 240
- Max content width 1000px, 12-column grid, full-width alignment

### Fluid sizing [E]
- `--vw: 1vw`, `--vh: 1vh`
- `--indent: max(0.625rem, 1.3888888889vw)` (about 20px at a 1440px design width)
- `--navigationHeight: max(3.5rem, 5.5555555556vw)` (about 80px at 1440px)
- Design width appears to be 1440px; sizes scale with the viewport between breakpoints.

### Breakpoints [E]

| Variable | Value | Rules |
|---|---|---|
| `--breakpoint-medium` | 600px | 88 |
| `--breakpoint-desktop` | 1000px | 801 (main layout) |
| `--breakpoint-large` | 1400px | 112 |
| max-width | 999px | 56 |
| max-width | 599px | 7 |
| `(any-hover: hover)` | | 64 (hover styles gated) |

### Composition [S]
- Hero: headline bottom-left, subhead and CTA right, glass objects centered.
- Stacked feature cards in a ~1200px column on a ~1865px viewport.
- FAQ and integrations in a left-offset column.
- Section switcher fixed bottom-right.
- Sections open with one giant icon-plus-title on an almost empty screen.

## Elevation & Depth
No shadow tokens [E]. Depth comes from fill contrast, card overlap, and the hero's blurred glass objects [S].

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat on canvas | Headings, body |
| 1 | White or black rounded card | Feature stack cards |
| 2 | Card overlapping the previous card | Scroll-stack effect |
| 3 | Gradient stage with nested blob panels | Product mockups |
| Glass | Frosted tubes and lens with blurred icons | Hero |

## Shapes

### Radius scale [E]

| Value | Freq | Use |
|---|---|---|
| 8px | 42 | Lists, brand chips |
| 10px | 60 | Primary and outline buttons |
| 12px | 12 | Images |
| 14px | 165 | Cards, secondary and ghost buttons, list items |
| 20px | 3 | Rare containers |
| 30px | 6 | Large panels |
| `32px 0 0 32px` | 6 | Product window (left edge only) |
| 100px | 27 | Pill outline buttons, badges |

Stacked feature cards and stages read ~24 to 28px, blob panels ~40 to 60px, icon tiles ~28% squircle [S].

### Motif [S]
Mockup panels are pill-like blocks joined by concave connector curves, like building blocks. Section icons sit in black or white squircles with thin line icons.

## Components

### Buttons [E]
All labels 16px, weight 400.

| Variant | Fill | Border | Radius | Padding | Transition |
|---|---|---|---|---|---|
| `button-primary` | `{colors.primary}`, white label | none | 10px | 14px 16px | background-color 0.3s |
| `button-outline-light` | transparent, black label | 1px `{colors.primary}` | 10px | 14px 16px | bg, border, color 0.3s |
| `button-outline-dark` | transparent, white label | 1px white | 10px | 14px 16px | bg, border, color 0.3s |
| `button-outline-pill` | transparent, black label | 1px black | 100px | 10px 18px | bg, color 0.3s |
| `button-secondary` | white, black label | none | 14px | 16px | all |
| `button-ghost` | transparent, black or white | none | 14px | 12px 18px | bg, opacity 0.3s |
| `link-default` | transparent, black | none | 0 | 21px 0 | all |

Easing for these is `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (`--ease-quad-out`). Focus-visible and active states change 2 to 3 properties.

### Navigation
- **`nav-bar`** [E]: fill `{colors.canvas}`, radius 0. Logo left, links center (Features, Pricing, Company and Resources with chevrons), right: "Log in" ghost plus outlined "Get started" [S]. Transparent over the hero [S].
- **`section-switcher`** [S]: fixed bottom-right stack of three tabs, ~230 by 85px, ~14px radius. Active: white fill. Inactive: translucent tint that adopts the section background.

### Cards & containers
- **`card-filled`** [E]: black, white text, radius 14px, padding 32px 24px 24px.
- **`card-featured`** [E]: fill `#f89734`, black text, radius 14px, padding 20px 20px 30px (rare variant).
- **`feature-card-light` and `feature-card-dark`** [S]: white or black, ~24 to 28px radius, 32 to 40px title, muted body, visual anchored bottom.
- **`stage-panel`** [S]: full-width gradient panel with ~24px side margin holding a mockup.
- **`mock-blob`** [S]: dark translucent or light panel with connector notches.
- **`notification-toast`**, **`workflow-node`** (circular chevron and plus connectors), **`order-card`** (tilted, two black pill actions), **`status-badge`** (soft orange "Low stock") [S].

### Integrations [S]
- **`brand-chip`**: wide rounded rectangle (~450 by 180px, ~8px radius) in the partner's color, two rows scrolling horizontally with offset.
- **`app-icon-squircle`**: tilted squircle tiles falling from the bottom of the Integrate card.

### Feature run [S]
`inline-feature-run`: 48px phrases each prefixed with a thin outline icon, comma-separated, wrapping.

### Inputs [S]
`prompt-input`: black fill, 1px light-blue outline, ~10px radius, blinking caret, magnifier icon right.

### FAQ [S]
`faq-accordion`: white container, ~14px radius, 1px hairline dividers, chevron right (down closed, up open), muted answer text.

### Product mockup [S]
`app-window`: white, left-rounded (`32px 0 0 32px` [E]), real admin UI with tabs (Marketing active in purple), form column, When / Who / What blocks with colored left borders.

### Footer [E]
Fill `{colors.stage}` (#171717), white text, padding 96px 0 32px, radius 0. Columns Products, Company, Resources. Social icons bottom-left, copyright bottom-right.

### Icons [E]
Custom set, library unknown. 215 icons, mixed color mode. Most common sizes 15px (40), 18px (19), 12px (16), 21px (16), 35px (17). Thin outline style [S].

## Motion

### Tokens [E]

| Label | Duration | Freq |
|---|---|---|
| medium | 300ms | 14 |
| large | 600ms | 5 |
| xl | 2000ms | 11 |

- Primary easing: `ease`
- Easing library on `:root`: `--ease-cubic*`, `--ease-circ*`, `--ease-expo*`, `--ease-quad*`, `--ease-quart*`, `--ease-quint*`, `--ease-sine*`, `--ease-back*` (in, out, in-out each). Most used: `--ease-quad-out` `cubic-bezier(0.25,0.46,0.45,0.94)` (14 uses), `--ease-expo-out` `cubic-bezier(0.19,1,0.22,1)` (7 uses).
- CSS `@keyframes`: none found. Scroll motion is almost certainly JS-driven [inferred].
- `prefers-reduced-motion`: not detected. Add a fallback when recreating.

### Scroll choreography [S]
- **Theme swap**: page background moves canvas, to stage, and back. Switcher tabs re-tint to match.
- **Card stacking**: cards pin and the next slides over the previous. The lower card's title stays visible at the top edge.
- **Section opener**: giant icon plus title, then a gradient stage rises.
- **Headline reveal** with gradient words.
- **Hero**: glass tubes and icon tiles drift, tiles fall through the tubes.
- **Mockup micro-interactions**: animated cursor, slider thumb, blinking caret, workflow nodes appearing in sequence, tilted order rows scrolling sideways.
- **Marquee**: brand chip rows scroll horizontally, offset per row.
- Likely uses the 2000ms token and `--ease-expo-out` for long moves.

## Accessibility [E]
- Target WCAG 2.2 AA
- Focus indicator: `outline: rgb(16,16,16) auto 1px`, offset 1px, consistent
- Minimum touch target observed 15 by 15px (icons)

| Foreground | Background | Ratio | AA |
|---|---|---|---|
| #000000 | #ffffff | 21.00 | pass |
| #ffffff | #000000 | 21.00 | pass |
| #000000 | #f1f1f1 | 18.59 | pass |
| #ffffff | #171717 | 17.93 | pass |
| #ffffff | #2e2e2e | 13.58 | pass |
| #ffffff | #b154f9 | 3.81 | **fail** |

## Content & Voice
- Plain, benefit-first: "You have the idea. We have the tools."
- Short declarative headlines with periods.
- Names the enemy: "a sales channel, not an engineering challenge."
- Feature titles are noun phrases in sentence case.
- CTAs are short and verb-first: "Get started", "Request a demo", "Discover features".
- Openly superlative: "The world's most powerful commerce platform."
- FAQ questions in first person; answers open with "Yes,".

## Do's and Don'ts

### Do
- Alternate `{colors.canvas}` and `{colors.stage}` sections to pace the scroll.
- Stack full-width rounded cards with overlap instead of dividers.
- Keep headings at weight 400 with negative tracking; color two to four words with the section's gradient-text variable.
- Pair each section with its bg and text gradient (workflows, storefront, dashboard).
- Reserve `{colors.primary}` for actions and active states.
- Build product visuals from blob panels with connector notches.
- Size with `--vw` based fluid units between breakpoints.
- Use `--ease-quad-out` over 0.3s for interactive transitions.
- Gate hover styles behind `(any-hover: hover)`.

### Don't
- Don't use bold headings.
- Don't add shadows.
- Don't put white small text on `{colors.primary}` (fails AA).
- Don't apply gradient text to whole sentences.
- Don't adopt partner brand colors as system colors.
- Don't square off containers; smallest is 8px.
- Don't add a dark mode variable set; none exists.

## Provenance
- Source: https://www.krepling.com/, 8 pages, 2,958 elements, extracted 2026-09-20 with design.md. No framework detected. Site links a `/design-system` page (`meta.framework.designSystemUrl`), worth opening.
- **[E]** from `tokens.json`. **[S]** from 19 desktop screenshots.
- Not covered: hover states, mobile layout, JS animation timing.
- Not an official Krepling design system.