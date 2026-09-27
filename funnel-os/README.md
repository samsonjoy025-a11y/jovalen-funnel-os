# Funnel Marketing OS

Design tokens, UI foundation and brand assets for the Funnel Marketing OS.

This repository is versioned separately from the **Jovalen Business OS** MVP
that also lives in the parent folder. That MVP (`public/`, `server/`,
`design.html`, and the root `package.json` / `README.md`) is a different
product, predates this work, and is intentionally excluded — see `.gitignore`.

## Layout

| Path | What it is |
|---|---|
| `docs/IMPLEMENTATION_PLAN_v2.md` | The build plan. 14 phases, design-first. **v1.0 is superseded and kept for the record only.** |
| `packages/tokens/` | Design tokens — the single source of truth (ADR 0015) |
| `packages/ui/styleguide/` | The design system reference, currently hand-written HTML/CSS |
| `../brand/` | Jovalen brand assets: logo, favicon, palette rules, PNG deliverables |

## Tokens

`src/*.json` is the source. `build.mjs` emits three contract artefacts and
fails the build on any WCAG 2.2 AA regression in either theme.

```
npm run build      # emit dist/tokens.css, dist/tokens.json, dist/tokens.ts
npm run check      # 4 structural gates on the emitted artefacts
npm run contrast   # print the 66-pair contrast report
npm run prove      # adversarial self-test: mutate the build, assert it fails
npm run verify     # build + check + prove
```

`dist/` is committed on purpose. It is a published contract consumed by the OS
app, the landing runtime, chart palettes and Storybook, and `--check` fails
when it drifts from `src/*.json`.

## Colour

`primary` was re-toned to electric violet/magenta so the brand mark carries
white text at 4.5:1 while staying brighter. `primary-600` (`#b026d3`) is the
solid-fill step; `primary-500` (`#a855f7`) is the accent/mark-dot step.
`neutral`, `success`, `warning`, `danger`, `info` and `violet` are unchanged
so status colours keep their meaning.

`.solid` fills use the lightest ramp step that still carries white text at
4.5:1, paired with `--ds-content-on-solid` (always white, in both themes).
The remaining 16 uses of `content.inverse` are all on genuine inverse surfaces.
