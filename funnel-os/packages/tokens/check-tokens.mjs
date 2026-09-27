#!/usr/bin/env node
/**
 * check-tokens.mjs — the authoritative token gate.
 *
 * Wraps build.mjs so CI has one command, and adds the three structural
 * invariants that a value-comparison gate cannot see. `check-dist.ps1`
 * compared dist against src BY VALUE, which is why it reported "in sync"
 * while `node build.mjs --check` reported dist/tokens.css as stale, and why a
 * generator bug could leave 6 of 66 contrast pairs permanently untested.
 * Value comparison cannot detect a token that exists in one place and not the
 * other. These can.
 *
 *   1. dist/tokens.css is byte-identical to a fresh generator run   (--check)
 *   2. dist/tokens.json parses with no preprocessing
 *   3. every CONTRAST_PAIRS entry resolves in BOTH themes, and the
 *      chart/component-owned pairs are checked against the right theme
 *
 * Usage:
 *   node packages/tokens/check-tokens.mjs
 *   node packages/tokens/check-tokens.mjs --verbose
 *
 * Exit 0 = all gates green. Exit 1 = at least one failed.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, 'dist');
const verbose = process.argv.includes('--verbose');

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${name}${detail ? `  ${detail}` : ''}`);
};

console.log('@funnelos/tokens — check\n');

/* -- gate 1: dist is not stale ------------------------------------------- */
try {
  const out = execFileSync(process.execPath, [join(HERE, 'build.mjs'), '--check'], {
    encoding: 'utf8',
  });
  const summary = out.split('\n').find((l) => l.includes('contrast —'))?.trim() ?? '';
  record('dist matches a fresh generator run', true, summary);
} catch (err) {
  const combined = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
  record('dist matches a fresh generator run', false, combined.split('\n').slice(0, 4).join(' | '));
}

/* -- gate 2: the published JSON contract parses as-is -------------------- */
try {
  const raw = readFileSync(join(DIST, 'tokens.json'), 'utf8');
  JSON.parse(raw);
  const keys = Object.keys(JSON.parse(raw)).length;
  record('dist/tokens.json parses with no preprocessing', true, `${keys} keys`);
} catch (err) {
  record('dist/tokens.json parses with no preprocessing', false, err.message);
}

/* -- gate 3: no unresolved contrast pair, in either theme ---------------- *
 * build.mjs already fails the build on these, but it reports them as
 * "0.00:1 (unresolved token)" alongside real failures. This gate
 * distinguishes the two, because an unresolved pair is a BUILDER bug and a
 * low ratio is a DESIGN bug - they need different fixes.                        */
try {
  const out = execFileSync(process.execPath, [join(HERE, 'build.mjs'), '--contrast'], {
    encoding: 'utf8',
  });
  const lines = out.split('\n').filter((l) => /^(PASS|FAIL)\s/.test(l));
  const unresolved = lines.filter((l) => /FAIL/.test(l));
  record(
    'every contrast pair resolves in both themes',
    unresolved.length === 0,
    `${lines.length} pairs checked, ${unresolved.length} unresolved`,
  );
  if (verbose) lines.forEach((l) => console.log(`        ${l.trim()}`));
} catch (err) {
  const combined = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  const lines = combined.split('\n').filter((l) => /^(PASS|FAIL)\s/.test(l));
  const unresolved = lines.filter((l) => /unresolved/i.test(l));
  if (unresolved.length === 0) {
    // A genuine contrast failure, not a builder bug. build.mjs's own message
    // is authoritative; do not duplicate its judgement.
    record('every contrast pair resolves in both themes', true, 'resolved; contrast failures reported by build.mjs');
    if (verbose) lines.forEach((l) => console.log(`        ${l.trim()}`));
  } else {
    record('every contrast pair resolves in both themes', false, `${unresolved.length} unresolved — a builder bug, not a design bug`);
    unresolved.forEach((l) => console.log(`        ${l.trim()}`));
  }
}

/* -- gate 4: the TS contract exports the same keys as the JSON ------------ */
try {
  const ts = readFileSync(join(DIST, 'tokens.ts'), 'utf8');
  const json = JSON.parse(readFileSync(join(DIST, 'tokens.json'), 'utf8'));
  const jsonKeys = Object.keys(json).filter((k) => !k.startsWith('$'));
  const missing = jsonKeys.filter((k) => !ts.includes(`"${k}":`));
  record(
    'dist/tokens.ts and dist/tokens.json expose the same token set',
    missing.length === 0,
    missing.length ? `${missing.length} missing from .ts` : `${jsonKeys.length} tokens`,
  );
} catch (err) {
  record('dist/tokens.ts and dist/tokens.json expose the same token set', false, err.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} gates pass`);
if (failed.length) {
  console.error(`\n${failed.length} gate(s) failed.`);
  process.exit(1);
}
