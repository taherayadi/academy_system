# DESIGN.md — System Academy (landing + center workspace)

Single source of truth for the visual system. Changes here are changes to the
whole product — redefine tokens, never re-hardcode values.

## Brand color — the teal ramp

Defined in `src/index.css` under `@theme` as Tailwind v4 color tokens
(`--color-brand-*`), consumed as `bg-brand-600`-style utilities or
`var(--color-brand-*)` in plain CSS.

| Token | Value | Role |
|---|---|---|
| `brand-50` | `#eff9fb` | selected-item washes, faint teal tints |
| `brand-100` | `#dbf3f5` | hover washes on tinted rows |
| `brand-200` | `#b7e6eb` | tinted borders, soft teal fills |
| `brand-300` | `#8bd7df` | input borders on tinted surfaces |
| `brand-400` | `#53c3d0` | (reserved) |
| `brand-500` | `#31a7b4` | light gradient end, icons, accents |
| **`brand-600`** | **`#257C86`** | **primary** — buttons, links, focus rings, active states |
| **`brand-700`** | **`#1e626b`** | gradient deep end, hover/pressed of 600 |
| `brand-800` | `#174e54` | dark teal ink (financial figures, headings on tint) |
| `brand-900` | `#133f44` | (reserved, darkest ink) |
| `brand-950` | `#0b2528` | (reserved) |

Anchors: `brand-600`/`brand-700` are the two colors this product has always
used. Neighbors are computed on the same hue/saturation (h≈186, s≈57) so
hover/darken steps stay consistent. **Never reintroduce amber** — the old
`@theme` carried an amber palette that matched nothing in the UI.

### Rules

1. **No hex literals in components.** Tailwind classes use `brand-*`
   utilities (opacity modifiers are fine: `bg-brand-600/10`). Plain CSS uses
   `var(--color-brand-*)`. New near-teal hexes are a bug, not a shade.
2. Hover of a `brand-600` surface is `brand-700`; gradients run
   `from-brand-600 to-brand-700` (or `to-brand-500` for light accents).
3. Money figures on light backgrounds use `brand-800`, never raw slate or
   gray.

## Surfaces and neutrals (current state)

- Workspace background: `#FCFAF6` warm cream (3 uses in `App.tsx`) — the
  intentional "paper" tone of the RTL workspace. Candidate for a
  `--color-paper` token if it spreads; do not fold it into the brand ramp.
- Body base: `#f8fafc` (slate-50) in `index.css`; text `#1e293b` (slate-800).
- All slate/white/gray usage comes from Tailwind's built-in palette.

## Typography

- `--font-sans`: **Cairo** (Arabic-first workspace), system-ui fallback. Self-hosted via Fontsource, weights **400–900 only** (300 dropped: unused; 500/600 cover the semibold/extrabold gaps). Latin + Arabic subsets with `unicode-range` load on demand.
- `--font-mono`: JetBrains Mono for numerals in finance contexts — weights **400/700** only.
- No Inter: dropped from the bundle (was never rendered behind Cairo; keep it out).
- Root font-size scales with viewport: `clamp(13px, 0.6vw + 7px, 17px)`.

## Motion

- Landing marquee: `--animate-marquee` (42s linear infinite), disabled under
  `prefers-reduced-motion: reduce` — the only ambient loop in the product.
- Framer Motion used for section entrances and disclosure transitions; keep
  entrances subtle and non-blocking.

## Global rules baked into `index.css`

- Scrollbars hidden app-wide (visual choice, scroll still works).
- `:focus-visible` ring: 2px `var(--color-brand-600)`, offset 2 — keep it on
  every interactive element.
- Print pipeline (`@page`, `.print-area`, `.no-print`) is a first-class part
  of the design system: printed documents strip all chrome and background.
- Text selection is disabled app-wide except inputs/textareas (business rule,
  not an accident).
