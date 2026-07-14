# Celerity — Design System

Design reference for the Celerity frontend (`celerity-web/`). This describes
the app as it actually ships today. The executable sources of truth are
[`celerity-web/src/design/tokens.css`](celerity-web/src/design/tokens.css)
(design tokens) and [`celerity-web/src/styles.css`](celerity-web/src/styles.css)
(global resets, animation utility classes, splash-screen chrome); this file
is the human-readable map on top of them.

## Design goals

1. **Trustworthy, not "crypto."** Warm light paper background, generous
   whitespace, soft card shadows — it should feel as reliable as a bank and
   as approachable as a farmers' co-op. No dark mode, no neon, no
   hex-string aesthetics.
2. **Money semantics, one green.** Forest green (`--primary`) means "money
   moved or can move" — and nothing else uses it. Every money-moving CTA
   (deposit, top-up, claim, cash out, sign & settle) is the same solid-green
   pill button; received amounts render in the same green.
3. **Stage-legible.** Built to be read from the back of a room off a
   projector: 17px body text, 52px hero numbers, tabular figures on every
   amount so columns line up like a ledger. Nothing load-bearing sits
   below 12–13px.
4. **Honest stubs, always labeled.** The oracle signer and the SEP-31 anchor
   cash-out are simulated for the hackathon. Every stubbed boundary gets an
   amber `Badge` next to it — never disguised as working infrastructure
   (see CLAUDE.md rule 6).
5. **Plain language on the farmer side.** The farmer app never says
   "escrow," "pool," or "disbursement." It says "relief funds," "claim," and
   "withdraw to pesos." Money is always shown in pesos on that surface —
   raw XLM/unit figures are a funder-console-only concept. The one
   permitted trust signal is "Secured on Stellar."

## The three surfaces

The app is one React SPA (`celerity-web/src/App.jsx`) that renders three
distinct experiences from the same design tokens and component kit:

- **Farmer app** (`src/pages/farmer/`) — a phone-frame mobile experience:
  Splash → Connect → Home/Activity/Profile, with claim, cash-out, and
  transaction-detail overlays. Plain language, pesos only, no login (a
  fixed demo identity).
- **Funder console** (`src/pages/funder/`) — a desktop dashboard: pick an
  institution (ADB APDRF / PCIC), then Escrow Pools, Farmers (LGU
  registry), Trigger Typhoon (oracle), Ledger, Settings. Strictly scoped to
  the logged-in funder — the other funder's data never renders.
- **Public transparency ledger** (`src/pages/transparency/`) — every
  release across every funder, no login required.

All three consume the same `lib/celerity.js` contract-client wrapper and the
same `design/` component kit, so a fix or restyle in one place is visually
consistent everywhere.

## Color palette

Tokens live in `celerity-web/src/design/tokens.css`. All text/background
pairs meet WCAG AA (4.5:1).

| Token | Hex | Role |
|---|---|---|
| `--paper-page` | `#F9FAF5` | Page background (warm paper) |
| `--paper-inset` | `#F7F5F0` | Recessed backdrop behind the farmer phone frame |
| `--surface` | `#FFFFFF` | Cards, modals |
| `--surface-low` | `#F3F4F0` | Row hover, hairline row separators |
| `--container` / `--container-high` / `--container-highest` | `#EDEEEA` / `#E7E9E4` / `#E2E3DF` | Non-money buttons, card borders, table rules |
| `--outline` | `#C1C9C0` | Input borders |
| `--text` / `--text-dim` / `--text-faint` | `#1A1C1A` / `#414943` / `#717972` | Primary / secondary / meta text |
| `--primary` / `--primary-hover` | `#16452D` / `#214F36` | Forest green — the ONE money-CTA color, hero peso figure, brand |
| `--primary-chip` / `--on-primary-chip` | `#2F5D43` / `#BBEECC` | Active nav pill (bottom nav, "Acting as" switcher) |
| `--ok-bg` / `--ok-text` / `--ok-line` | `#E8F5E9` / `#2E7D32` / `#C8E6C9` | Status: Active/Armed, success |
| `--warn-bg` / `--warn-text` / `--warn-line` | `#FFF8E1` / `#B45309` / `#FFECB3` | Status: Paused; stub badges; oracle-card tint |
| `--bad-bg` / `--bad-text` / `--bad-line` | `#FFDAD6` / `#93000A` / `#FFB4AB` | Status: Exhausted; error toasts |
| `--neutral-bg` / `--neutral-text` / `--neutral-line` | `#F5F5F5` / `#616161` / `#E0E0E0` | Status: Released/Done/Ended — a deliberate close-out, not a warning |
| `--accent` / `--accent-soft` | `#D99A2B` / rgba | Sparing use only — icon-badge rings, small highlights. Never a second brand color. |

## Typography

**Quicksand** (400–700) everywhere — a rounded, geometric, approachable
sans, loaded from Google Fonts with `system-ui` fallback so a flaky stage
wifi can't break the demo. `font-variant-numeric: tabular-nums` on every
money figure so columns align.

| Token | Spec |
|---|---|
| `--text-hero` | 700 52px/1.05 — the farmer hero balance |
| `--text-display` | 700 34px/1.15 |
| `--text-h1` | 700 28px/1.2 |
| `--text-h2` | 700 20px/1.3 — card/section titles |
| `--text-body-lg` | 600 17px/1.4 |
| `--text-body` | 500 17px/1.5 — default body |
| `--text-money` | 700 20px/1.3 — inline amounts |
| `--text-table` | 500 16px/1.4 — table cells, inputs |
| `--text-meta` | 500 14px/1.4 |
| `--text-fine` | 600 13px/1.4 — fine print, pill labels |
| `--text-label` | 700 12px/1.3, uppercase, letter-spaced — section eyebrows, table headers |

## Layout tokens

- **Radius**: `--radius-card` 16px (cards, modals) · `--radius-input` 12px ·
  `--radius-control` / `--radius-chip` 999px (pill buttons, status pills,
  nav). A control that should read as a card (info, not an action) uses
  `--radius-card` even inside an otherwise pill-heavy layout — see the
  farmer Home countdown card, which was deliberately moved off the pill
  radius so it doesn't look like a button.
- **Shadow**: `--shadow-card` (resting) → `--shadow-card-hover` (raised on
  hover, via the `.cel-raise` utility) · `--shadow-raised` (green-tinted,
  under primary/money buttons) · `--shadow-modal`.
- **Motion**: `--transition-base` 180ms / `--transition-fast` 120ms, both
  zeroed under `prefers-reduced-motion: reduce`.

## Shared component kit (`src/design/`)

- **`Button`** — pill-shaped, 44px (36px `size="sm"`) min-height touch
  target. Variants: `primary` (solid forest green, reserved for
  money-moving actions only), `default` (putty), `outline`, `ghost`,
  `on` (active-state chip). Disabled state drops to 45% opacity.
- **`Card`** — white, 16px radius, soft shadow, `overflow-x: auto` so wide
  content (tables) scrolls inside the card, never the page.
  `variant="oracle"` is the one amber-tinted surface in the whole app,
  reserved for the demo oracle signer — visually quarantines simulation
  from live on-chain data.
- **`Badge`** — amber pill; `stub` mode is uppercase + letter-spaced and
  marks every simulated/demo boundary (oracle signer, SEP-31 anchor rate).
- **`Input`** — white, 12px radius, outline border that turns green on
  focus plus a soft green focus ring; label sits above, uppercase 12px/700.
- **`StatusPill`** — dot + label, status is never color-only. Green:
  Active/Armed/Registered. Amber: Paused. Red: Exhausted. Neutral gray:
  Released/Done/Ended.
- **`CountUp`** — animates a money figure from 0 (or its previous value) up
  to the target on mount/update; disabled under reduced motion.
- **`Table`** — uppercase 12px headers, `--surface-low` row rules, row
  hover tint, bold tabular `num` columns, an explicit `emptyText` prop so
  empty states say what will appear there instead of just being blank.
- **`Toast`** — thick colored left edge; success clears in 5s, errors stay
  12s (readable from the back of a room), never a raw simulation dump —
  routed through `lib/errors.js`'s `friendlyError()` contract-code map.
- **`Avatar`, `IconBadge`, `IconRow`, `MoneyAmount`, `RuleSentence`,
  `Select`, `Switch`, `SideNav`, `TopBar`, `BottomNav`** — smaller shared
  primitives; consult before hand-rolling an equivalent inline.
- **Icons** — inline SVG only. No emoji, no icon-font dependency.

## Motion utility classes (`.cel-*`, in `styles.css`)

These are load-bearing class names — restyle their *effect* if needed, but
don't rename them; they're applied throughout the page components.

| Class | Effect |
|---|---|
| `.cel-fade`, `.cel-fade-1`…`.cel-fade-6` | Fade-up on mount, staggered by index |
| `.cel-stagger` | Auto-staggers its direct children's fade-up (used for card grids/lists) |
| `.cel-press` | Scale-down `active` feedback on buttons/tappable cards |
| `.cel-raise` | Lift + shadow on hover (cards) |
| `.cel-row` | Row hover/press tint (table-like lists) |
| `.cel-overlay` | Slide-up entrance for full-screen overlays (modals, tx detail) |
| `.cel-fadein` | Simple fade-in (modal backdrops) |
| `.cel-toast` | Toast entrance |
| `.cel-swap` | Content-swap transition (e.g. oracle bulletin state changes) |
| `.cel-pop` | Small success "pop" (e.g. claim confirmation) |
| `.cel-expand` | Accordion/`<details>`-style expand |
| `.cel-spin`, `.cel-pulse` | Loading spinner / slow pulse (busy/disabled state) |

All respect `prefers-reduced-motion: reduce` (zeroed at the top of
`styles.css`).

## Interaction & accessibility rules

- Hover feedback via background/border color and the `.cel-raise`/`.cel-row`
  utilities — no layout shift.
- `focus-visible` outlines on every control; keyboard order matches visual
  order.
- Async actions disable their trigger for the duration (a per-view `busy`
  flag threaded from `App.jsx`'s `run()` helper), so double-submits can't
  happen.
- Errors are human sentences, never raw simulation/XDR dumps — every
  contract error code maps through `lib/errors.js`'s `friendlyError()` to a
  plain sentence a judge can read from the back row.
- Precise state-mutating clicks matter more than loose text matches — if
  you're scripting/testing the UI, match on exact button text, not a
  substring, since some screens repeat similar labels ("Log in →" appears
  once per funder card).

## Data ↔ display conventions

- **Money is derived, never hand-typed twice.** `lib/anchor.js`'s
  `toPHP`/`toPHPNumber`/`phpValue` are the only peso-conversion path; raw
  on-chain amounts (`lib/config.js`'s `UNIT`/`fmtUnits`/`toStroops`) never
  leak into farmer-facing copy.
- **Region names, not numbers.** `lib/regions.js`'s `regionName()` /
  `regionShort()` are the only way a region renders — never a bare region
  index.
- **Funder names are one source.** `lib/funders.js`'s `FUNDERS` list drives
  login, the corner header, the "Acting as" switcher, and the farmer app's
  `funderLabel()` lookup — an institution is never named two different ways
  depending which surface a viewer is on.
- **App-level state that isn't on-chain** (pool display names, the
  farmer's demo cash-out history, which pools are marked "Ended") persists
  to `localStorage` via small keyed helpers (`lib/poolNames.js`,
  `lib/farmerDemoState.js`, `lib/endedPools.js`) — same load/save-with-
  try/catch pattern each time. This is honest, device-local persistence,
  not a substitute for on-chain state; it exists so refreshing the page
  mid-demo doesn't silently erase local, non-chain bookkeeping.

## Load-bearing constraints (do not break)

- **One green.** If a new element wants green and it isn't a money-moving
  action or an Active/Armed status, pick a different token — green is
  reserved.
- **Stub badges stay prominent.** Any new simulated/demo feature gets a
  `Badge stub` next to its title, never hidden in a tooltip or footnote.
- **No jargon on the farmer surface.** No "escrow," "pool," or
  "disbursement" anywhere under `pages/farmer/`. If a concept needs a
  farmer-safe name, add it to the plain-language vocabulary rather than
  leaking the contract's own terms.
- **Pesos on the farmer side, units/XLM on the funder side.** Don't cross
  the two — a farmer never sees a raw unit figure; a funder's dashboard is
  allowed to show both, pesos primary.

## Provenance

Originally generated in Google Stitch ("Celerity Design System Evolution"),
exported via `tools/stitch-pull.py`. Rebuilt into the current React
component kit (`src/design/`) and token file
(`src/design/tokens.css`) during the "Stitch design system" implementation
pass — warm paper light theme, forest-green money semantics, Quicksand,
pill controls — and iterated on since through direct QA against the live
app rather than the original static screens. Treat this file, the token
file, and the shipped components as the source of truth going forward.
