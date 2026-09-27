# Jovalen — brand assets

The brand mark for the Funnel Marketing OS. Start with **`preview.html`** — open it in a browser
and it shows every asset at real sizes, on light and dark, with the rules and the open questions.

## The idea

A geometric funnel: three tapering bars feeding one terminal dot. Many inputs, one result — which
is the entire product promise. The dot is the payload, and it is deliberately violet so the
"converted" thing is the only different-coloured part of the mark.

## What's here

| File | Use it for | Safe to ship? |
|---|---|---|
| `logo/jovalen-mark.svg` | App header, sidebar, social, anywhere ≥20px | Yes |
| `logo/jovalen-mark-mono.svg` | Emboss, engraving, single-colour print, vinyl | Yes |
| `logo/jovalen-lockup-horizontal.svg` | Documents, email signatures, partner walls | **No — see below** |
| `logo/jovalen-lockup-stacked.svg` | Square placements: avatars, app icons, merch | **No — see below** |
| `logo/jovalen-lockup-reverse.svg` | Dark or photographic backgrounds | **No — see below** |
| `favicon/favicon.svg` | `<link rel="icon">`, PWA manifest | Yes |
| `favicon/favicon-mono.svg` | Favicon on a dark/coloured browser chrome | Yes |

## Read this before you ship a lockup

**The wordmark is live SVG `<text>`, not outlines.** `textLength` locks the advance width so the
lockup cannot reflow when the font falls back, but the *letterforms* still depend on a font being
installed. On a machine without the intended face, "jovalen" will render in a different typeface.

Before any lockup goes to print, a vendor, or a customer's inbox, open it in a vector editor and
convert the text to outlines (Illustrator: **Type → Create Outlines**; Figma: **Flatten**). That
is a one-time 30-second operation and it is the difference between a logo and a screenshot.

The mark-only files have no such caveat — they are pure geometry and render identically everywhere.

## Construction

24 × 24 grid, everything on a 12-unit centre axis.

- Bar widths `20 / 13 / 6` — a constant 7-unit taper, so the funnel is linear, not hand-drawn
- Bar height `3`, gap `2.5`, corner radius `0.75` (25% of bar height — softened, not pill-shaped)
- Terminal dot `r=3`, so its **diameter equals the width of the final bar** and it sits flush
  below it. That relationship is the mark's one piece of hidden structure.

The dot is flush to the bottom of the canvas while the top has 1.5 units of air, which puts the
content's optical centre at y=12.75 rather than 12 — the mark sits about 3% low in its box. This is
intentional (the dot reads as falling out of the funnel) but it is a taste call, not a fact. If it
looks wrong to you, shift every `y` and `cy` up by `0.75` and the margins become symmetric at 0.75.

## Clear space

One **terminal-dot diameter** (6 units) on all four sides. It is a measure the geometry already
provides, so there is nothing to eyeball. Nothing enters that band — no text, no rule, no page
edge, no other logo.

## Minimum sizes

| | Digital | Print |
|---|---|---|
| Mark | 20px | 5mm |
| Lockup | 96px | 28mm |
| Favicon | 16px | — |

**Below 20px, use `favicon/favicon.svg` instead of the mark.** Not because the mark breaks, but
because the favicon variant is measurably safer. Both scale proportionally, so their bar-to-gap
ratios are fixed at every size: the three-bar mark is 1.2:1, the two-bar favicon 1.33:1, and
neither improves as you scale up. What changes is absolute stroke width — a bar needs ~2px to
hold a solid core, which puts the mark's practical floor at 16px and the favicon's at 13px. So the
mark at 16px is usable but low-contrast, while the favicon at 16px has genuinely solid strokes.

## Colour

| Role | Hex | Token |
|---|---|---|
| Funnel body | `#b026d3` | `--ds-color-primary-600` |
| Result (dot) | `#a855f7` | `--ds-color-primary-500` |
| Wordmark | `#0f172a` | `--ds-color-neutral-900` |
| Reverse dot | `#d8b4fe` | `--ds-color-primary-300` |

The mark is two steps of the **primary** ramp, not two different ramps. An earlier version used
`violet-600` for the dot against an indigo body; once the body moved to magenta that put the dot
only 13° away in hue and at a similar luminance, so the two-colour story went muddy. Keeping both
tones inside `primary` means the hue shift through the ramp (violet at 500, magenta at 600) does
the work, and the dot stays visibly lighter than the body at every size.

Brand assets hardcode these hex values on purpose — they get copied into favicons, print jobs and
vendor handoffs where a token file will not travel. The values are kept in sync with
`funnel-os/packages/tokens/src/primitive.json`; if you re-tone the palette, update both, then run
`render-assets.ps1` so the PNGs are regenerated rather than left stale.

## Rules

- Two colours, one mark. Do not add a third.
- Mono for anything that is not a screen: emboss, engraving, single-colour print.
- Do not recolour outside the palette, rotate, stretch, skew, or add effects (shadow, glow, bevel).
- Do not place the coloured lockup on a background at or near the mark's `#b026d3` body — the
  funnel is then ~1:1 against it and silently disappears while the wordmark stays visible. Use the
  reverse lockup.
- Do not re-typeset or re-space the wordmark. If you need a different size, scale the whole
  lockup proportionally.
- The reverse lockup's white wordmark needs the background's **relative luminance ≤ 0.1833**
  (WCAG 2.2 AA §1.4.3). In practice: darker than a mid-grey — `#767676` is the canonical boundary
  at 4.54:1. In the primary ramp, `primary-600` (`#b026d3`, 5.17:1) is the brightest background that
  still passes; `primary-500` (`#a855f7`) is 3.96:1 and fails. Check photographic backgrounds, not
  just flat fills.

## Wiring it up

```html
<link rel="icon" type="image/svg+xml" href="brand/favicon/favicon.svg" />
```

```json
{ "icons": [ { "src": "/brand/favicon/favicon.svg", "sizes": "any", "type": "image/svg+xml" } ] }
```

In a React app, `<img src={mark} alt="Jovalen" height={24} />`. Do not use an `alt` of "logo" — the
brand name *is* the accessible name, and "logo" is noise for a screen reader.

## Still open

1. **Wordmark letterforms.** Needs one chosen face, then outlines. Poppins is the intended
   geometric look; Century Gothic is the closest widely-available match. Nothing in this repo can
   make that decision for you.
2. **Raster favicons.** Not generated — there is no image tooling in this environment. Produce
   16/32/48/180px PNGs from the SVG, or run `npx @favicone/favicons`.
3. **Maskable icon.** Android crops icons unpredictably, up to 20%. Needs a variant with the mark
   inside a 40%-radius safe-zone circle.
4. **Trademark.** Not checked. Search your class before you print anything.
5. **Name collision.** A separate *Jovalen Business OS* app already exists at this repo's root, and
   the design system and docs still say "Funnel OS" throughout. Confirm whether that is the same
   brand before either is renamed.
