#!/usr/bin/env node
/**
 * @funnelos/tokens — build
 *
 * Single source of truth:  src/*.json   (W3C DTCG)
 * Generated artefacts:     dist/tokens.css, dist/tokens.json, dist/tokens.ts
 *
 * Zero dependencies (Node >= 18). Implements ADR 0015:
 *   "DTCG JSON as the single source -> CSS custom properties, a Tailwind v4 theme,
 *    and a typed TS object."
 *
 * Three layers, emitted as var() chains so that a dark-theme override
 * automatically propagates through component and chart tokens:
 *
 *   :root                    primitives        (raw values, never theme-dependent)
 *   :root                    semantic·light    var(--ds-color-…)   <- defaults
 *   [data-theme='dark']      semantic·dark     var(--ds-color-…)
 *   :root                    component, chart  var(--ds-…)         <- theme-agnostic
 *
 * dist/tokens.json and dist/tokens.ts are fully RESOLVED literals, because a JS
 * consumer cannot read a CSS var. Dark values are exposed under a `dark.` prefix.
 *
 * Also implements the ADR 0015 promise that contrast is validated AT BUILD TIME:
 * every pair in CONTRAST_PAIRS is checked against WCAG 2.2 AA in BOTH themes and
 * the build fails on a new failing pair. That is the machine-enforced form of A7.
 *
 * Usage:
 *   node packages/tokens/build.mjs
 *   node packages/tokens/build.mjs --check     # CI: fail if dist is stale
 *   node packages/tokens/build.mjs --contrast  # print the contrast report only
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'src');
const DIST = join(here, 'dist');

const BANNER = '/* GENERATED — do not edit. Source: packages/tokens/src/*.json  (ADR 0015) */';

/* ------------------------------------------------------------------ *
 * 1. Flatten a DTCG group into { "a.b.c": value }
 * ------------------------------------------------------------------ */
const isGroup = (k) => !k.startsWith('$');

function flatten(node, path = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    if (!isGroup(key)) continue;
    const next = path ? `${path}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) out[next] = value.$value;
    else if (value && typeof value === 'object') flatten(value, next, out);
  }
  return out;
}

const readSrc = (name) => JSON.parse(readFileSync(join(SRC, name), 'utf8'));

/* ------------------------------------------------------------------ *
 * 2. Two resolution modes
 *    cssRef  — emit var(--ds-…) so themes propagate
 *    literal — fully resolve, for the JSON/TS artefacts
 * ------------------------------------------------------------------ */
const REF = /^\{(.+)\}$/;

const asCss = (v) => {
  const m = REF.exec(v);
  return m ? `var(--ds-${m[1].replace(/\./g, '-')})` : v;
};

function makeResolver(base) {
  return (v) => {
    const m = REF.exec(v);
    return m ? base[m[1]] : v;
  };
}

const cssVar = (k) => `--ds-${k.replace(/\./g, '-')}`;
const block = (pairs) =>
  Object.entries(pairs)
    .map(([k, v]) => `  ${cssVar(k)}: ${asCss(v)};`)
    .join('\n');

/* ------------------------------------------------------------------ *
 * 3. Load and resolve each layer
 * ------------------------------------------------------------------ */
const primitiveRaw = flatten(readSrc('primitive.json'));
const semanticDoc = readSrc('semantic.json');
const lightRaw = flatten(semanticDoc.light);
const darkRaw = flatten(semanticDoc.dark);
const componentRaw = flatten(readSrc('component.json'));
const chartRaw = flatten(readSrc('chart.json'));

const primitives = {};
for (const [k, v] of Object.entries(primitiveRaw)) primitives[k] = v;

const resolvePrimitive = makeResolver(primitives);

const light = {};
for (const [k, v] of Object.entries(lightRaw)) light[k] = resolvePrimitive(v);

const dark = {};
for (const [k, v] of Object.entries(darkRaw)) dark[k] = resolvePrimitive(v);

// Component + chart tokens may reference primitives OR semantic, and they are
// emitted as UNRESOLVED refs so the browser re-resolves var() at use time (that
// is what makes them theme-agnostic in the CSS). The contrast gate has no such
// luxury - it needs a concrete colour - and the correct concrete value differs
// per theme: `chart.axis.label` points at `content.tertiary`, which is
// neutral-500 in light and neutral-300 in dark.
//
// So they are resolved ONCE PER THEME. Resolving only against light (the
// previous behaviour) would have the dark gate measuring dark text against a
// light-themed colour, which is a green light for a failing pair.
//
// The bug this replaced was worse than it looks: `pick` in contrastReport()
// consulted only `dark`/`light`/`primitives`, so every chart-owned pair -
// delta.positive, delta.negative, axis.label - resolved to undefined and was
// reported as "unresolved token". 6 of the 66 pairs were silently untested.
const resolveLayer = (semantic, raw) => {
  const r = makeResolver({ ...primitives, ...semantic });
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = r(v);
  return out;
};

const component = resolveLayer(light, componentRaw);
const chart = resolveLayer(light, chartRaw);
const componentDark = resolveLayer(dark, componentRaw);
const chartDark = resolveLayer(dark, chartRaw);

/* ------------------------------------------------------------------ *
 * 4. Emit
 * ------------------------------------------------------------------ */
const css = `${BANNER}
:root {
  color-scheme: light;

  /* ---- primitive · raw values, never theme-dependent --------------- */
${block(primitiveRaw)}

  /* ---- semantic · light (default theme) ---------------------------- */
${block(lightRaw)}

  /* ---- component · theme-agnostic, refs resolve per active theme -- */
${block(componentRaw)}

  /* ---- chart · theme-agnostic, refs resolve per active theme ------- */
${block(chartRaw)}
}

[data-theme='dark'] {
  color-scheme: dark;

  /* ---- semantic · dark -------------------------------------------- */
${block(darkRaw)}
}
`;

const flat = { ...primitives, ...light };
for (const [k, v] of Object.entries(dark)) flat[`dark.${k}`] = v;
for (const [k, v] of Object.entries(component)) flat[k] = v;
for (const [k, v] of Object.entries(chart)) flat[k] = v;
// Chart and component colours are theme-dependent, so the published contract
// must carry the dark resolution too - otherwise a consumer of tokens.json
// (landing runtime, chart palettes, Storybook baseline) reads the light value
// and paints a dark-mode axis label at light-theme contrast.
for (const [k, v] of Object.entries(componentDark)) flat[`dark.${k}`] = v;
for (const [k, v] of Object.entries(chartDark)) flat[`dark.${k}`] = v;

// dist/tokens.json is a machine-consumed contract (ADR 0015 - the OS app, the
// landing runtime, chart palettes and the Storybook baseline all read it), so it
// must survive JSON.parse() with no preprocessing. It therefore gets NO banner:
// a `/* ... */` comment, however well meant, makes the file unparseable and any
// consumer has to know to strip the first line. Provenance is carried by
// $generated and $source keys inside the document instead.
const json = `${JSON.stringify(
  {
    $schema: 'https://design-tokens.org/schema.json',
    $generated: 'DO NOT EDIT. Source: packages/tokens/src/*.json (ADR 0015)',
    ...flat,
  },
  null,
  2,
)}\n`;

const ts = `${BANNER}
export const tokens = ${JSON.stringify(flat, null, 2)} as const;

export type TokenName = keyof typeof tokens;
export type CssVarName =
${Object.keys(flat).map((k) => `  | '${cssVar(k)}'`).join('\n')};
`;

/* ------------------------------------------------------------------ *
 * 5. Contrast gate — WCAG 2.2 AA, both themes
 * ------------------------------------------------------------------ */
function parseColour(value) {
  let hex = String(value).trim();
  if (hex.startsWith('rgb')) {
    const parts = hex
      .replace(/rgba?\(/, '')
      .replace('rgb(', '')
      .replace(')', '')
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
}

/* Alpha has to be composited over a real backdrop before it can be
 * compared. The dark theme's status backgrounds are 14-30% tints, so
 * measuring them as if they were opaque would be both wrong and
 * misleading. `over` is the surface the pair is declared against. */
function composite(value, over) {
  const c = parseColour(value);
  if (c.a >= 1) return { r: c.r, g: c.g, b: c.b, a: 1 };
  const b = parseColour(over);
  return {
    r: c.r * c.a + b.r * (1 - c.a),
    g: c.g * c.a + b.g * (1 - c.a),
    b: c.b * c.a + b.b * (1 - c.a),
    a: 1,
  };
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(colour) {
  const { r, g, b } = colour;
  return 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const CONTRAST_PAIRS = [
  ['content.primary', 'surface.raised', 4.5, 'Body text on a card'],
  ['content.primary', 'surface.canvas', 4.5, 'Body text on the app canvas'],
  ['content.secondary', 'surface.raised', 4.5, 'Secondary text on a card'],
  ['content.secondary', 'surface.canvas', 4.5, 'Secondary text on the canvas'],
  ['content.tertiary', 'surface.raised', 4.5, 'Tertiary text / axis labels'],
  ['content.tertiary', 'surface.canvas', 4.5, 'Tertiary text on the canvas'],
  ['content.link', 'surface.raised', 4.5, 'Links on a card'],
  ['content.link', 'surface.canvas', 4.5, 'Links on the canvas'],
  ['content.inverse', 'surface.inverse', 4.5, 'Text on an inverse surface'],
  ['status.neutral.fg', 'status.neutral.bg', 4.5, 'Neutral badge'],
  ['status.primary.fg', 'status.primary.bg', 4.5, 'Primary badge'],
  ['status.success.fg', 'status.success.bg', 4.5, 'Success badge'],
  ['status.warning.fg', 'status.warning.bg', 4.5, 'Warning badge'],
  ['status.danger.fg', 'status.danger.bg', 4.5, 'Danger badge'],
  ['status.info.fg', 'status.info.bg', 4.5, 'Info badge'],
  ['status.ai.fg', 'status.ai.bg', 4.5, 'AI badge'],
  ['claim.fact-fg', 'claim.fact-bg', 4.5, 'Claim · fact'],
  ['claim.analysis-fg', 'claim.analysis-bg', 4.5, 'Claim · analysis'],
  ['claim.hypothesis-fg', 'claim.hypothesis-bg', 4.5, 'Claim · hypothesis'],
  ['claim.recommendation-fg', 'claim.recommendation-bg', 4.5, 'Claim · recommendation'],
  ['content.on-solid', 'status.primary.solid', 4.5, 'Primary solid button label'],
  ['content.on-solid', 'status.danger.solid', 4.5, 'Danger solid button label'],
  ['content.on-solid', 'status.success.solid', 4.5, 'Success solid button label'],
  ['content.on-solid', 'status.warning.solid', 4.5, 'Warning solid button label'],
  ['content.on-solid', 'status.info.solid', 4.5, 'Info solid button label'],
  ['content.on-solid', 'status.neutral.solid', 4.5, 'Neutral solid button label'],
  ['content.on-solid', 'status.ai.solid', 4.5, 'AI solid button label'],
  ['delta.positive', 'surface.raised', 4.5, 'Positive delta text'],
  ['delta.negative', 'surface.raised', 4.5, 'Negative delta text'],
  ['axis.label', 'surface.raised', 4.5, 'Chart axis labels'],
  // Non-text UI components need 3:1 (WCAG 2.2 §1.4.11)
  ['border.strong', 'surface.raised', 3.0, 'Strong border vs surface'],
  ['border.focus', 'surface.raised', 3.0, 'Focus ring vs surface'],
  ['interactive.focus-ring', 'surface.canvas', 3.0, 'Focus ring vs canvas'],
];

function contrastReport() {
  const rows = [];
  const failures = [];
  for (const theme of ['light', 'dark']) {
    // Must see all four layers, in both themes. Chart- and component-owned
    // tokens live outside `dark`/`light`, and their dark resolution differs
    // from their light one - see the resolveLayer note above.
    const pick = (name) =>
      theme === 'dark'
        ? dark[name] ?? componentDark[name] ?? chartDark[name] ?? light[name] ?? component[name] ?? chart[name] ?? primitives[name]
        : light[name] ?? component[name] ?? chart[name] ?? primitives[name];
    // The surface a translucent token is painted on. Declared pairs are all
    // card-level or on a solid fill, so surface.raised is the correct backdrop.
    const backdrop = pick('surface.raised');
    for (const [fg, bg, min, label] of CONTRAST_PAIRS) {
      const fv = pick(fg);
      const bv = pick(bg);
      if (!fv || !bv) {
        failures.push({ theme, fg, bg, min, label, ratio: 0, reason: 'unresolved token' });
        continue;
      }
      const ratio = contrastRatio(composite(fv, backdrop), composite(bv, backdrop));
      const ok = ratio >= min;
      rows.push({ theme, fg, bg, min, label, ratio, ok, f: fv, b: bv });
      if (!ok) failures.push({ theme, fg, bg, min, label, ratio, reason: `needs ${min}:1` });
    }
  }
  return { rows, failures };
}

/* ------------------------------------------------------------------ *
 * 6. Run
 * ------------------------------------------------------------------ */
const { rows, failures } = contrastReport();
const args = process.argv.slice(2);

if (args.includes('--contrast')) {
  for (const r of rows) {
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.theme.padEnd(5)}  ${r.ratio.toFixed(2).padStart(5)}:1  (min ${r.min})  ${r.label.padEnd(34)}  ${r.fg} on ${r.bg}`,
    );
  }
  process.exit(failures.length ? 1 : 0);
} else {
  const artefacts = { 'tokens.css': css, 'tokens.json': json, 'tokens.ts': ts };
  const isCheck = args.includes('--check');
  const stale = [];

  for (const [file, content] of Object.entries(artefacts)) {
    const path = join(DIST, file);
    if (existsSync(path) && readFileSync(path, 'utf8') !== content) stale.push(file);
    // --check must NOT write. Writing here would silently repair a corrupted
    // or hand-edited dist before the caller could report it, turning a real CI
    // failure into a green run plus a modified working tree. In check mode the
    // only permitted side effect is the exit code.
    if (!isCheck) {
      mkdirSync(DIST, { recursive: true });
      writeFileSync(path, content, 'utf8');
    }
  }

  const mode = isCheck ? 'checked (not written)' : 'generated';
  console.log('@funnelos/tokens');
  console.log(`  primitives : ${Object.keys(primitives).length}`);
  console.log(`  semantic   : ${Object.keys(light).length} light / ${Object.keys(dark).length} dark`);
  console.log(`  component  : ${Object.keys(component).length}`);
  console.log(`  chart      : ${Object.keys(chart).length}`);
  console.log(`  ${mode.padEnd(9)}: dist/${Object.keys(artefacts).join(', dist/')}${stale.length ? `  (stale: ${stale.join(', ')})` : ''}`);
  console.log(`\ncontrast — ${rows.filter((r) => r.ok).length}/${rows.length} declared pairs pass WCAG 2.2 AA`);

  for (const f of failures) {
    console.error(`  FAIL  ${f.theme.padEnd(5)} ${f.ratio.toFixed(2)}:1 (${f.reason})  ${f.label}  — ${f.fg} on ${f.bg}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} contrast pair(s) fail. Fix the token, not the check.`);
    process.exitCode = 1;
  }
  if (isCheck && stale.length) {
    console.error(`\nstale generated files: ${stale.join(', ')} — run \`node build.mjs\` and commit`);
    process.exitCode = 1;
  }
}
