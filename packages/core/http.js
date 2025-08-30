// packages/core/http.js
import * as zlib from 'node:zlib';
import * as stream from 'node:stream';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';

const pipeline = promisify(stream.pipeline);

const DEFAULT_TIMEOUT_MS = 12000;
const UA =
  'Mozilla/5.0 (compatible; TSBARBot/1.0; +https://example.com/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124';

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

export async function fetchOK(url, opts = {}) {
  const { signal, cancel } = withTimeout(opts.timeout || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept-Language': opts.acceptLanguage || 'en;q=0.9, *;q=0.5',
        ...(opts.headers || {}),
      },
      signal
    });
    cancel();
    return res && res.ok ? res : null;
  } catch {
    cancel();
    return null;
  }
}

export async function fetchText(url, opts = {}) {
  const res = await fetchOK(url, opts);
  if (!res) return null;
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (/application\/gzip|\.gz$/i.test(ctype) || /(\.xml\.gz|\.gz)$/i.test(url)) {
    const buf = Buffer.from(await res.arrayBuffer());
    const gunz = zlib.gunzipSync(buf);
    return gunz.toString('utf8');
  }
  return await res.text();
}

export async function fetchBuffer(url, opts = {}) {
  const res = await fetchOK(url, opts);
  if (!res) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export async function loadCheerio(url, opts = {}) {
  const html = await fetchText(url, opts);
  if (!html) throw new Error('loadCheerio: empty');
  const $ = cheerio.load(html);
  $.meta = { url, htmlLength: html.length };
  return $;
}

// --- helpers za domen/poddomen
export function getHostname(u) {
  try { return new URL(u).hostname; } catch { return ''; }
}
export function sameOrigin(u, origin) {
  try { return new URL(u).origin === origin; } catch { return false; }
}
// ista "sajt" familija: dozvoli poddomene (cdn., files., static.) i isti apex
export function sameSite(u, originUrl) {
  try {
    const host = new URL(u).hostname;
    const base = new URL(originUrl).hostname;
    return host === base || host.endsWith('.' + base);
  } catch { return false; }
}

export function toAbs(base, href) {
  try { return new URL(href, base).toString(); } catch { return href; }
}
