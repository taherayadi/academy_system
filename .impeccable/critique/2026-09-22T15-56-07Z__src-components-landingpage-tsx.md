---
target: landing page
total_score: 28
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 1
target_identity: "file:F:\\my_academy\\academy_system\\src\\components\\LandingPage.tsx"
target_fingerprint: "sha256:6e600b808d6829a49398453ce1697cecaa802e3f6b3e78b711732ca0e0c58449"
target_path: "F:\\my_academy\\academy_system\\src\\components\\LandingPage.tsx"
timestamp: 2026-09-22T15-56-07Z
slug: src-components-landingpage-tsx
---
# Critique — Landing Page (`src/components/LandingPage.tsx`)

Method: single-context sequential (degraded — no sub-agent tool exposed; design review ran before detector/browser evidence).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Submit/discovery states strong; pricing fetch has no skeleton beat |
| 2 | Match System / Real World | 4 | Flawless Tunisian director vocabulary: TND, "essai gratuit", real module names |
| 3 | User Control and Freedom | 3 | Toggles/disclosures reversible; no one-click config reset |
| 4 | Consistency and Standards | 3 | One token system now; two nav patterns (header pills + footer links) |
| 5 | Error Prevention | 3 | Phone constraint + required centerType enforced inline; no input length hints |
| 6 | Recognition Rather Than Recall | 3 | Config summary echoes selections; pricing section doesn't echo them back |
| 7 | Flexibility and Efficiency | n/a | Persuade surface — single conversion path is the intent |
| 8 | Aesthetic and Minimalist Design | 2 | 51 nested cards, 41 undersized texts, card-default composition |
| 9 | Error Recovery | 4 | Failure alert names problem + retry + preserves work + discloses offline copy |
| 10 | Help and Documentation | 3 | 6-question FAQ handles conversion objections; no contextual help at module prices |
| **Total** | | **28/36** | **Good** |

## Design Specificity Verdict

Strong product grounding — live-fetched prices (verified against /api/public-pricing), real module names, honest demo labeling, correct French-LTR / Arabic-RTL split. Could not be swapped to a generic product unchanged. Missed opportunity: testimonial trio reads as placeholder fiction (PRODUCT.md forbids fabrication).

Deterministic scan: CLI 0 findings (post-polish). Browser overlay scan: 196 findings — 51 nested cards, 56 low-contrast (2.5–2.6:1 slate-400 on light), 41 undersized UI texts (9px floor violations), 30 cyan-gradient surfaces (mostly brand-legitimate false positives), 9 tiny texts, 1 em-dash overuse, 1 all-caps body.

## Priority Issues

1. [P1] Card-in-card is the default container (51 nested cards; modules/pricing flat to one level, whitespace over nested borders). → $impeccable layout
2. [P2] Low-contrast text floor (56 findings; slate-400 functional text at 2.5–2.6:1 → slate-500 min on light surfaces). → $impeccable polish
3. [P2] Undersized functional text (9 below 11px floor; em-dash overuse). → $impeccable typeset
4. [P2] Pricing memory bridge — live selection summary beside the computed total. → $impeccable layout
5. [P3] Gradient saturation — reserve gradients for primary CTAs. → $impeccable quieter

## Persona Red Flags

- Jordan (first-timer): "Jd. Horaires" unexplained; help only at FAQ, 6 sections deep.
- Riley (stress tester): offline localStorage copy never resurfaces (no "send saved copy later"); no maxLength on name/academy inputs.
- Casey (mobile): CTA top-of-page thumb-hostile; 5.1 MB self-hosted font payload; marquee on slow phones. Touch targets and overflow already fixed.

## Minor Observations

- Header/footer duplicate nav patterns.
- Stats strip "0 / Limite d'élèves" reads inverted ("0 limit" vs unlimited).
- "Small Genious" header name is live local seed data.

## Questions to Consider

- Price-first hero: 40 TND as second-loudest element?
- Zero-testimonial variant until real quotes exist?
- One-screen pricing: selection and total in the same glance?
