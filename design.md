# Celerity — Design System

Design reference for the Celerity demo frontend (`celerity-web/`). Generated with
ui-ux-pro-max ("fintech dashboard, dark mode, stage demo, escrow ledger") and applied
in full in [`celerity-web/src/styles.css`](celerity-web/src/styles.css). This file is
the human-readable source of truth; the CSS is the executable one.

## Design goals

1. **Stage-legible.** This UI is demoed on a projector from the back of a room.
   Body text is 17px, hero numbers are 56px, tables are 16px. Nothing important
   is smaller than 13px.
2. **Money semantics.** Green means "money moved or can move" — and nothing else
   uses green. Every CTA that moves funds (deposit, claim, sign & settle) is the
   same solid green button.
3. **Ledger feel.** Anything a funder would audit — amounts, addresses, pool IDs,
   the contract ID, the headline — is set in a monospace face with tabular
   figures, so columns of numbers align like a statement.
4. **Honest stubs.** The DEMO/STUB elements (oracle simulator, anchor PHP
   conversion) are visually *louder* than the real parts: amber border on the
   oracle card, amber uppercase badges. We never dress a stub as infrastructure.

## Color palette (OLED dark)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#020617` | Page background (near-black, OLED) |
| `--card` | `#0F172A` | Card / section surface |
| `--card-2` | `#1E293B` | Raised surface (buttons, toast) |
| `--line` | `#263349` | Borders, table rules |
| `--text` | `#F8FAFC` | Primary text |
| `--dim` | `#94A3B8` | Secondary text, labels, captions |
| `--accent` | `#22C55E` | CTA + money-positive (the only green) |
| `--accent-ink` | `#03170B` | Text on green buttons |
| `--info` | `#38BDF8` | Focus rings |
| `--ok` | `#22C55E` | Status: Active |
| `--warn` | `#FBBF24` | Status: Paused; DEMO/STUB badges; oracle border |
| `--bad` | `#F87171` | Status: Exhausted; error toasts |

Contrast: all text pairs meet WCAG AA (4.5:1) against their surfaces; `--dim` is
used only for secondary text at 14px+.

## Typography

| Use | Face | Notes |
|---|---|---|
| Headline, numbers, addresses, IDs | **Fira Code** 500–700 | `font-variant-numeric: tabular-nums` on all amounts |
| Body, labels, buttons | **Fira Sans** 400–600 | 17px body, 1.55 line-height |

Loaded via Google Fonts `@import` with `ui-monospace` / `system-ui` fallbacks, so
the demo still renders correctly on stage wifi with no font CDN.

Scale: 38px h1 · 20px card h2 · 17px body · 16px table cells/inputs · 14px meta ·
13px fine print & pills · 12px table headers (uppercase, letter-spaced) ·
56px farmer hero (`.big`), with a soft green glow on the PHP figure only.

## Components

- **Buttons** — 44px min-height (touch target), 10px radius. Default: `--card-2`
  with border that turns green on hover (no layout shift). Primary/selected:
  solid green with dark ink. Disabled: 45% opacity + slow pulse (`working`
  keyframe) so "busy" is visible from a distance.
- **Inputs** — dark well (`--bg`), monospace 16px, 44px min-height, green border
  on hover, sky-blue `focus-visible` ring (2px, offset 2px) — focus is never
  invisible.
- **Cards** (`.card`, `.oracle`) — 16px radius, 24px padding, `overflow-x: auto`
  so tables scroll inside the card instead of breaking the page. The oracle card
  is the one amber-bordered surface (it's the labeled demo signer).
- **Status pills** (`.status.Active/.Paused/.Exhausted`) — color-coded border +
  tint + a `::before` dot, so state is not communicated by color alone.
- **Tables** — uppercase 12px headers, row hover tint, `tr.mine` green tint for
  "your" pools, `.num` cells monospace/tabular, `.empty` centered dim copy that
  tells the user what will appear there.
- **Badges** (`.badge.stub`) — amber pill, uppercase, letter-spaced. Marks every
  stubbed boundary (oracle signer, SEP-31 anchor rate).
- **Toast** — fixed bottom-center, green border for success (5s), red border +
  light-red text for errors (12s — long enough to read from the back row).
- **Icons** — inline SVG only (zap mark in the header, feed lines on the oracle
  panel). No emoji icons.

## Interaction & accessibility rules

- Hover feedback via color/border only — transforms never shift layout.
- Transitions 150–200ms; `prefers-reduced-motion: reduce` disables all
  transitions and animations.
- `focus-visible` outlines on every control; keyboard order follows visual order.
- Async actions disable the button for the duration (`busy` state is global per
  view, so double-submits can't happen).
- Errors are written for humans (`friendlyError` maps contract error codes to
  sentences) and shown near-modal in the toast, not as raw simulation dumps.

## Load-bearing constraints (do not break)

- **Class names are API.** `card, oracle, oracle-head, oracle-result, badge,
  stub, row, wrap, identity, addr, status, mine, num, empty, hero-numbers, big,
  sub, arrow, php, fine, toast, error, on, primary, tagline, contract` are
  targeted by browser tests — restyle them, never rename them.
- **One green.** If a new element wants green and it isn't money movement or an
  Active state, pick another token.
- **Stub badges stay prominent.** Any new stubbed feature gets a `.badge.stub`
  next to its title, not in a tooltip.
