// packages/sections/safety/generic-deep.js
// Deep SAFETY ekstraktor (SPA aware):
// - Next/Nuxt/SPA JSON blobs (__NEXT_DATA__, window.__NUXT__, __INITIAL_STATE__, <script type="application/json">)
// - subdomenski CDN (isti root domen) npr. content.example.com
// - footer-seed sa homepage-a pre BFS
// - sitemap discovery (/sitemap*.xml)
// - JSON endpoint discovery iz HTML-a
// - PDF link discovery (optional tekst ako je pdf-parse instaliran)
// - robust headers (bot-avoidance)
// - fuzija signala (HTML, JSON, API, PDF)

let pdfParse = null;
try { pdfParse = (await import('pdf-parse')).default; } catch {}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULT_PATHS = [
  '/regulation','/regulations','/regulatory',
  '/legal','/legal-documents','/documents',
  '/policies','/policy','/compliance',
  '/risk','/risk-disclosure','/disclosure',
  '/terms','/terms-and-conditions',
  '/client-agreement','/client-services-agreement',
  '/customer-service/regulation','/about/regulation','/about-us/regulation',
];

const LOCALES = ['', '/en', '/en-us', '/en-gb', '/en-au', '/en-eu'];

// ——— Regulator leksikon (proširiv) ———
const REGULATORS = [
  { abbr: 'FCA',   name: 'Financial Conduct Authority',                    tier: 'Tier-1', tokens: ['uk'] },
  { abbr: 'ASIC',  name: 'Australian Securities & Investments Commission', tier: 'Tier-1', tokens: ['au'] },
  { abbr: 'CySEC', name: 'Cyprus Securities and Exchange Commission',      tier: 'Tier-2', tokens: ['eu'] },
  { abbr: 'FSCA',  name: 'Financial Sector Conduct Authority',             tier: 'Tier-2', tokens: ['za','row'] },
  { abbr: 'FSA',   name: 'Financial Services Authority (Seychelles)',      tier: 'Tier-3', tokens: ['row'] },
  { abbr: 'NFA',   name: 'National Futures Association',                   tier: 'Tier-1', tokens: ['us'] },
  { abbr: 'CFTC',  name: 'Commodity Futures Trading Commission',           tier: 'Tier-1', tokens: ['us'] },
  { abbr: 'BaFin', name: 'Bundesanstalt für Finanzdienstleistungsaufsicht',tier: 'Tier-1', tokens: ['de','eu'] },
  { abbr: 'FINMA', name: 'Swiss Financial Market Supervisory Authority',   tier: 'Tier-1', tokens: ['ch'] },
  { abbr: 'MAS',   name: 'Monetary Authority of Singapore',                tier: 'Tier-1', tokens: ['sg'] },
  { abbr: 'SFC',   name: 'Securities and Futures Commission (Hong Kong)',  tier: 'Tier-1', tokens: ['hk'] },
  { abbr: 'DFSA',  name: 'Dubai Financial Services Authority',             tier: 'Tier-2', tokens: ['ae'] },
  { abbr: 'FSRA',  name: 'Financial Services Regulatory Authority (ADGM)', tier: 'Tier-2', tokens: ['ae'] },
  { abbr: 'CBI',   name: 'Central Bank of Ireland',                        tier: 'Tier-1', tokens: ['ie','eu'] },
  { abbr: 'AMF',   name: 'Autorité des marchés financiers (France)',       tier: 'Tier-1', tokens: ['fr','eu'] },
  { abbr: 'CNMV',  name: 'Comisión Nacional del Mercado de Valores',       tier: 'Tier-1', tokens: ['es','eu'] },
  { abbr: 'CONSOB',name: 'Commissione Nazionale per le Società e la Borsa',tier: 'Tier-1', tokens: ['it','eu'] },
  { abbr: 'AFM',   name: 'Netherlands Authority for the Financial Markets',tier: 'Tier-1', tokens: ['nl','eu'] },
  { abbr: 'FMA NZ',name: 'Financial Markets Authority (New Zealand)',      tier: 'Tier-2', tokens: ['nz'] },
  { abbr: 'FMA AT',name: 'Austrian Financial Market Authority',            tier: 'Tier-2', tokens: ['at','eu'] },
  { abbr: 'KNF',   name: 'Polish Financial Supervision Authority',         tier: 'Tier-2', tokens: ['pl','eu'] },
  { abbr: 'CIMA',  name: 'Cayman Islands Monetary Authority',              tier: 'Tier-3', tokens: ['ky'] },
  { abbr: 'FSC BVI', name:'Financial Services Commission (BVI)',           tier: 'Tier-3', tokens: ['bvi'] },
  { abbr: 'FSC Mauritius', name:'Financial Services Commission (Mauritius)', tier:'Tier-3', tokens: ['mu'] },
  { abbr: 'CMA',   name: 'Capital Markets Authority (Kenya)',              tier: 'Tier-3', tokens: ['ke'] },
  { abbr: 'JFSA',  name: 'Japan Financial Services Agency',                tier: 'Tier-1', tokens: ['jp'] },
  { abbr: 'CIRO',  name: 'Canadian Investment Regulatory Organization',    tier: 'Tier-1', tokens: ['ca'] },
];

const REG_BY_ABBR = new Map(REGULATORS.map(r => [normAbbr(r.abbr), r]));
const REG_BY_NAME = new Map(REGULATORS.map(r => [normStr(r.name), r]));

function normAbbr(s) {
  if (!s) return '';
  const m = {
    'IIROC': 'CIRO',
    'FSC (BVI)': 'FSC BVI',
    'FSC (MAURITIUS)': 'FSC Mauritius',
    'FSA (SEYCHELLES)': 'FSA',
    'FSC (SEYCHELLES)': 'FSA',
  };
  const u = s.toUpperCase().replace(/\s+/g, ' ').trim();
  if (u === 'CYSEC') return 'CySEC';
  return m[u] || u;
}
function normStr(s) { return (s||'').toLowerCase().replace(/\s+/g, ' ').trim(); }

function sanitizeUrl(u){ try { return new URL(u).toString(); } catch { return ''; } }
function host(u){ try { return new URL(u).host; } catch { return ''; } }
function rootHost(h){
  const p = (h||'').split('.').filter(Boolean);
  if (p.length <= 2) return h || '';
  // heuristika: .com/.net/.org… (za .co.uk nije savršeno, ali OK)
  return p.slice(-2).join('.');
}
function sameSite(a,b){ return rootHost(host(a)) === rootHost(host(b)); }
function joinUrl(base, path){ try { return new URL(path, base).toString(); } catch { return ''; } }

function makeHeaders(baseUrl){
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Referer': new URL(baseUrl).origin + '/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin'
  };
}

async function fetchRaw(url, timeoutMs, headers){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect:'follow', signal: ctrl.signal });
    const buf = await res.arrayBuffer();
    const ct  = res.headers.get('content-type') || '';
    return { ok: res.ok, status: res.status, url: res.url, buf, ct };
  } catch (e) {
    return { ok:false, status:0, url, buf:null, ct:'', error:String(e?.message||e) };
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, timeoutMs=25000, baseHeaders = {}) {
  const h = { ...makeHeaders(url), ...baseHeaders };
  const r = await fetchRaw(url, timeoutMs, h);
  if (!r.ok || !r.buf) return { ok:false, status:r.status, url:r.url, text:'', ct:r.ct, error:r.error };
  let text = '';
  try { text = new TextDecoder('utf-8').decode(new Uint8Array(r.buf)); }
  catch {}
  return { ok:r.ok, status:r.status, url:r.url, text, ct:r.ct };
}

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']?([^"' >]+)["']?[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1]||'').trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    out.push(joinUrl(baseUrl, href));
  }
  return Array.from(new Set(out));
}

function extractJsonBlobs(html) {
  const blobs = [];

  const reTypeJson = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = reTypeJson.exec(html))) {
    const raw = (m[1] || '').trim();
    const obj = safeParseJson(raw);
    if (obj) blobs.push(obj);
  }

  const reNext = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
  const mn = reNext.exec(html);
  if (mn && mn[1]) {
    const obj = safeParseJson(mn[1]);
    if (obj) blobs.push(obj);
  }

  const reNuxt = /window\.__NUXT__\s*=\s*({[\s\S]*?});?\s*<\/script>/i;
  const mu = reNuxt.exec(html);
  if (mu && mu[1]) {
    const obj = safeParseJson(mu[1]);
    if (obj) blobs.push(obj);
  }

  const reInit = /(?:window\.)?__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i;
  const mi = reInit.exec(html);
  if (mi && mi[1]) {
    const obj = safeParseJson(mi[1]);
    if (obj) blobs.push(obj);
  }

  return blobs;
}

function safeParseJson(raw) {
  try { return JSON.parse(raw); }
  catch {
    const m = raw.match(/{[\s\S]*}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
  }
  return null;
}

function jsonWalkStrings(obj, cb, seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object') return;
  if (seen.has(obj)) return;
  seen.add(obj);
  const each = (v) => {
    if (typeof v === 'string') cb(v);
    else if (v && typeof v === 'object') jsonWalkStrings(v, cb, seen);
  };
  if (Array.isArray(obj)) { for (const v of obj) each(v); }
  else { for (const k of Object.keys(obj)) each(obj[k]); }
}

// ——— Sitemap discovery ———
async function discoverSitemap(base, timeoutMs, baseHeaders) {
  const out = new Set();
  const candidates = [
    '/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'
  ].map(p => joinUrl(base, p));

  for (const u of candidates) {
    const r = await fetchText(u, timeoutMs, baseHeaders);
    if (!r.ok || !r.text) continue;
    // ultra-jednostavno izvlačenje <loc>
    const re = /<loc>([^<]+)<\/loc>/gi;
    let m;
    while ((m = re.exec(r.text))) {
      const loc = sanitizeUrl((m[1]||'').trim());
      if (!loc) continue;
      if (sameSite(base, loc) && /regulat|legal|document|disclosure|terms|licen/i.test(loc)) {
        out.add(loc);
      }
    }
  }
  return Array.from(out);
}

// ——— JSON endpoint discovery u HTML-u ———
function discoverJsonEndpoints(html, baseUrl) {
  const out = new Set();
  // “grubi” regex ka .json
  const re = /https?:\/\/[^\s"'<>]+?\.json\b/gi;
  let m;
  while ((m = re.exec(html))) {
    out.add(m[0]);
  }
  // data-url / inline config vrednosti (relativno)
  const reData = /data-(?:url|endpoint)=["']([^"']+)["']/gi;
  while ((m = reData.exec(html))) {
    out.add(joinUrl(baseUrl, m[1]));
  }
  return Array.from(out);
}

function candidatePaths(homepage, extraSeeds=[]) {
  const base = new URL(homepage).origin;
  const cand = new Set([homepage]);
  for (const loc of LOCALES) {
    for (const p of DEFAULT_PATHS) {
      const path = (loc + '/' + p.replace(/^\/+/,'')).replace(/\/+/g,'/');
      cand.add(joinUrl(base, path));
    }
  }
  for (const s of extraSeeds) cand.add(joinUrl(base, s));
  return Array.from(cand);
}

function pickDocLink(links, ...needles) {
  const L = links.map(u => u.toLowerCase());
  for (const n of needles) {
    const i = L.findIndex(u => u.includes(n));
    if (i >= 0) return links[i];
  }
  return '';
}

function scoreRegPage(url) {
  const u = url.toLowerCase();
  let s = 0;
  if (/\bregulat/i.test(u)) s += 3;
  if (/\blicen[cs]e|licen[cs]ing/i.test(u)) s += 2;
  if (/\blegal|documents|disclosure|terms|risk\b/i.test(u)) s += 1;
  return s;
}

// ——— Parsiranje iz teksta ———
function parseRegulators(text) {
  const found = new Map();
  for (const r of REGULATORS) {
    const reAbbr = new RegExp(`\\b${r.abbr.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'i');
    if (reAbbr.test(text)) found.set(r.abbr, r);
  }
  for (const r of REGULATORS) {
    if (found.has(r.abbr)) continue;
    if (text.toLowerCase().includes(normStr(r.name))) found.set(r.abbr, r);
  }
  return Array.from(found.values());
}

function parseEntities(text) {
  const re = /\b([A-Z][A-Za-z0-9&().,'\-\s]{2,}?\b(?:Ltd|Limited|LLC|LLP|Pty Ltd|Pty|GmbH|S\.?A\.?|S\.?A\.?S\.?|S\.?R\.?L\.?|AG|AS|AB|OY|S\.?P\.?A\.?|Inc\.?|PLC|LLP))\b/g;
  const out = new Set();
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (name.length >= 3 && name.length <= 120) out.add(name);
  }
  return Array.from(out);
}

function parseCompensation(text) {
  const fscs = /\bFSCS\b/i.test(text);
  const icf  = /\bICF\b/i.test(text) || /\bInvestor Compensation Fund\b/i.test(text);
  const amtF = text.match(/£\s?(\d{1,3}(?:,\d{3})?)/) || text.match(/GBP\s?(\d{1,3}(?:,\d{3})?)/);
  const amtE = text.match(/€\s?(\d{1,3}(?:,\d{3})?)/) || text.match(/EUR\s?(\d{1,3}(?:,\d{3})?)/);
  let inv = '';
  if (fscs && amtF) inv = `FSCS up to £${amtF[1]}`;
  if (!inv && fscs) inv = 'FSCS up to £85,000';
  if (icf && amtE) inv = `ICF up to €${amtE[1]}`;
  if (!inv && icf) inv = 'ICF up to €20,000';
  return inv;
}
function parseNBP(text) {
  if (/\bnegative balance protection\b/i.test(text)) return 'Yes (retail)';
  if (/\bNBP\b/i.test(text)) return 'Yes (retail)';
  return '';
}

function inferCountryByReg(abbr) {
  const r = REG_BY_ABBR.get(normAbbr(abbr));
  if (!r) return '';
  const t = (r.tokens || [])[0] || '';
  const map = { uk:'UK', eu:'EU/EEA', au:'Australia', za:'South Africa', row:'Rest of World', us:'United States', ca:'Canada' };
  return map[t] || '';
}
function regionTokensForReg(abbr) {
  const r = REG_BY_ABBR.get(normAbbr(abbr));
  return r ? (r.tokens || []) : [];
}

// ——— PDF tekst (opciono) ———
async function tryPdfText(url, timeoutMs, baseHeaders) {
  if (!pdfParse) return '';
  const r = await fetchRaw(url, timeoutMs, { ...makeHeaders(url), ...baseHeaders });
  if (!r.ok || !r.buf) return '';
  try {
    const data = await pdfParse(Buffer.from(r.buf));
    return (data.text || '').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

// ——— Glavna funkcija ———
export async function extractDeepSafety(opt = {}) {
  const homepage = sanitizeUrl(opt.homepage || '');
  const tried = [];
  const sources = new Set();
  const seen = new Set();
  const queue = [];
  const depthOf = new Map();
  const maxPages = Math.max(8, Number(opt.maxPages || 48));
  const maxDepth = Math.max(1, Number(opt.maxDepth || 3));
  const timeoutMs = Number(opt.timeoutMs || 25000);
  const baseHeaders = opt.headers || {};

  if (!homepage) {
    return {
      normalized: {
        description: 'No homepage provided — cannot crawl legal/regulatory pages.',
        is_regulated: '',
        safety_highlights: [],
        safety_caveats: ['Homepage URL is missing.'],
        legal_entities: [],
        terms_url: '', risk_disclosure_url: '', client_agreement_url: '',
        open_account_url: '',
        warnings: [],
        triedPaths: [],
        sources: [],
        hints: ['Pass ?homepage=<url> or seeds[].']
      }
    };
  }

  // 0) Homepage: footer seed
  const homeRes = await fetchText(homepage, timeoutMs, baseHeaders);
  if (homeRes.ok) {
    sources.add(homeRes.url);
    tried.push(homeRes.url);
  }

  const baseCandidates = candidatePaths(homepage, Array.isArray(opt.seeds) ? opt.seeds : (opt.seeds ? [opt.seeds] : []));
  if (homeRes.ok && homeRes.text) {
    extractAnchors(homeRes.text, homeRes.url)
      .filter(u => /regulat|legal|document|disclosure|terms|licen[cs]|compliance/i.test(u))
      .forEach(u => baseCandidates.push(u));

    // JSON endpoints iz HTML-a
    discoverJsonEndpoints(homeRes.text, homeRes.url).forEach(u => baseCandidates.push(u));
  }

  // 0.5) sitemap
  try {
    const sm = await discoverSitemap(homepage, timeoutMs, baseHeaders);
    sm.forEach(u => baseCandidates.push(u));
  } catch {}

  // sortiraj po score
  const uniq = Array.from(new Set(baseCandidates));
  uniq.sort((a,b) => scoreRegPage(b) - scoreRegPage(a));

  // seed BFS
  for (const u of uniq) {
    if (sameSite(homepage, u)) { queue.push(u); depthOf.set(u, 0); }
    else {
      // dozvoli JSON/PDF i sa subdomena istog root-a
      if (rootHost(host(u)) === rootHost(host(homepage))) {
        queue.push(u); depthOf.set(u, 0);
      }
    }
  }

  const pageTexts = [];
  const jsonTexts = [];
  const apiJsonToFetch = new Set();
  const pageLinks = new Set();
  const pdfLinks = new Set();

  while (queue.length && tried.length < maxPages) {
    const url = queue.shift();
    const depth = depthOf.get(url) || 0;
    if (seen.has(url)) continue;
    seen.add(url);

    tried.push(url);

    // a) JSON fajl direktno?
    if (/\.json($|\?)/i.test(url)) {
      const rj = await fetchText(url, timeoutMs, baseHeaders);
      if (rj.ok && rj.text) {
        const obj = safeParseJson(rj.text);
        if (obj) {
          sources.add(rj.url);
          const lines = [];
          jsonWalkStrings(obj, (s) => { const t=(s||'').trim(); if (t) lines.push(t); });
          if (lines.length) jsonTexts.push(lines.join(' • '));
        }
      }
      continue;
    }

    // b) PDF?
    if (/\.pdf($|\?)/i.test(url)) {
      sources.add(url);
      pdfLinks.add(url);
      continue;
    }

    // c) HTML
    const res = await fetchText(url, timeoutMs, baseHeaders);
    if (!res.ok || !res.text) continue;

    sources.add(res.url);
    const html = res.text;
    const txt  = plainText(html);
    if (txt) pageTexts.push(txt);

    // JSON blobs iz HTML-a
    const blobs = extractJsonBlobs(html);
    if (blobs.length) {
      const lines = [];
      for (const b of blobs) {
        jsonWalkStrings(b, (s) => { const t=(s||'').trim(); if (t) lines.push(t); });
      }
      if (lines.length) jsonTexts.push(lines.join(' • '));
    }

    // nađi dodatne JSON API linkove
    discoverJsonEndpoints(html, res.url).forEach(u => {
      if (!seen.has(u)) { apiJsonToFetch.add(u); queue.push(u); depthOf.set(u, depth + 1); }
    });

    // linkovi (HTML)
    const anchors = extractAnchors(html, res.url);
    anchors.forEach(a => {
      if (/\.pdf($|\?)/i.test(a)) pdfLinks.add(a);
      pageLinks.add(a);
    });

    // BFS
    if (depth < maxDepth) {
      const nextLinks = anchors.filter(u => /regulat|legal|document|disclosure|terms|licen[cs]|compliance/i.test(u));
      for (const n of nextLinks) {
        if (!seen.has(n)) {
          // dozvoli subdomen istog root-a
          if (rootHost(host(n)) === rootHost(host(homepage))) {
            queue.push(n);
            depthOf.set(n, depth + 1);
          }
        }
      }
    }
  }

  // pokušaj PDF teksta (prvih par, da ne bude skupo)
  let pdfTextAgg = '';
  if (pdfParse && pdfLinks.size) {
    const few = Array.from(pdfLinks).slice(0, 2);
    for (const p of few) {
      const t = await tryPdfText(p, timeoutMs, baseHeaders);
      if (t) pdfTextAgg += ' • ' + t;
    }
  }

  // Agreguj
  const big = [pageTexts.join(' • '), jsonTexts.join(' • '), pdfTextAgg].filter(Boolean).join(' • ');

  // Detekcije
  const regs = parseRegulators(big);
  const entityNames = parseEntities(big);
  const nbp = parseNBP(big);
  const invProtect = parseCompensation(big);

  // Dokument linkovi
  const linkList = Array.from(pageLinks);
  const terms_url = pickDocLink(linkList, '.pdf/terms', 'terms-and-conditions', 'terms_of', '/terms');
  const risk_disclosure_url = pickDocLink(linkList, '.pdf/risk', 'risk-disclosure', '/risk', 'risk_disclosure');
  const client_agreement_url = pickDocLink(linkList, '.pdf/client', 'client-services-agreement', 'client-agreement', 'clientagreement');
  const open_account_url = pickDocLink(linkList, 'open-account', 'register', 'join');

  // Legal entities
  const legal_entities = [];
  if (entityNames.length && regs.length) {
    const maxPairs = Math.max(entityNames.length, regs.length);
    for (let i=0;i<maxPairs;i++) {
      const en = entityNames[i % entityNames.length];
      const rg = regs[i % regs.length];
      legal_entities.push({
        entity_name: en,
        country_of_clients: inferCountryByReg(rg.abbr),
        regulator_abbreviation: rg.abbr,
        regulator: rg.name,
        regulation_level: rg.tier,
        investor_protection_amount: invProtect || '',
        negative_balance_protection: nbp || '',
        entity_service_url: '',
        serves_scope: '',
        serve_country_codes: [],
        exclude_country_codes: [],
        terms_url,
        risk_disclosure_url,
        client_agreement_url,
        open_account_url,
        sources: Array.from(sources),
        region_tokens: regionTokensForReg(rg.abbr),
      });
    }
  } else if (regs.length) {
    for (const rg of regs) {
      legal_entities.push({
        entity_name: '',
        country_of_clients: inferCountryByReg(rg.abbr),
        regulator_abbreviation: rg.abbr,
        regulator: rg.name,
        regulation_level: rg.tier,
        investor_protection_amount: invProtect || '',
        negative_balance_protection: nbp || '',
        entity_service_url: '',
        serves_scope: '',
        serve_country_codes: [],
        exclude_country_codes: [],
        terms_url,
        risk_disclosure_url,
        client_agreement_url,
        open_account_url,
        sources: Array.from(sources),
        region_tokens: regionTokensForReg(rg.abbr),
      });
    }
  }

  const desc = [];
  if (regs.length) {
    desc.push(`Detected regulators: ${regs.map(r => r.abbr).join(', ')}.`);
  } else {
    desc.push('Regulatory information detected on legal/compliance pages could not be conclusively resolved.');
  }
  if (nbp) desc.push('Retail negative balance protection mentioned.');
  if (terms_url || risk_disclosure_url || client_agreement_url) {
    desc.push('Key legal documents (Terms, Risk, Agreements) surfaced.');
  }

  const safety_highlights = [];
  if (nbp) safety_highlights.push('Negative balance protection for retail clients.');
  if (terms_url || risk_disclosure_url || client_agreement_url) safety_highlights.push('Public Terms/Risk/Agreement documents available.');

  const safety_caveats = [];
  if (!regs.length) safety_caveats.push('No clear regulator mentions found on crawled pages.');
  if (!invProtect && regs.find(r => r.abbr==='FCA' || r.abbr==='CySEC')) {
    safety_caveats.push('Investor compensation amount not explicitly found.');
  }

  const normalized = {
    description: desc.join(' '),
    is_regulated: regs.map(r => r.abbr).join(', '),
    safety_highlights,
    safety_caveats,
    legal_entities,
    terms_url,
    risk_disclosure_url,
    client_agreement_url,
    open_account_url,
    warnings: [],
    triedPaths: tried,
    sources: Array.from(sources),
    hints: []
  };

  return { ok: true, normalized };
}

try { module.exports = { extractDeepSafety }; } catch {}
