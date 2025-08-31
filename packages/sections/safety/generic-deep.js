// packages/sections/safety/generic-deep.js
// Univerzalni deep crawler za "Safety": traži legal/regulation/risk/terms/client-agreement
// i parsira regulatore, entitete, kompenzacije, NBP, osnovne linkove.
//
// Radi bez seedova po brokeru: BFS po linkovima sa homepage-a sa jakim filterom na ključne pojmove.
// Podržava locale rute (/en, /en-us, /en-au...), canonical i <a> link scraping.

import * as crypto from 'node:crypto';
import { URL } from 'node:url';

/* ------------------------- Podesive granice ------------------------- */
const DEFAULTS = {
  maxPages: 24,
  maxDepth: 2,
  timeoutMs: 25000,
  allowPdf: true,
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TradesmartyBot/1.0';

/* ------------------------- Heuristike i regex ------------------------- */

// ključne reči za rute/anchor-e relevantne za “safety”
const PATH_KEYWORDS = [
  'regulation', 'regulations', 'regulatory', 'license', 'licence',
  'legal', 'legal-doc', 'documents', 'document',
  'risk', 'risk-disclosure', 'disclosure',
  'terms', 'terms-and-conditions',
  'client-agreement', 'client-services-agreement', 'agreement',
  'policies', 'policy', 'compliance', 'security', 'privacy',
  'about/regulation', 'about-us/regulation', 'customer-service',
  'faq/regulation', 'support/regulation'
];

// locale prefiksi koje probamo nad baznim path-ovima
const LOCALE_PREFIXES = ['', '/', '/en', '/en-us', '/en-gb', '/en-au', '/en-ca', '/en-nz', '/en-sg', '/en-za', '/en-uk', '/en-eu'];

// regex za “negative balance protection”
const RE_NBP = /\bnegative balance protection\b/i;

// regex za kompenzacione fondove/iznose
const RE_FSCS = /\bFSCS\b.*?\b(£|\&pound;)?\s?(\d{2,3}[,\d]{0,3})\s*K?\b/i; // npr £85,000
const RE_ICF  = /\b(ICF|Investor Compensation Fund)\b.*?\b(€|\&euro;)?\s?(\d{2,3}[,\d]{0,3})\s*K?\b/i;

// regulator skraćenice i puni nazivi koje hvatamo
const REGULATORS = [
  // Tier-1
  { abbr: 'FCA',   name: 'Financial Conduct Authority',           level: 'Tier-1' },
  { abbr: 'ASIC',  name: 'Australian Securities & Investments Commission', level: 'Tier-1' },
  { abbr: 'NFA',   name: 'National Futures Association',          level: 'Tier-1' },
  { abbr: 'CFTC',  name: 'Commodity Futures Trading Commission',  level: 'Tier-1' },
  { abbr: 'FINMA', name: 'Swiss Financial Market Supervisory Authority',   level: 'Tier-1' },
  { abbr: 'MAS',   name: 'Monetary Authority of Singapore',       level: 'Tier-1' },
  { abbr: 'SFC',   name: 'Securities and Futures Commission (Hong Kong)',  level: 'Tier-1' },
  { abbr: 'BaFin', name: 'Bundesanstalt für Finanzdienstleistungsaufsicht', level: 'Tier-1' },
  { abbr: 'JFSA',  name: 'Japan Financial Services Agency',       level: 'Tier-1' },
  { abbr: 'CIRO',  name: 'Canadian Investment Regulatory Organization', level: 'Tier-1' },

  // Tier-2
  { abbr: 'CySEC', name: 'Cyprus Securities and Exchange Commission',      level: 'Tier-2' },
  { abbr: 'FSCA',  name: 'Financial Sector Conduct Authority (South Africa)', level: 'Tier-2' },
  { abbr: 'CBI',   name: 'Central Bank of Ireland',                level: 'Tier-2' },
  { abbr: 'AMF',   name: 'Autorité des marchés financiers (France)', level: 'Tier-2' },
  { abbr: 'CONSOB',name: 'Commissione Nazionale per le Società e la Borsa', level: 'Tier-2' },
  { abbr: 'CNMV',  name: 'Comisión Nacional del Mercado de Valores', level: 'Tier-2' },
  { abbr: 'AFM',   name: 'Authority for the Financial Markets (Netherlands)', level: 'Tier-2' },
  { abbr: 'FMA',   name: 'Financial Market Authority',             level: 'Tier-2' },

  // Tier-3
  { abbr: 'FSA',   name: 'Financial Services Authority (Seychelles)', level: 'Tier-3' },
  { abbr: 'CIMA',  name: 'Cayman Islands Monetary Authority',     level: 'Tier-3' },
  { abbr: 'FSC BVI', name: 'Financial Services Commission (BVI)', level: 'Tier-3' },
  { abbr: 'FSC Mauritius', name: 'Financial Services Commission (Mauritius)', level: 'Tier-3' },
  { abbr: 'CMA',     name: 'Capital Markets Authority (Kenya)',   level: 'Tier-3' },
  { abbr: 'QFCRA',   name: 'Qatar Financial Centre Regulatory Authority', level: 'Tier-3' },
  { abbr: 'LB FSA',  name: 'Labuan Financial Services Authority', level: 'Tier-3' },
];

const REG_ABBRS = REGULATORS.map(r => r.abbr).sort((a,b)=>b.length-a.length);
const RE_REG_ABBR = new RegExp('\\b(' + REG_ABBRS.map(x => escapeRe(x)).join('|') + ')\\b', 'i');

// entitet: “Something ... Ltd|Limited|LLC|Inc|Pty Ltd|SA|S.A.”
const RE_ENTITY =
  /\b([A-Z][A-Za-z0-9()&\.\-,'\s]{1,80}?)\s+(?:Ltd\.?|Limited|LLC|Inc\.?|Incorporated|Pty\s+Ltd|S\.?A\.?|S\.?A\.?S\.?)\b/gi;

// licenca / reg broj (heuristika)
const RE_LIC_NO =
  /\b(licen[cs]e|authori[sz]ation|registration|FRN|AFSL|No\.?|Number)\s*[:#]?\s*([A-Z0-9\-\/]{3,})/i;

/* ------------------------- Utils ------------------------- */

function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function sanitizeUrl(u) {
  try { return new URL(u).toString(); } catch { return ''; }
}
function joinUrl(base, path) {
  try { return new URL(path, base).toString(); } catch { return ''; }
}

function sameHost(a,b) {
  try { const A = new URL(a), B = new URL(b); return A.host === B.host; } catch { return false; }
}

function isPdf(url) { return /\.pdf(\?|#|$)/i.test(url); }

function deadline(ms) {
  return new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout')), ms));
}

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs || DEFAULTS.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: ctrl.signal,
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('pdf') && !DEFAULTS.allowPdf) {
      return { ok: false, status: res.status, url: res.url, text: '' };
    }
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: '', error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function extractAnchors(html, baseUrl) {
  const out = new Set();
  // <a href="..."> ; relativni i apsolutni
  const re = /<a\b[^>]*?href\s*=\s*["']?([^"' >]+)["']?[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1] || '').trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    const abs = joinUrl(baseUrl, href);
    if (abs) out.add(abs);
  }

  // <link rel="canonical" href="...">
  const r2 = /<link\b[^>]*?rel\s*=\s*["']canonical["'][^>]*?>/gi;
  let m2;
  while ((m2 = r2.exec(html))) {
    const h2 = /href\s*=\s*["']([^"']+)["']/i.exec(m2[0]);
    if (h2 && h2[1]) {
      const abs = joinUrl(baseUrl, h2[1].trim());
      if (abs) out.add(abs);
    }
  }
  return Array.from(out);
}

function scoreLink(u) {
  // Više bodova za ključne reči; penal za binarno/asset
  const url = u.toLowerCase();
  if (url.includes('.jpg') || url.includes('.png') || url.includes('.svg') || url.includes('.css') || url.includes('.js')) return -10;
  let s = 0;
  PATH_KEYWORDS.forEach(k => { if (url.includes(k)) s += 3; });
  if (/\/(en|en-us|en-gb|en-au)\b/.test(url)) s += 1;
  if (/\/(legal|regulat|risk|terms|policy|document)/.test(url)) s += 2;
  if (/client-?agreement/.test(url)) s += 2;
  return s;
}

function uniq(arr) { return Array.from(new Set(arr)); }

/* ------------------------- Parsiranje ------------------------- */

function detectRegulators(text) {
  const found = [];
  let m;
  const seen = new Set();
  while ((m = RE_REG_ABBR.exec(text))) {
    const abbr = m[1];
    const key = abbr.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = REGULATORS.find(r => r.abbr.toUpperCase() === key);
    if (meta) found.push(meta);
  }
  return found;
}

function detectEntities(text) {
  const out = [];
  let m;
  const seen = new Set();
  while ((m = RE_ENTITY.exec(text))) {
    const nm = (m[1] || '').trim().replace(/\s+/g, ' ');
    if (!nm) continue;
    const key = nm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nm);
  }
  return out;
}

function detectCompensation(text) {
  // FSCS £85,000 / ICF €20,000 — heuristika
  const comp = {};
  const f = RE_FSCS.exec(text);
  if (f) {
    comp.fscs = (f[1] ? f[1] : '£') + (f[2] || '85,000');
  }
  const i = RE_ICF.exec(text);
  if (i) {
    comp.icf = (i[1] ? i[1] : '€') + (i[2] || '20,000');
  }
  return comp;
}

function detectLinksFromPage(url, html) {
  const low = html.toLowerCase();
  const m = {
    terms:            />([^<]{0,40}terms[^<]{0,40})<|href=["'][^"']*terms[^"']*["']/i.test(html),
    risk:             />([^<]{0,40}risk[^<]{0,40})<|href=["'][^"']*risk[^"']*["']/i.test(html),
    clientAgreement:  /client[^<]{0,10}agreement|href=["'][^"']*client[^"']*agreement[^"']*["']/i.test(html),
  };

  const links = extractAnchors(html, url)
    .filter(h => sameHost(url, h))
    .sort((a,b)=>scoreLink(b)-scoreLink(a));

  const pick = (needle) => links.find(l => l.toLowerCase().includes(needle));

  return {
    terms_url:             pick('terms'),
    risk_disclosure_url:   pick('risk'),
    client_agreement_url:  links.find(l => /client-?services-?agreement|client-?agreement/.test(l.toLowerCase())),
    links
  };
}

/* ------------------------- Opis i ACF ------------------------- */

function summarize(regs, nbp, comp) {
  if (!regs.length) return 'Regulatory authorisations not conclusively detected on the discovered pages.';
  const parts = [];
  parts.push(
    regs.map(r => `${r.abbr}`).join(', ')
  );
  if (comp.fscs || comp.icf) {
    const c = [];
    if (comp.fscs) c.push(`FSCS up to ${comp.fscs}`);
    if (comp.icf)  c.push(`ICF up to ${comp.icf}`);
    parts.push(c.join('; '));
  }
  if (nbp) parts.push('Negative balance protection for retail clients (where applicable)');
  return parts.join('. ') + '.';
}

function toNormalized(out) {
  // out: { regs:[], entities:[], nbp:bool, comp:{}, links:{}, tried:[], sources:[] }
  const pros = [];
  const cons = [];
  if (out.nbp) pros.push('Negative balance protection (retail).');
  if (out.regs.length) pros.push('Regulatory authorisations detected.');
  if (!out.regs.length) cons.push('No clear regulator mentions found on crawled pages.');

  const legal_entities = out.entities.map(e => {
    // pokušaj da spojiš regulator na osnovu teksta stranice (labavo):
    const hit = out.regs[0] || null;
    return {
      entity_name: e,
      country_of_clients: '',
      regulator_abbreviation: hit ? hit.abbr : '',
      regulator: hit ? hit.name : '',
      regulation_level: hit ? hit.level : '',
      investor_protection_amount: out.comp.fscs ? `FSCS up to ${out.comp.fscs}` :
                                 out.comp.icf  ? `ICF up to ${out.comp.icf}` : '',
      negative_balance_protection: out.nbp ? 'Yes (policy / rules)' : '',
      entity_service_url: '',
      serves_scope: '',
      serve_country_codes: [],
      exclude_country_codes: [],
      terms_url: out.links.terms_url || '',
      risk_disclosure_url: out.links.risk_disclosure_url || '',
      client_agreement_url: out.links.client_agreement_url || '',
      open_account_url: '',
      sources: out.sources
    };
  });

  return {
    description: summarize(out.regs, out.nbp, out.comp),
    is_regulated: out.regs.map(r => `${r.abbr}`).join(', '),
    safety_highlights: pros,
    safety_caveats: cons,
    legal_entities,
    terms_url: out.links.terms_url || '',
    risk_disclosure_url: out.links.risk_disclosure_url || '',
    client_agreement_url: out.links.client_agreement_url || '',
    open_account_url: '',
    warnings: [],
    triedPaths: out.tried,
    sources: out.sources,
    hints: []
  };
}

function toAcf(n) {
  const pros  = Array.isArray(n.safety_highlights) ? n.safety_highlights : [];
  const cons  = Array.isArray(n.safety_caveats)    ? n.safety_caveats    : [];
  const pc = [
    ...pros.map(d => ({ type: 'pro',  description: d })),
    ...cons.map(d => ({ type: 'con',  description: d })),
  ];

  const ents = (n.legal_entities || []).map(e => ({
    entity_name: e.entity_name || '',
    country_of_clients: e.country_of_clients || '',
    logo_regulator: '',
    regulator_abbreviation: e.regulator_abbreviation || '',
    regulator: e.regulator || '',
    regulation_level: e.regulation_level || '',
    investor_protection_amount: e.investor_protection_amount || '',
    negative_balance_protection: e.negative_balance_protection || '',
    regulator_reference: '',
    entity_service_url: e.entity_service_url || '',
    serves_scope: e.serves_scope || '',
    serve_country_codes: e.serve_country_codes || [],
    exclude_country_codes: e.exclude_country_codes || [],
    terms_url: e.terms_url || n.terms_url || '',
    risk_disclosure_url: e.risk_disclosure_url || n.risk_disclosure_url || '',
    client_agreement_url: e.client_agreement_url || n.client_agreement_url || '',
    open_account_url: e.open_account_url || n.open_account_url || '',
    tsbar_manual_seeds: (e.sources || n.sources || []).join('\n'),
    region_tokens: e.region_tokens || []
  }));

  return {
    description_safety:               n.description || '',
    description_safety_is_regulated:  n.is_regulated || '',
    description_safety_is_safe:       pros[0] || '',
    description_safety_is_safe1:      pros[1] || '',
    description_safety_is_safe2:      cons[0] || '',
    description_safety_is_safe3:      cons[1] || '',
    pros_cons_safety:                 pc,
    legal_entities:                   ents,
    terms_url:                        n.terms_url || '',
    risk_disclosure_url:              n.risk_disclosure_url || '',
    client_agreement_url:             n.client_agreement_url || '',
    open_account_url:                 n.open_account_url || '',
    broker_warning_lists:            (n.warnings || []).map(w => ({
      warning_name: w.warning_name || '', warning_url: w.warning_url || ''
    })),
  };
}

/* ------------------------- Kandidati ruta ------------------------- */

function buildCandidatePaths(homepage) {
  const tried = new Set();
  const src = new URL(homepage);
  const base = src.origin;

  // osnovni path-ovi (bez i sa locale prefixima)
  const seeds = [];
  PATH_KEYWORDS.forEach(k => {
    LOCALE_PREFIXES.forEach(p => {
      // npr /en/legal, /en/customer-service/regulation, ...
      const path = (p.endsWith('/') ? p.slice(0,-1) : p) + '/' + k;
      seeds.push(joinUrl(base, path));
    });
  });

  // neke kombinacije sa “customer-service” jer mnogi brokeri (npr. eToro) drže regulation tu
  ['customer-service/regulation', 'support/regulation', 'faq/regulation'].forEach(k => {
    LOCALE_PREFIXES.forEach(p => {
      const path = (p.endsWith('/') ? p.slice(0,-1) : p) + '/' + k;
      seeds.push(joinUrl(base, path));
    });
  });

  // jedinstveno + filtriraj na isti host
  return uniq(seeds.filter(u => u && sameHost(homepage, u)));
}

/* ------------------------- Crawler ------------------------- */

export async function extractDeepSafety(opts = {}) {
  const homepage = sanitizeUrl(opts.homepage || '');
  const maxPages = Number(opts.maxPages || DEFAULTS.maxPages);
  const maxDepth = Number(opts.maxDepth || DEFAULTS.maxDepth);
  const timeoutMs= Number(opts.timeoutMs || DEFAULTS.timeoutMs);

  if (!homepage) {
    return {
      description: 'No homepage provided — cannot crawl legal/regulatory pages.',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['Homepage URL is missing.'],
      legal_entities: [],
      terms_url:'', risk_disclosure_url:'', client_agreement_url:'', open_account_url:'',
      triedPaths: [], sources: [], hints: ['Pass ?homepage=<url> or seeds[].']
    };
  }

  const tried = [];
  const sources = new Set();
  const regsSet = new Map(); // abbr -> meta
  const entitiesSet = new Set();
  let terms_url = '', risk_url = '', agreement_url = '';
  let nbp = false;
  let comp = {};

  const Q = [];
  const seen = new Set();

  // 0) start sa homepage + kandidati
  const initial = buildCandidatePaths(homepage);
  Q.push({ url: homepage, depth: 0 });
  initial.forEach(u => Q.push({ url: u, depth: 1 }));

  while (Q.length && tried.length < maxPages) {
    const { url, depth } = Q.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    tried.push(url);

    const isSameHost = sameHost(homepage, url);
    if (!isSameHost) continue; // sigurnost

    // skip PDF ako je zabranjeno
    if (isPdf(url) && !opts.allowPdf) continue;

    const res = await fetchText(url, timeoutMs);
    if (!res.ok || !res.text) continue;

    const html = res.text;
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                     .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

    sources.add(res.url);

    // 1) izvuči linkove
    const { terms_url: turl, risk_disclosure_url: rurl, client_agreement_url: aurl, links } = detectLinksFromPage(res.url, html);
    if (!terms_url && turl) terms_url = turl;
    if (!risk_url && rurl) risk_url = rurl;
    if (!agreement_url && aurl) agreement_url = aurl;

    // 2) detektuj regulatore, entitete, NBP, kompenzacije
    const regs = detectRegulators(text);
    regs.forEach(r => { if (!regsSet.has(r.abbr)) regsSet.set(r.abbr, r); });

    detectEntities(text).forEach(e => entitiesSet.add(e));
    if (!nbp && RE_NBP.test(text)) nbp = true;

    const compHit = detectCompensation(text);
    comp = { ...comp, ...compHit };

    // 3) BFS nastavi samo ka “obećavajućim” linkovima i dubina ograničena
    if (depth < maxDepth) {
      const next = links
        .filter(u => scoreLink(u) > 0) // samo legal/regulation/terms/risk…
        .slice(0, 30);                 // limit fan-out
      next.forEach(u => { if (!seen.has(u)) Q.push({ url: u, depth: depth + 1 }); });
    }
  }

  const regsArr = Array.from(regsSet.values());
  const entitiesArr = Array.from(entitiesSet.values());

  const out = {
    regs: regsArr,
    entities: entitiesArr,
    nbp,
    comp,
    links: {
      terms_url: terms_url || '',
      risk_disclosure_url: risk_url || '',
      client_agreement_url: agreement_url || ''
    },
    tried,
    sources: Array.from(sources)
  };

  const normalized = toNormalized(out);
  const acf = toAcf(normalized);

  return { ok: true, normalized, acf };
}

// CommonJS compat
try { module.exports = { extractDeepSafety }; } catch {}
