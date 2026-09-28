/**
 * Entry point.
 *
 * Import order is load-bearing and is the first thing that will be "tidied"
 * wrongly:
 *
 *   1. `@funnelos/tokens/tokens.css` — declares the `--ds-*` custom properties.
 *      Import it first because everything below reads them. A stylesheet that
 *      uses a variable before it is declared still works in CSS (custom
 *      properties resolve at computed-value time, not parse time), so getting
 *      this wrong does not throw — it just silently resolves to nothing.
 *
 *   2. `@funnelos/ui/styles.css` — the interaction states (`:hover`,
 *      `:focus-visible`, forced-colors). These cannot be expressed inline: React
 *      drops pseudo-class selectors from a `style` object, which is why this
 *      file exists at all.
 *
 *   3. `./app.css` — the OS shell's own layout, which references both.
 *
 * The subpath is `tokens.css`, not `styles.css`. Every other package in the
 * workspace exports its stylesheet as `./styles.css`, so the natural guess is
 * wrong here. A wrong subpath is a build-time resolution error rather than a
 * silent visual one, which is the better of the two failure modes, but it is
 * still the first thing to check when nothing is themed.
 */

import '@funnelos/tokens/tokens.css';
import '@funnelos/ui/styles.css';
import './app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const host = document.getElementById('root');
if (!host) {
  // Named explicitly rather than thrown from a null dereference three frames
  // later. `#root` missing means the HTML and the bundle disagree, and the
  // useful message is that, not "cannot read properties of null".
  throw new Error('index.html is missing #root; the bundle and the HTML template disagree');
}

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
