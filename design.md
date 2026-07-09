# Celerity — Design System (v2, "Trustworthy Modernism")

Design reference for the Celerity demo frontend (`celerity-web/`). v2 is the
implementation of the Stitch "Celerity Design System Evolution" screens
(exported in [`stitch-export/`](stitch-export/)) into the live app. The
executable source of truth is [`celerity-web/src/styles.css`](celerity-web/src/styles.css);
this file is the human-readable one.

## Design goals

1. **Trustworthy, not "crypto".** Warm light theme, generous whitespace, soft
   card shadows — it should feel as reliable as a bank and as approachable as a
   community cooperative. No dark mode, no neon, no hex-string aesthetics.
2. **Money semantics.** Forest green means "money moved or can move" — and
   nothing else uses it. Every money-moving CTA (deposit, claim, sign & settle)
   is the same solid-green pill button; received amounts render in the same green.
3. **Stage-legible.** Demoed on a projector: 17px body, 52px hero numbers,
   16px table cells, tabular figures on every amount. Nothing important below 13px.
4. **Honest stubs.** Demo/simulation elements are amber — tinted oracle card,
   uppercase amber badges — visually separated from live on-chain data. A stub
   is never dressed as working infrastructure.

## Color palette (Material-3 green scheme, lifted from the Stitch screens)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F9FAF5` | Page background (warm paper) |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-low` | `#F3F4F0` | Row hover, hairline row borders |
| `--container-high` | `#E7E9E4` | Default (non-money) buttons |
| `--container-highest` | `#E2E3DF` | Card borders, table rules, button hover |
| `--outline` | `#C1C9C0` | Input borders |
| `--text` | `#1A1C1A` | Primary text |
| `--dim` | `#414943` | Secondary text, labels |
| `--faint` | `#717972` | Metadata, table headers, fine print |
| `--primary` | `#16452D` | Forest green — money CTAs, hero PHP figure, brand |
| `--primary-chip` / `--on-primary-chip` | `#2F5D43` / `#BBEECC` | Active nav pill |
| `--ok-*` | `#E8F5E9` / `#2E7D32` / `#C8E6C9` | Status: Active (bg/text/border) |
| `--warn-*` | `#FFF8E1` / `#B45309` / `#FFECB3` | Status: Paused; DEMO/STUB badges; oracle tint |
| `--bad-*` | `#FFDAD6` / `#93000A` / `#FFB4AB` | Status: Exhausted; error toasts |

Contrast: all text pairs meet WCAG AA (4.5:1) on their surfaces.

## Typography

**Quicksand** (400–700) everywhere — the rounded geometric sans from the Stitch
screens; warm and approachable without losing legibility. Loaded from Google
Fonts with `system-ui` fallback so stage wifi can't break the demo.
`font-variant-numeric: tabular-nums` on all amounts (`.big`, `td.num`,
`.oracle-result`) so columns align like a ledger.

Scale: 34px h1 · 20px card h2 · 17px body (weight 500) · 16px table cells and
inputs · 14px meta · 13px fine print/pills · 12px uppercase letter-spaced
labels and table headers · 52px hero numbers.

## Components

- **Buttons** — pill-shaped (999px radius), 44px min-height. Default: putty
  (`--container-high`) with darker hover. Primary (money): solid forest green,
  white text, soft green shadow (`0 4px 12px rgba(22,69,45,0.18)`). Active tab:
  dark-green chip with mint text. Disabled: 45% opacity + slow pulse so "busy"
  reads from a distance.
- **Inputs** — white, 12px radius, `--outline` border, 44px min-height; border
  turns green on hover/focus, plus a 2px green `focus-visible` ring.
- **Cards** (`.card`, `.oracle`) — white, 16px radius, 1px `--container-highest`
  border, soft shadow `0 4px 20px rgba(42,42,40,0.04)`, 24px padding,
  `overflow-x: auto` so tables scroll inside the card.
- **Oracle card** — the one amber surface: `--warn-line` border over a faint
  amber wash. Simulation is visually quarantined from live data.
- **Status pills** — exact hexes from the Stitch screens (see palette), with a
  `::before` dot so state is never color-only.
- **Tables** — uppercase 12px headers, `--surface-low` row rules, row hover
  tint, `tr.mine` mint tint for "your" pools, bold tabular `.num` amounts,
  `.empty` copy that says what will appear there.
- **Badges** (`.badge.stub`) — amber pill, uppercase, letter-spaced, filled
  `--warn-bg`. Marks every stubbed boundary (oracle signer, SEP-31 anchor rate).
- **Toast** — white card, thick colored left edge: green for success (5s),
  red-tinted `--bad-bg` surface for errors (12s — readable from the back row).
- **Icons** — inline SVG only. No emoji, no icon-font dependency.

## Interaction & accessibility rules

- Hover feedback via background/border color only — no layout shift.
- Transitions 150–200ms; `prefers-reduced-motion: reduce` disables all motion.
- `focus-visible` outlines on every control; keyboard order = visual order.
- Async actions disable buttons for the duration (global per-view `busy`), so
  double-submits can't happen.
- Errors are human sentences (`friendlyError` maps contract codes), never raw
  simulation dumps.

## Load-bearing constraints (do not break)

- **Class names are API.** `card, oracle, oracle-head, oracle-result, badge,
  stub, row, wrap, identity, addr, status, mine, num, empty, hero-numbers, big,
  sub, arrow, php, fine, toast, error, on, primary, tagline, contract` are
  targeted by browser tests — restyle them, never rename them.
- **One green.** If a new element wants green and it isn't money movement or an
  Active state, pick another token.
- **Stub badges stay prominent.** Any new stubbed feature gets a `.badge.stub`
  next to its title, not in a tooltip.

## Provenance

Generated in Google Stitch (project "Celerity Design System Evolution"),
exported via `tools/stitch-pull.py`, and hand-ported into `styles.css` keeping
the app's existing DOM structure. The 18 reference screens live in
`stitch-export/` — consult them before adding new UI.
