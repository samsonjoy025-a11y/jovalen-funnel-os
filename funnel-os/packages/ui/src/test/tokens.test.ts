import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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

/* -------------------------------------------------------------------------- *
 * The same gate, for CSS.
 *
 * styles.css and the playground chrome were both outside the component scan
 * above, and both are dense with var(--ds-*) references — styles.css holds
 * every hover and focus state in the system, and the playground is the most
 * looked-at surface in the package. A typo in either is exactly the silent
 * failure this file exists to catch: the browser resolves the property to the
 * empty string and the declaration simply does not apply.
 * -------------------------------------------------------------------------- */

const PACKAGE_ROOT = join(HERE, '..', '..');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith('.css'))
    .map((d) => join(d.parentPath, d.name));

describe('stylesheet token references', () => {
  const cssFiles = [...walk(join(PACKAGE_ROOT, 'src')), ...walk(join(PACKAGE_ROOT, 'playground'))];

  it('finds the stylesheets at all — a wrong directory would make this vacuous', () => {
    expect(cssFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('every --ds-* property referenced in CSS is declared by the build', () => {
    const undeclared: string[] = [];
    for (const file of cssFiles) {
      const css = readFileSync(file, 'utf8');
      for (const m of css.matchAll(/var\(\s*(--ds-[a-z0-9-]+)/g)) {
        if (!declared.has(m[1]!)) {
          undeclared.push(`${relative(PACKAGE_ROOT, file)}: ${m[1]}`);
        }
      }
    }
    expect(
      undeclared,
      `these resolve to nothing at runtime and fail silently:\n  ${undeclared.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the stylesheets reference a meaningful number of properties', () => {
    // Without this, a CSS file that stopped referencing tokens at all would
    // pass the gate above by having nothing to check.
    const refs = new Set<string>();
    for (const file of cssFiles) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\(\s*(--ds-[a-z0-9-]+)/g)) {
        refs.add(m[1]!);
      }
    }
    expect(refs.size).toBeGreaterThan(30);
  });

  it('no hard-coded colours in CSS either', () => {
    const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexes, `hard-coded colours: ${hexes.join(', ')}`).toEqual([]);

    const fns = [...css.matchAll(/\b(?:rgb|rgba|hsl|hsla)\(/g)].map((m) => m[0]);
    expect(fns, `hard-coded colour functions: ${fns.join(', ')}`).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Theme mechanisms must not drift apart.
 *
 * tokens.css expresses the theme as `[data-theme='dark']`. styles.css had a
 * block keyed to `@media (prefers-color-scheme: dark)` instead, so an app that
 * let a user pick a theme had two independent answers to "is it dark": the one
 * the user chose and the one the OS reported. Crossed, the button hover filter
 * pointed the wrong way — brightened in a light theme, and darkened into
 * invisibility in a dark one.
 *
 * A media query can be asserted on without a browser, and this one can be
 * checked structurally, which is cheaper than a screenshot and does not rot.
 * -------------------------------------------------------------------------- */

describe('the theme is expressed one way only', () => {
  const uiStyles = readFileSync(join(PACKAGE_ROOT, 'src', 'styles.css'), 'utf8');

  it('styles.css keys its dark overrides to [data-theme], not to the media query alone', () => {
    expect(uiStyles).toMatch(/\[data-theme='dark'\]/);
  });

  it('an explicit light theme is able to beat an OS dark preference', () => {
    // The rule that actually fixes the bug. Without it, a user whose OS is in
    // dark mode but who has chosen the light theme still gets the dark hover
    // filter, because the media query has nothing to override it.
    expect(uiStyles).toMatch(/\[data-theme='light'\]\s+\.ui-button:hover/);
  });

  it('the OS-preference fallback does not use :root, so a subtree theme survives it', () => {
    // The playground renders both themes side by side on one page, so a theme
    // is scoped to a subtree. A `:root` qualifier inside the media query would
    // let the OS preference win over a panel that explicitly asked for the
    // other theme, which is the same class of bug as the original one.
    //
    // styles.css does use :root elsewhere (for the reduced-motion override), so
    // this checks the media block specifically rather than the whole file.
    const blocks = [...uiStyles.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\n\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block[0], `a :root selector inside a prefers-color-scheme block: ${block[0]}`)
        .not.toContain(':root');
    }
  });
});

