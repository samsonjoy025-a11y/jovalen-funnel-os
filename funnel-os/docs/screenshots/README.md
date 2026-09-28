# Screenshots

One PNG per destination, 1440×1000, light theme, at device scale 1.

Regenerate with both processes up and the production build being served:

```
pnpm --filter @funnelos/api start          # :8787
pnpm --filter @funnelos/os build
pnpm --filter @funnelos/os preview         # :5174, serves dist/
node scripts/shoot.mjs                     # writes docs/screenshots/
```

`shoot.mjs` also prints a table and exits non-zero if any page fails, so it is a
gate rather than a camera. The PNGs are the output; the assertions are the point.

## What each screenshot is checked for

The model that built this cannot view an image, which means a folder of twelve
PNGs could contain twelve white rectangles and nothing would say so. So every
page is checked four ways, and the two halves are independent on purpose — a
page that rendered its shell and an error boundary has headings and varied
pixels, and a page that is pixel-noisy but empty of data passes a histogram.

| Check | What it catches |
| --- | --- |
| A figure that could only come from the API appears in the rendered screen | The shell rendering its headings and empty states while showing nothing. "Has an `h1`" is not a check; `118,400` cannot be typed into a chrome component. |
| `<main>` stops growing before the shot is taken | A half-painted screen photographed as if finished. |
| The PNG decodes to a non-flat, non-blank frame | A bundle that never loaded, or a render that threw before painting. |
| Exactly one `h1`, a `<main>` and a `<nav>`, no button without an accessible name, no `<img>` without `alt`, and the router on the path that was asked for | The landmark structure a screen reader navigates by, and a redirect that lands somewhere the nav does not show. |

12/12 pass. The current run prints:

```
ok   Overview         5687 distinct colours, 92.2% ink, 3123 chars of main, 1 h1
ok   Business         3912 distinct colours, 95.0% ink, 2354 chars of main, 1 h1
...
12/12 pages rendered, carried server data, and passed the page-level checks
```

## Two things that legitimately change a pixel

Held constant, these twelve files are byte-reproducible — verified by shooting
twice and comparing SHA-256, 12 of 12 identical. They are *not* reproducible
across arbitrary time or arbitrary API state, and it is worth being precise
about why, because a differing screenshot should not be read as a regression.

**The clock.** `formatFreshness(syncedAt, now = Date.now())` renders "5 hours
ago", so a screen showing metric cards changes when that label rolls over. The
fixtures are anchored to a fixed instant precisely so freshness *badges* do not
all decay into "stale" whenever the server restarts, but the *text* is still
relative to now — which is the honest rendering of a freshness indicator and
cannot be anything else. Overview and Analytics are the two affected screens.
`Metrics.tsx` anchors the badge *level* to the newest `syncedAt` so the colours
stay put; only the words move.

**API state.** The API is in-process and mutable, so a long-running instance
accumulates audit rows from anything that wrote to it. Settings renders that
audit log, so a screenshot taken against a server that has been poked differs
from one taken against a fresh process. Restart the API before shooting, or the
Settings image is a record of your test run rather than of the fixtures.

## Why CDP rather than `chrome --screenshot`

`--screenshot` works in this Chrome (154) and `--dump-dom` silently returns an
empty string, so the two cannot be used to check each other: the file lands on
disk and the evidence that it contains anything does not exist.
`scripts/shoot.mjs` drives Chrome over the DevTools Protocol instead, using
Node 24's built-in `WebSocket` and no dependency, which gets to read the DOM
*and* the pixels from one session and wait for real network idle rather than a
virtual clock.

`scripts/inspect-page.mjs <path>` is the diagnostic behind it. It prints the
rendered text of `<main>`, the landmark structure, every console message and
every request with a non-2xx status — which is how the missing `/favicon.ico`
showed up, and how a page that renders nothing says *why* rather than just
failing.
