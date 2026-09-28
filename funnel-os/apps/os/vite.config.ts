import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The OS dev server proxies `/api` to the API process.
 *
 * The proxy rather than a VITE_API_BASE pointing at :8787 is deliberate. With
 * the proxy, the app makes same-origin requests, so there is no CORS
 * preflight in development and — more importantly — the production build needs
 * no rebuild when the API moves. A hard-coded absolute origin in a client
 * bundle is the kind of thing that works on one machine and 404s everywhere
 * else, usually in front of a customer.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8787';

/**
 * One proxy, named once and used by both the dev server and `vite preview`.
 *
 * Stated up front because I got this wrong first. I asserted that Vite does
 * not share `server.proxy` with the preview server, added an explicit
 * `preview.proxy` on that basis, and then ran the negative control: with
 * `preview.proxy` removed, preview still returned JSON for `/api/v1/overview`.
 * Twice, the second time on a separate port so a stale process could not have
 * been answering. The installed source settles it -
 * `apps/os/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:66215` reads
 * `proxy: preview2?.proxy ?? server.proxy`, so preview inherits it.
 *
 * The declaration below is therefore belt-and-braces, not a fix. It is worth
 * having because the fallback is undocumented, lives in one line of a bundled
 * dependency, and would be a silent behavioural change if a future Vite dropped
 * it. If that day comes the symptom is the worst kind: every `/api/v1/*` call
 * returns the SPA's own index.html with a 200, the client parses HTML where it
 * expected an envelope, and the app comes up as an empty shell with nothing to
 * explain it. A 404 would at least be obviously wrong.
 *
 * The honest summary of this file's proxy: it works today because Vite inherits
 * it, and reads as though it works because it was written down.
 *
 * In a real deployment this stops mattering - the API and the bundle sit behind
 * one origin behind a reverse proxy, and these lines only stand in for that
 * locally.
 */
const PROXY = {
  '/api': { target: API_TARGET, changeOrigin: true },
  '/healthz': { target: API_TARGET, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: PROXY,
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: PROXY,
  },
  build: { outDir: 'dist', sourcemap: true },
});
