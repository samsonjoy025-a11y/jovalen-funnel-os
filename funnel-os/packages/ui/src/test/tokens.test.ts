import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedCustomProperties } from '../tokens.js';

/**
 * The A7 gate: "zero new CSS outside the token set".
 *
 * This test exists because a mistyped CSS custom property is invisible. It does
 * not throw, does not warn, and does not appear in a screenshot — the browser
 * resolves `var(--ds-shadow-sm)` to the empty string, so `background: <empty>`
 * simply does not apply. A component can be visually broken, ship, and pass every
 * other test in the suite.
 *
 * The first draft of src/tokens.ts referenced 13 names the build does not emit
 * (--ds-font-sans, --ds-shadow-sm, --ds-motion-fast, --ds-delta-neutral,
 * --ds-font-size-md, --ds-font-weight-normal, and others). Nothing caught it
 * until this test asked the generated contract what it actually contains.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
// src/test -> src -> packages/ui -> packages, so this is packages/tokens/dist.
// The first draft went up only two levels and threw ENOENT, which failed the
// whole suite for a reason unrelated to what it was testing.
const TOKENS_CSS = join(HERE, '..', '..', '..', 'tokens', 'dist', 'tokens.css');

const declared = new Set(
  [...readFileSync(TOKENS_CSS, 'utf8').matchAll(/(--ds-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
);

describe('token contract', () => {
  it('the generated stylesheet was found — otherwise every assertion below is vacuous', () => {
    expect(declared.size).toBeGreaterThan(200);
  });

  it('every property a component may reference is actually declared by the build', () => {
    const undeclared = allowedCustomProperties.filter((p) => !declared.has(p));
    expect(
      undeclared,
      `these resolve to nothing at runtime and fail silently:\n  ${undeclared.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the token suite references a meaningful number of properties', () => {
    // Guards against the allow-list silently collapsing to a handful of names,
    // which would make this gate pass while permitting almost nothing.
    expect(allowedCustomProperties.length).toBeGreaterThan(80);
  });
});

describe('no hard-coded colour literals in the component source', () => {
  /**
   * Reads the actual source rather than the rendered output, so a colour in a
   * prop default or a template literal is caught too.
   *
   * The file list is discovered from the directory, not hand-maintained. A
   * hand-written list silently stops covering new files, which is how a gate
   * quietly becomes weaker than the code it guards — the first version of this
   * test listed five files and did not know Overlay.tsx existed.
   */
  const files = readdirSync(join(HERE, '..', 'primitives'))
    .filter((f) => f.endsWith('.tsx'))
    .sort();

  it('finds the component files at all — a wrong directory would make the rest vacuous', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  const source = files
    .map((f) => readFileSync(join(HERE, '..', 'primitives', f), 'utf8'))
    .join('\n');

  it('contains no #hex literals', () => {
    const hexes = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexes, `hard-coded colours: ${hexes.join(', ')}`).toEqual([]);
  });

  it('contains no rgb()/rgba()/hsl() literals', () => {
    const fns = [...source.matchAll(/\b(?:rgb|rgba|hsl|hsla)\(/g)].map((m) => m[0]);
    expect(fns, `hard-coded colour functions: ${fns.join(', ')}`).toEqual([]);
  });

  it('contains no named CSS colours', () => {
    // Matches only in value position, so prose in a comment is not a hit.
    const named = [
      ...source.matchAll(/:\s*(red|blue|green|black|white|gray|grey|orange|purple|yellow|pink)\b/gi),
    ].map((m) => m[1]);
    expect(named, `named colours: ${named.join(', ')}`).toEqual([]);
  });
});
