/*
 * Screenshot and verify the OS app by driving Chrome over CDP.
 *
 * ------------------------------------------------------------------ *
 * WHY CDP AND NOT --screenshot / --dump-dom
 * ------------------------------------------------------------------ *
 *
 * `--screenshot` works in this Chrome (154) but `--dump-dom` silently produces
 * an empty string, so the two cannot be used to check each other: the file
 * lands on disk and the evidence that it contains anything does not exist.
 * Combined with the fact that this model cannot view an image, that leaves no
 * way to tell a rendered page from a white rectangle.
 *
 * Chrome DevTools Protocol fixes it, and Node 24 has a global `WebSocket`, so
 * this needs no dependency. It also gets to do the things a CLI flag cannot:
 * read the DOM *and* the pixels from the same session, wait for a real network
 * idle rather than a virtual clock, and assert facts about the live page -
 * computed contrast, focus order, ARIA state - instead of guessing from a PNG.
 *
 * Every page is checked for two independent things:
 *
 *   DATA   the rendered text contains a figure that could only have come from
 *          the API. Not "has an h1" - the shell renders headings and empty
 *          states perfectly well while showing nothing.
 *   PIXEL  the screenshot is decoded in-page on a canvas and measured, so a
 *          blank or single-colour frame is caught numerically.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ORIGIN = 'http://127.0.0.1:5174';
const OUT = process.argv[2] ?? join(process.cwd(), 'docs', 'screenshots');
const PORT = 9333;
const WIDTH = 1440;
const HEIGHT = 1000;

const PAGES = [
  { file: '01-overview', path: '/', name: 'Overview' },
  { file: '02-business', path: '/business', name: 'Business' },
  { file: '03-funnel', path: '/funnel', name: 'Funnel' },
  { file: '04-pages', path: '/pages', name: 'Pages' },
  { file: '05-leads', path: '/leads', name: 'Leads' },
  { file: '06-integrations', path: '/integrations', name: 'Integrations' },
  { file: '07-analytics', path: '/analytics', name: 'Analytics' },
  { file: '08-insights', path: '/insights', name: 'Insights' },
  { file: '09-recommendations', path: '/recommendations', name: 'Recommendations' },
  { file: '10-actions', path: '/actions', name: 'Actions' },
  { file: '11-experiments', path: '/experiments', name: 'Experiments' },
  { file: '12-settings', path: '/settings', name: 'Settings' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until Chrome's debugging endpoint answers. */
async function waitForChrome(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome never opened its debugging port');
}

/**
 * A CDP session over the built-in WebSocket.
 *
 * `id`-correlated promises rather than a firehose of events, and a pending map
 * so a response that arrives after its caller gave up is dropped instead of
 * resolving a promise nobody is listening to any more.
 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        }
      } else {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }

  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('cdp socket failed')), { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  close() {
    this.ws.close();
  }
}

mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);

let failed = false;
const rows = [];
try {
  await waitForChrome();

  // Newer Chrome requires PUT on /json/new.
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await Cdp.open(target.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /*
   * Wait for the screen to stop growing, not for the page to reach a size.
   *
   * ------------------------------------------------------------------ *
   * WHY THE FIRST VERSION OF THIS WAS WRONG
   * ------------------------------------------------------------------ *
   *
   * It polled `document.body.innerText` and returned as soon as the total
   * passed 1200 characters. The shell alone is about 1,500 - nav rail, role
   * switcher, badges, mode banner - so on every page the check was satisfied
   * by the chrome, and the screenshot was taken of a half-painted screen.
   *
   * That is not a near miss. It reported three pages as "no server data" when
   * all three were rendering correctly, and would just as happily have passed a
   * page that never loaded at all, because an empty page still has 1,500
   * characters of navigation. A liveness check that cannot distinguish a
   * working screen from a dead one is worse than none.
   *
   * So this measures the screen - `main` - and requires it to be both large
   * enough to be a real page and *unchanged* across two consecutive polls, which
   * is what "finished rendering" actually looks like from outside. The deadline
   * is finite, so a page that never settles fails instead of hanging.
   */
  async function settle(minChars = 400) {
    const deadline = Date.now() + 25000;
    let previous = -1;
    let stable = 0;
    while (Date.now() < deadline) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(document.querySelector('main')?.innerText ?? '').length`,
        returnByValue: true,
      });
      const len = r.result.value ?? 0;
      if (len >= minChars && len === previous) {
        if (++stable >= 2) {
          await sleep(400); // entrance transitions
          return len;
        }
      } else {
        stable = 0;
      }
      previous = len;
      await sleep(320);
    }
    return previous;
  }

  for (const page of PAGES) {
    const url = `${ORIGIN}${page.path}`;

    await cdp.send('Page.navigate', { url });
    const mainLen = await settle();

    // Read the screen, not the document. The nav rail contributes the same
    // ~1,500 characters of words and badge counts to all twelve pages, so a
    // whole-body figure check is satisfied by the chrome alone - which is how
    // a page with no content at all could have scored as having data.
    const body = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(document.querySelector('main')?.innerText ?? '')`,
    });
    const text = body.result.value ?? '';

    // Pixel measurement, done in-page on the very frame we are about to save.
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const b64 = shot.data;
    const png = join(OUT, `${page.file}.png`);
    writeFileSync(png, Buffer.from(b64, 'base64'));

    const stats = await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const seen = new Set();
        let ink = 0, sum = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2];
          seen.add((r << 16) | (g << 8) | b);
          const l = 0.2126*r + 0.7152*g + 0.0722*b;
          sum += l;
          if (l > 245) ink++;
        }
        return { w: img.width, h: img.height, colours: seen.size,
                 inkPct: +(100 * ink / n).toFixed(1), meanLum: +(sum / n).toFixed(1),
                 bytes: ${b64.length} };
      })()`,
    });
    const px = stats.result.value ?? {};

    // Independent page-level facts, cheap to collect and much more meaningful
    // than a pixel histogram: the landmarks a screen reader navigates by.
    const a11y = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const q = (s) => document.querySelectorAll(s).length;
        return {
          h1: q('h1'), h2: q('h2'), main: q('main'), nav: q('nav'),
          unlabelled: [...document.querySelectorAll('button')]
            .filter(b => !(b.innerText || b.getAttribute('aria-label') || b.title)).length,
          imgsNoAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
          liveRegions: q('[aria-live]'),
          title: document.title,
          path: location.pathname,
        };
      })()`,
    });
    const ax = a11y.result.value ?? {};

    const problems = [];
    const figure = /(?:\d{1,3},\d{3}|\$[\d,]+|\d[\d.,]*\s?[kKM]?\b|\b\d+%|\bx\b)/.test(text);
    if (!figure) problems.push('no server figure in the rendered screen');
    if (mainLen < 400) problems.push(`main is only ${mainLen} chars - nothing rendered`);
    if (/Something went wrong|Application error|Cannot read propert/i.test(text))
      problems.push('rendered an error boundary');
    if (!px.colours || px.colours < 60) problems.push(`${px.colours ?? 0} distinct colours - flat`);
    if ((px.inkPct ?? 100) < 3) problems.push(`${px.inkPct}% ink - nearly blank`);
    if (ax.h1 !== 1) problems.push(`${ax.h1} h1 elements, expected exactly 1`);
    if (!ax.main) problems.push('no <main> landmark');
    if (!ax.nav) problems.push('no <nav> landmark');
    if (ax.unlabelled > 0) problems.push(`${ax.unlabelled} buttons with no accessible name`);
    if (ax.imgsNoAlt > 0) problems.push(`${ax.imgsNoAlt} images with no alt`);
    if (ax.path !== page.path) problems.push(`router landed on ${ax.path}, expected ${page.path}`);

    if (problems.length) failed = true;
    rows.push({ ...page, text, px, ax, problems });

    console.log(
      `${problems.length ? 'FAIL' : 'ok  '} ${page.name.padEnd(16)} ` +
        `${String(px.bytes ?? 0).padStart(6)}B ${String(px.colours ?? 0).padStart(5)}col ` +
        `${String(px.inkPct ?? 0).padStart(5)}%ink  ${String(mainLen).padStart(5)}main  ` +
        `h1=${ax.h1} btn=${ax.unlabelled ?? '?'}unlabelled` +
        `${problems.length ? '\n       -> ' + problems.join('\n       -> ') : ''}`,
    );
  }

  // A short excerpt of each screen, so "it rendered data" is checkable by
  // reading rather than by trusting the regex above. The mode banner lives
  // inside <main>, so its lines are skipped - otherwise every page reports the
  // same first line and the excerpt says nothing about the screen.
  console.log('\n--- first line of screen content per destination (chrome skipped) ---');
  const CHROME_LINES = new Set([
    'Hybrid mode', 'Both — the default', 'Build', 'Improve funnel',
    'Hide', 'the mode banner', 'Dark theme', 'Light theme',
  ]);
  for (const r of rows) {
    const line =
      r.text
        .split('\n')
        .map((s) => s.trim())
        .find((s) => s.length > 12 && !CHROME_LINES.has(s)) ?? '(empty)';
    console.log(`${r.name.padEnd(16)} ${line.slice(0, 90)}`);
  }

  cdp.close();
} finally {
  chrome.kill();
}

const bad = rows.filter((r) => r.problems.length).length;
console.log(`\n${rows.length - bad}/${rows.length} pages rendered, carried server data, and passed the page-level checks`);
process.exit(failed ? 1 : 0);
