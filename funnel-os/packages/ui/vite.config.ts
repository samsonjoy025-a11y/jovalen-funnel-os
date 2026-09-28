import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The playground is a component gallery, not the app.
 *
 * There is no app yet. This exists so the primitives can be seen, clicked and
 * tabbed through in a real browser instead of only asserted against in jsdom —
 * jsdom cannot tell you whether a focus ring is visible, a hover state fires,
 * or a dark theme is legible. It is a development tool and is not published.
 *
 * The build step is a real gate, not a convenience: `vite build` resolves
 * every import in main.tsx, so a primitive whose module graph is broken fails
 * the build instead of producing a blank page.
 */
export default defineConfig({
  root: 'playground',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Fail loudly rather than silently moving to 5174. A URL the user was told
    // to open should be the URL that works.
    strictPort: true,
  },
  build: {
    outDir: '../dist-playground',
    emptyOutDir: true,
  },
});
