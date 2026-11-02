# Celerity Relief · Visual system exploration

A dark, premium interface for a high-trust relief network. The visual language borrows the clarity and precision of modern financial products, then softens it with warm metallic accents and human language. It should signal that aid is handled with care, speed, and a clear record.

## Color tokens

| Token | Hex / value | Use |
|---|---|---|
| `--bg` | `#07110F` | Near-black emerald page canvas |
| `--bg-raised` | `#0A1713` | Raised page areas and inset regions |
| `--surface` | `#0E1D19` | Main card surface |
| `--surface-raised` | `#12231E` | Nested card, hover, selected navigation |
| `--text` | `#F1F5ED` | Primary text |
| `--muted` | `#9BAEA3` | Secondary text |
| `--quiet` | `#71877B` | Tertiary labels and metadata |
| `--line` | `rgba(221,235,223,.10)` | Hairline borders |
| `--line-strong` | `rgba(221,235,223,.17)` | Inputs and emphasized borders |
| `--emerald` | `#60D5A1` | Primary action, verified/live state |
| `--emerald-soft` | `#A4EDC4` | Positive emphasis and high-contrast accent text |
| `--champagne` | `#E8C47B` | Pool metal, funding and secondary emphasis |
| `--champagne-soft` | `#F4DFAB` | Gold surface foreground |
| `--danger` | `#E99085` | Policy refusal and attention state |
| `--info` | `#86B9DB` | PayPal / information cues |

Emerald means active, delivered, or safe. Champagne means capital, pool funding, or a reserved highlight. Red is reserved for refusal and exceptions. Keep status meaning explicit in text; color is supplementary.

## Typography

- **Display / headings:** Manrope, 700–800; tight tracking around `-.04em`.
- **UI / body:** DM Sans, 400–700; body 14–15px with 1.5 line height.
- **Money / technical values:** DM Mono, 400–500, with tabular numerals. Keep the peso symbol adjacent to the value, e.g. `₱356,000`.
- **Hero money:** 42–48px on large surfaces; 46–48px on the farmer phone screen.
- **Page title:** 30px desktop / 23–24px phone.
- **Section title:** 18–19px.
- **Metadata:** 10–12px. Eyebrows use uppercase, 10px, 0.15em letter spacing.

## Shape, spacing and depth

- Main cards: 18px radius; phone cards: 16–17px.
- Inputs and buttons: 10–12px radius; status pills: full capsule.
- Desktop page content uses 32–42px padding; phone content uses 18px side padding.
- Use a 4px spacing base; section gaps are generally 14–20px.
- Base shadow: `0 24px 80px rgba(0,0,0,.35)`; use sparingly, with subtle glow rather than elevation alone.
- Emerald glow: `0 0 9px #60D5A1` around the live indicator; primary CTA shadow: `0 4px 20px rgba(83,202,145,.16)`.

## Glass recipe

Start with `linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.015))` over `rgba(12,27,22,.88)`. Add a 1px `rgba(221,235,223,.10)` border, 18px radius, and a top specular line that fades from transparent through white at 19% opacity and back. Avoid strong blur behind small text; legibility matters more than the glass effect. Pool cards add a restrained radial champagne highlight and a faint diagonal sheen.

## Components and behavior cues

- **Navigation:** narrow dark rail, simple line-like glyphs, active item gets a quiet emerald wash and hairline border. Phone uses a compact bottom bar.
- **Metric cards:** uppercase label, confident tabular figure, one concise context line. Four-up desktop, two-up phone.
- **Pool metal card:** metallic gradient, high contrast available balance, small area sparkline, contributed / paid / remaining figures and restrained utilization bar.
- **Status pills:** explicit labels (`Delivered`, `Unclaimed`, `In progress`, `Refused`) with a small dot where live. Glow only for active state.
- **Charts:** thin grid lines, emerald stroke, soft translucent fill, compact date labels. No heavy axes or decorative chart chrome.
- **Timeline:** horizontal for batch detail, vertical for phone. Clearly show bulletin → approval → PayPal sent → family received.
- **Trust / evidence:** show SHA-256 chain state and abbreviated hashes. Public examples omit names, email addresses and family IDs.
- **Farmer experience:** plain, warm bilingual-ready language; focus on the amount and next action. The language toggle is visible. Never resemble a trading or speculation product.
- **Buttons:** emerald gradient for primary coordinator actions, champagne for funding emphasis, quiet outlined surface for secondary actions. Keep action labels concrete.

## Responsive frames

Desktop mockups are composed for a 1440px viewport with a 224px navigation rail. Phone mockups are composed at 390 × 844px and use large touch targets. `index.html` scales previews for the gallery; use **Open screen** on each tile to inspect the intended viewport directly.
