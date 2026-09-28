/*
 * One-off diagnostic: what is actually on a page that renders almost nothing.
 *
 * Prints the rendered text, the landmark structure, and anything React logged.
 * Exists because `shoot.mjs` can say "this page is empty" but not why, and a
 * bare "FAIL Overview" is not a finding.
 *
 *   node scripts/inspect-page.mjs / [waitMs]
 */
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PATHNAME = process.argv[2] ?? '/';
const WAIT = +(process.argv[3] ?? 6000);
const PORT = 9344;
const ORIGIN = 'http://127.0.0.1:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== undefined) {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
      } else for (const fn of this.listeners.get(m.method) ?? []) fn(m.params);
    });
  }
  static async open(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('socket')), { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  on(m, fn) { if (!this.listeners.has(m)) this.listeners.set(m, []); this.listeners.get(m).push(fn); }
  close() { this.ws.close(); }
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1000', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let ver;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
  }
  if (!ver) throw new Error('no chrome');

  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await Cdp.open(t.webSocketDebuggerUrl);

  const logs = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  cdp.on('Runtime.consoleAPICalled', (p) =>
    logs.push(`console.${p.type}: ` + p.args.map((a) => a.value ?? a.description ?? a.unserializableValue ?? '?').join(' ')));
  cdp.on('Runtime.exceptionThrown', (p) =>
    logs.push('EXCEPTION: ' + (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '?')));
  cdp.on('Log.entryAdded', (p) => logs.push(`log.${p.entry.level}: ${p.entry.text}`));
  cdp.on('Network.loadingFailed', (p) => logs.push(`NET FAIL: ${p.errorText} (${p.type})`));
  cdp.on('Network.responseReceived', (p) => {
    const u = p.response.url;
    const s = p.response.status;
    // Every non-2xx, not just the API's. A 404 favicon was sitting in this
    // page's console for the whole of Phase 1 and only surfaced by accident,
    // because the log used to filter down to `/api/` and so had nothing to say
    // about the assets the app asked for.
    if (u.includes('/api/')) logs.push(`${s} ${u.replace(ORIGIN, '')}`);
    else if (s >= 300) logs.push(`${s} ${u.replace(ORIGIN, '')}  <-- not ok`);
  });

  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: ORIGIN + PATHNAME });
  await sleep(WAIT);

  const r = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const main = document.querySelector('main');
      // The shell's nav and role switcher are ~1,500 characters of the same
      // text on every page, so a truncated whole-body dump reports the chrome
      // twelve times and never the screen. Read the screen.
      const mainText = main ? (main.innerText || '') : '(no <main>)';
      return {
        path: location.pathname,
        title: document.title,
        textLen: (document.body.innerText || '').length,
        mainLen: mainText.length,
        text: mainText.slice(0, 2400),
        mainHTML: main ? main.innerHTML.slice(0, 900) : '(no main element)',
        h1s: [...document.querySelectorAll('h1')].map(h => h.innerText),
        h2s: [...document.querySelectorAll('h2')].map(h => h.innerText).slice(0, 12),
        regions: [...document.querySelectorAll('[data-state],[role],[aria-busy]')].slice(0, 20)
          .map(e => e.tagName.toLowerCase() + ' ' + (e.getAttribute('role') || '') + ' ' + (e.getAttribute('data-state') || '') + ' ' + (e.getAttribute('aria-busy') || '')),
        rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : 'no #root',
      };
    })()`,
  });
  const v = r.result.value;
  console.log('PATH      ', v.path);
  console.log('TITLE     ', v.title);
  console.log('TEXT LEN  ', v.textLen, `(main: ${v.mainLen})`);
  console.log('#root kids', v.rootChildren);
  console.log('H1        ', JSON.stringify(v.h1s));
  console.log('H2        ', JSON.stringify(v.h2s));
  console.log('\nREGIONS\n', v.regions.join('\n '));
  console.log('\nMAIN TEXT\n', v.text);
  console.log('\nMAIN HTML\n', v.mainHTML);
  console.log('\nCONSOLE / NETWORK\n', logs.join('\n ') || '(nothing logged)');
  cdp.close();
} finally {
  chrome.kill();
}
