#!/usr/bin/env node
/**
 * prove-gates.mjs — adversarial self-test for the token gate.

  The plan's Phase 0 exit criterion is "CI already fails on a deliberate
  A5/A6/A7 violation". A gate that has never been shown to fail is an
  assumption, not a gate. This mutates the build in four specific ways that
  correspond to real defects already found in this codebase, and asserts
  check-tokens.mjs rejects each one.

  Every mutation is reverted from a verified-good backup, and the backup is
  re-verified with the gate itself before the first trial - otherwise a bad
  backup makes all four trials fail for the wrong reason, which is exactly
  what happened the first time this was run.

 * Run:  node prove-gates.mjs
 */

import { readFileSync, writeFileSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, 'dist');
// Two separate roots. Keeping build.mjs's backup in the SAME directory as the
// dist backup meant reset() copied it into dist/ as _build.mjs, so every run of
// this self-test left a 16 KB copy of the generator sitting in the published
// contract directory - invisible to the gates, and committed by accident.
const BAK_DIST = join(tmpdir(), 'funnelos-gate-proof', 'dist');
const BAK_BUILD = join(tmpdir(), 'funnelos-gate-proof', 'build.mjs');

const run = (args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, args, { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const reset = () => {
  cpSync(BAK_DIST, DIST, { recursive: true, force: true });
  cpSync(BAK_BUILD, join(HERE, 'build.mjs'), { force: true });
};

// Each trial: [label, mutate, expected-gate-substring-that-must-fail]
// Each trial must leave build.mjs syntactically valid, and must fail for a
// REASON we name. A trial that trips an unrelated check proves nothing: the
// first version of trial C deleted `??` along with the lookups, so it "passed"
// on a SyntaxError while the actual lookup path was never exercised.
const TRIALS = [
  [
    'A. dist/tokens.json carries a CSS comment banner',
    () => {
      const p = join(DIST, 'tokens.json');
      writeFileSync(p, `/* banner */\n${readFileSync(p, 'utf8')}`, 'utf8');
    },
    'parses with no preprocessing',
  ],
  [
    'B. dist/tokens.css hand-edited (a colour changed outside the build)',
    () => {
      const p = join(DIST, 'tokens.css');
      writeFileSync(p, readFileSync(p, 'utf8').replace('#b026d3', '#ff0000'), 'utf8');
    },
    'matches a fresh generator run',
  ],
  [
    // Must stay SYNTACTICALLY valid. An earlier version of this trial deleted
    // the `??` operators along with the lookups, producing a SyntaxError rather
    // than a silent wrong answer - so the gate "caught" it for the wrong reason
    // and proved nothing about the lookup path. This one rebuilds the ternary
    // exactly as it was before the fix, which is what actually shipped broken.
    'C. pick() cannot see chart/component tokens again (the original bug)',
    () => {
      const p = join(HERE, 'build.mjs');
      const before = readFileSync(p, 'utf8');
      // Anchored on the whole statement including its leading indent, and
      // non-greedy up to the FIRST semicolon. An earlier version of this trial
      // used a pattern that did not actually match the file, so the mutation
      // was a silent no-op and the gate correctly reported green - which is
      // exactly how a broken self-test masquerades as a passing one.
      const after = before.replace(
        / {4}const pick = \(name\) =>\n(?: {6}.*\n)+? {8}: light\[name\][^\n]*;/,
        [
          '    const pick = (name) =>',
          "      theme === 'dark'",
          '        ? dark[name] ?? light[name] ?? primitives[name]',
          '        : light[name] ?? primitives[name];',
        ].join('\n'),
      );
      if (after === before) throw new Error('trial C mutation was a NO-OP - the pattern did not match build.mjs');
      writeFileSync(p, after, 'utf8');
    },
    'every contrast pair resolves in both themes',
  ],
  [
    'D. chart tokens resolved against LIGHT semantics in dark mode',
    () => {
      const p = join(HERE, 'build.mjs');
      writeFileSync(
        p,
        readFileSync(p, 'utf8')
          .replace('const componentDark = resolveLayer(dark, componentRaw);', 'const componentDark = resolveLayer(light, componentRaw);')
          .replace('const chartDark = resolveLayer(dark, chartRaw);', 'const chartDark = resolveLayer(light, chartRaw);'),
        'utf8',
      );
    },
    'matches a fresh generator run',
  ],
];

/* -- establish a verified-good baseline --------------------------------- */
console.log('token gate — adversarial self-test\n');
console.log('building a verified baseline…');
run([join(HERE, 'build.mjs')]);
const base = run([join(HERE, 'check-tokens.mjs')]);
if (base.code !== 0) {
  console.error('baseline is not green, refusing to run trials:');
  console.error(base.out);
  process.exit(1);
}
console.log(`  baseline: ${base.out.match(/(\d+\/\d+ gates pass)/)?.[1] ?? 'green'}\n`);

rmSync(BAK_DIST, { recursive: true, force: true });
cpSync(DIST, BAK_DIST, { recursive: true });
writeFileSync(BAK_BUILD, readFileSync(join(HERE, 'build.mjs'), 'utf8'), 'utf8');

/* -- run the trials ------------------------------------------------------ */
let caught = 0;
for (const [label, mutate, expectedFailGate] of TRIALS) {
  reset();
  let mutationError = null;
  try {
    mutate();
  } catch (e) {
    mutationError = e.message;
  }
  const r = run([join(HERE, 'check-tokens.mjs')]);
  const failedGates = r.out.split('\n').filter((l) => l.includes('[FAIL]'));
  const hit = !mutationError && r.code !== 0 && r.out.includes(expectedFailGate);
  if (hit) caught++;
  console.log(`  [${hit ? 'caught' : 'MISSED'}] ${label}`);
  console.log(`           exit=${r.code}  gates failed=${failedGates.length}  expected gate: "${expectedFailGate}"`);
  if (mutationError) {
    // A trial that failed to apply proves nothing about the gate. Say so loudly
    // rather than letting it count as a pass.
    console.log(`           MUTATION FAILED: ${mutationError}`);
  } else if (!hit) {
    failedGates.forEach((l) => console.log(`           got: ${l.trim().slice(0, 90)}`));
    if (!failedGates.length) console.log('           got: gate reported GREEN - the violation is undetected');
  }
}

/* -- prove the working tree is restored ---------------------------------- */
reset();
rmSync(BAK_DIST, { recursive: true, force: true });
const final = run([join(HERE, 'check-tokens.mjs')]);
const restored = final.code === 0;
// Restoring to "green" is not the same as restoring to "clean". Assert dist/
// holds exactly the three published artefacts, so this self-test can never
// again smuggle a file into the contract directory.
const strays = readdirSync(DIST).filter((f) => !['tokens.css', 'tokens.json', 'tokens.ts'].includes(f));
const clean = strays.length === 0;
console.log(`\n  [${restored ? 'ok  ' : 'FAIL'}] working tree restored to green after all trials`);
console.log(`  [${clean ? 'ok  ' : 'FAIL'}] dist/ contains only the 3 published artefacts${clean ? '' : ` — stray: ${strays.join(', ')}`}`);
console.log(`  ${caught}/${TRIALS.length} deliberate violations caught`);

if (!clean) {
  console.error('\nthis self-test polluted dist/. Remove the stray file(s) and fix the backup layout.');
  process.exit(1);
}
if (!restored) {
  console.error('\nrestore failed - dist/ or build.mjs is not back to a green state:');
  console.error(final.out);
  process.exit(1);
}
if (caught !== TRIALS.length) {
  console.error(`\n${TRIALS.length - caught} violation(s) slipped through the gate.`);
  process.exit(1);
}
console.log('\nall gates bite.');
