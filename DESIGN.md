# Design

<!-- impeccable:design-schema 1 -->

The System Academy platform-operator console. A single-operator, Arabic-first
back office used every working day; its visual system optimises for
legibility, scan-ability and calm density over decoration.

## Identity

- **Type**: IBM Plex Sans Arabic, bundled locally (`@fontsource`), Latin digits
  in the Latin script (`ar-TN` locale), headings and body on the same family.
- **Direction**: RTL everywhere (`<html lang="ar" dir="rtl">`), logical
  layout utilities (`ms-/me-/ps-/pe-/start-/end-`) in all app surfaces;
  Latin-script data fields keep `dir="ltr"` bidi isolation.
- **Root type scale**: fluid `clamp(14px … 16px)`.
- **Text-size floor**: `text-[11px]` is the smallest type anywhere; body
  `text-sm`, secondary `text-xs`.

## Color

Slate neutrals for surfaces and ink; a teal accent family on `@theme`
(`accent-50 … accent-950`, `accent-600 #1e6a73` primary, `accent-400 #3a93a0`
hover); semantic `warning-*` amber and Tailwind red/green for danger/success
states. Secondary text is hue-tinted slate, never bare gray on gray.
Contrast: small text ≥ 4.5:1, decorative/large text ≥ 3:1; focus-visible
outlines `accent-600` on light (≥ 3:1 vs adjacent).

Print documents (invoices) use a print-locked light palette regardless of UI.

## Motion

Respects `prefers-reduced-motion` globally (Framer `reducedMotion="user"`);
motion is limited to micro-transitions and the chart draw — no autoplaying or
looping animation.

## Theme policy — light-only, deliberately (P2-7)

The console ships a **single light theme**. This is a scope decision, not an
oversight:

- the surface vocabulary is ~400 direct Tailwind slate/light utilities across
  seven consoles; a dark scheme is a token migration, not a `dark:` sweep;
- a half-finished dark mode is worse than none for an all-day tool.

`src/theme-provider.tsx` stays a stub on purpose; there is no theme switcher
UI and no `data-theme` attribute. **Work required to add dark mode later**:
1. move surface/ink/line colors to CSS custom properties on `:root` and
   define `[data-theme="dark"]` overrides;
2. migrate console surfaces to those tokens (biggest change);
3. chart/`StatusBadge` tone pairs need dark variants;
4. declare `color-scheme: light dark` and honour `prefers-color-scheme`.

Until all four are done, the browser is told `color-scheme: light` so form
controls and scrollbars render the light way in dark-mode UAs.

## Components

- Shared primitives live in `src/components/ui` (`BaseModal`, `FormField`,
  `PrimaryButton`, `SecondaryButton`, `StatusBadge` + tone registry).
- Modals: `role=dialog` + `aria-modal`, labelled via `aria-labelledby`,
  Escape-to-close, focus trap with focus restore.
- Icon-only controls: accessible name (`aria-label`), ≥ 44px targets on
  mobile-close nav, ≥ 24px elsewhere.
- Tables: headers have `scope`, numeric columns are LTR-isolated.
