#!/usr/bin/env node
/**
 * prove-gates.mjs — adversarial self-test for the design-system gates.
 *
 * The plan's Phase 1 exit criterion is that CI fails on a deliberate a11y
 * violation. A gate that has never been shown to fail is an assumption, not a
 * gate. This mutates the component source in six specific ways, each
 * corresponding to a real defect either already found in this codebase or a
 * well-known way these primitives break, and asserts vitest rejects each one.
 *
 * Every mutation is reverted from a verified-good backup, and the backup is
 * re-verified with the suite itself before the first trial — otherwise a bad
 * backup makes all six trials fail for the wrong reason, which is what
 * happened to the token gate's first run.
 *
 * Each trial must fail for the REASON we name. A trial that trips an unrelated
 * error proves nothing: the token gate's trial C originally deleted the `??`
 * operators along with the lookups it meant to break, so it "passed" on a
 * SyntaxError while the lookup path was never exercised at all.
 *
 * Run:  node prove-gates.mjs
 */

import { readFileSync, writeFileSync, cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
// Every tree the trials are allowed to touch, and every tree that therefore has
// to be backed up and restored. The playground joined this list when trial L
// started mutating playground.css: reset() copies from the backup, so a tree
// that is mutated but not backed up is mutated permanently. A self-test that
// leaves a broken stylesheet behind is worse than no self-test.
const TREES = ['src', 'playground'];
const BAK_ROOT = join(tmpdir(), 'funnelos-ui-gate-proof');

/**
 * Resolve a trial's file argument against src/, so the trials can say
 * `primitives/Button.tsx` rather than `src/primitives/Button.tsx`. A path may
 * escape with `..` — trial L needs `../playground/playground.css`, and
 * playgound/ is one of the backed-up TREES precisely because it is mutated.
 */
const resolve = (file) => join(HERE, 'src', file);

// vitest colours its output. Without stripping ANSI the SGR sequences sit
// between "Tests" and the count, so the summary regex silently matched nothing
// and this script reported "undefined tests passing" while the green baseline
// check beside it was doing the real work.
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

const vitest = (args) => {
  try {
    return { code: 0, out: stripAnsi(execFileSync(process.execPath, [join(HERE, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...args], {
      encoding: 'utf8',
      cwd: HERE,
      stdio: ['ignore', 'pipe', 'pipe'],
    })) };
  } catch (e) {
    return { code: e.status ?? 1, out: stripAnsi(`${e.stdout ?? ''}${e.stderr ?? ''}`) };
  }
};

const reset = () => {
  for (const tree of TREES) {
    rmSync(join(HERE, tree), { recursive: true, force: true });
    cpSync(join(BAK_ROOT, tree), join(HERE, tree), { recursive: true, force: true });
  }
};

const backup = () => {
  rmSync(BAK_ROOT, { recursive: true, force: true });
  for (const tree of TREES) {
    cpSync(join(HERE, tree), join(BAK_ROOT, tree), { recursive: true });
  }
};

const edit = (file, from, to) => {
  const p = resolve(file);
  const before = readFileSync(p, 'utf8');
  const occurrences = before.split(from).length - 1;
  if (occurrences === 0) {
    throw new Error(`anchor not found in ${file}: ${JSON.stringify(from)}`);
  }
  // An anchor that matches more than once is a trap. String.replace fixes only
  // the first match, so the trial mutates a different site than intended and
  // the suite can stay green for reasons that have nothing to do with the gate
  // under test. That happened: `aria-current="page"` appears in both
  // Breadcrumbs and Pagination, and the trial meant for Pagination mutated
  // Breadcrumbs instead.
  if (occurrences > 1) {
    throw new Error(
      `anchor is ambiguous in ${file}: ${JSON.stringify(from)} matched ${occurrences} times; ` +
        `widen it so it identifies one site`,
    );
  }
  writeFileSync(p, before.replace(from, to), 'utf8');
};

/* -- the trials ----------------------------------------------------------- *
 * [label, mutate, substring that must appear in the FAILING output]
 *
 * Every anchor is a string that exists in the source TODAY. An anchor that has
 * drifted does not fail the trial — `edit()` throws, which is caught, counted
 * as a failure, and reported as a broken mutation. That distinction matters:
 * "the gate did not fire" and "the mutation never applied" must never be
 * confused, because the first is a real finding and the second is a stale test.
 */
const TRIALS = [
  [
    'A. a component references a token the build does not emit',
    () => edit('tokens.ts', "solid: 'var(--ds-color-primary-600)'", "solid: 'var(--ds-color-primary-699)'"),
    'actually declared by the build',
  ],
  [
    'B. a hard-coded hex colour is introduced into a component',
    () =>
      edit(
        'primitives/Button.tsx',
        "return { background: color.brand.solid, color: color.content.onSolid",
        "return { background: '#7c3aed', color: color.content.onSolid",
      ),
    'hard-coded colours',
  ],
  [
    'C. a hard-coded rgb() is introduced into a component',
    () => edit('primitives/Display.tsx', 'background: color.surface.sunken,', "background: 'rgb(168 85 247)',"),
    'hard-coded colour functions',
  ],
  [
    'D. Field stops wiring the error into aria-describedby',
    () => edit(
      'primitives/Field.tsx',
      "[help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined",
      'undefined',
    ),
    'announces the error',
  ],
  [
    'E. a solid Button reverts to content-inverse (the dark-mode regression)',
    () =>
      edit(
        'primitives/Button.tsx',
        "return { background: color.brand.solid, color: color.content.onSolid",
        'return { background: color.brand.solid, color: color.content.inverse',
      ),
    'content-on-solid',
  ],
  [
    'F. Button loses its default type="button"',
    () => edit('primitives/Button.tsx', "type={type ?? 'button'}", 'type={type}'),
    'type="button"',
  ],
  [
    'G. Field disables the control when invalid',
    () =>
      edit(
        'primitives/Field.tsx',
        "'aria-invalid': error ? true : undefined,",
        "'aria-invalid': error ? true : undefined,\n        disabled: error ? true : undefined,",
      ),
    'NOT disable the control when invalid',
  ],
  [
    'H. Dialog stops restoring focus to the trigger on close',
    () => edit('primitives/Overlay.tsx', 'lastFocused.current?.focus();', 'void 0;'),
    'returns focus to the trigger',
  ],
  [
    'I. Pagination drops the page number from its accessible name',
    // The first draft read ", go to page 3" — the comma was meant to join the
    // visible digit, but the digit is aria-hidden, so the comma was announced.
    () => edit('primitives/Overlay.tsx', '<span className="ui-sr">Page {p}</span>', '<span className="ui-sr">{p}</span>'),
    "name: 'Page 3'",
  ],
  [
    'J. Pagination stops marking the current page with aria-current',
    // Anchored on the pageButtonStyle spread, not on the bare attribute:
    // `aria-current="page"` appears twice in Overlay.tsx, and `edit()` replaces
    // only the first match. The first version of this trial silently mutated
    // the Breadcrumbs occurrence instead and the suite stayed green, which
    // looked like a broken gate and was actually a missing test.
    () =>
      edit(
        'primitives/Overlay.tsx',
        'aria-current="page"\n            style={{\n              ...pageButtonStyle,',
        'aria-current="false"\n            style={{\n              ...pageButtonStyle,',
      ),
    'marks the current page with aria-current',
  ],
  [
    'K. Breadcrumbs stops marking the current page',
    () =>
      edit(
        'primitives/Overlay.tsx',
        'aria-current="page" style={{ color: color.content.primary, fontWeight: font.weight.medium }}',
        'aria-current="false" style={{ color: color.content.primary, fontWeight: font.weight.medium }}',
      ),
    'marks the last crumb as the current page',
  ],
  [
    'L. a stylesheet references a token the build does not emit',
    // The component scan only covered src/primitives/*.tsx, so a typo in
    // styles.css or the playground chrome was invisible. This trial is the
    // evidence that the CSS gate is real: the first version of the playground
    // did contain --ds-font-size-md, which does not exist.
    () => edit('../playground/playground.css', 'var(--ds-space-12)', 'var(--ds-space-12x)'),
    'resolve to nothing at runtime',
  ],
  [
    'M. an explicit light theme can no longer beat an OS dark preference',
    // The original defect: styles.css keyed its dark hover filter to
    // prefers-color-scheme while the theme system is [data-theme], so the two
    // disagreed whenever a user chose a theme that differed from their OS.
    () => edit('styles.css', "[data-theme='light'] .ui-button:hover", '.ui-button:hover'),
    'explicit light theme is able to beat an OS dark preference',
  ],
];

/* -- run ------------------------------------------------------------------ */

console.log('== backing up verified-good source ==');
backup();
console.log(`   backup: ${BAK_ROOT}  (${TREES.join(', ')})`);

console.log('\n== verifying the backup itself passes (a bad backup fails all trials) ==');
const baseline = vitest([]);
if (baseline.code !== 0) {
  console.error(baseline.out.slice(-3000));
  throw new Error('baseline suite is not green; fix that before trusting any trial');
}
const baseCount = /Tests\s+(\d+) passed/.exec(baseline.out)?.[1];
console.log(`   baseline green: ${baseCount} tests passing`);

let passed = 0;
const failures = [];

for (const [label, mutate, expected] of TRIALS) {
  reset();
  try {
    mutate();
  } catch (e) {
    failures.push(`${label}\n     MUTATION FAILED: ${e.message}`);
    continue;
  }

  const res = vitest([]);
  if (res.code === 0) {
    failures.push(`${label}\n     GATE DID NOT FIRE — the suite passed with the defect present`);
  } else if (!res.out.includes(expected)) {
    failures.push(
      `${label}\n     FAILED FOR THE WRONG REASON — expected "${expected}" in the output.\n` +
        `     It failed, but on something else, which proves nothing about this gate.`,
    );
  } else {
    passed++;
    console.log(`   ok  ${label}`);
  }
}

reset();

/* -- post-conditions ------------------------------------------------------ */

console.log('\n== post-conditions ==');

// 1. Every mutated tree must be byte-identical to the backup. A self-test that
//    leaves a mutated component or stylesheet behind is worse than no
//    self-test, so this is checked across all TREES, not just src.
{
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name));

  let total = 0;
  const differing = [];
  for (const tree of TREES) {
    const a = walk(join(HERE, tree))
      .map((f) => [relative(join(HERE, tree), f), readFileSync(f, 'utf8')])
      .sort();
    const b = walk(join(BAK_ROOT, tree))
      .map((f) => [relative(join(BAK_ROOT, tree), f), readFileSync(f, 'utf8')])
      .sort();
    total += a.length;
    if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(tree);
  }
  if (differing.length > 0) {
    failures.push(
      `source was not fully restored after the trials — differs from the backup in: ${differing.join(', ')}`,
    );
  } else {
    console.log(`   ok  all ${total} files across ${TREES.length} trees restored byte-for-byte`);
  }
}

// 2. The suite must be green again on the restored source.
{
  const after = vitest([]);
  if (after.code !== 0) {
    failures.push(`suite is not green after restore:\n${after.out.slice(-1500)}`);
  } else {
    console.log('   ok  suite green again after restore');
  }
}

// 3. This script must not litter the package.
{
  const strays = readdirSync(HERE).filter((f) => /^\.?(bak|backup|_)/i.test(f) && f !== '.gitignore');
  if (strays.length > 0) {
    failures.push(`self-test left files in the package: ${strays.join(', ')}`);
  } else {
    console.log('   ok  no stray files left in the package');
  }
}

console.log(`\n== ${passed}/${TRIALS.length} trials proved the gate fires ==`);
if (failures.length > 0) {
  console.error('\nFAILURES:\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log('All gates are real.\n');
