// packages/sections/safety/generic-deep.js
// Univerzalni “deep” ekstraktor za SAFETY sekciju (bez hardkodovanih tekstova).
// Strategija:
//  1) Kandiati URL-eva: homepage + heuristički “legal/regulation” putevi + seos/links sa homepage-a
//  2) BFS crawl (isti host), strogi limit (maxPages, maxDepth, timeout), bez headless rendera
//  3) Parsiranje teksta: detekcija regulatora (regex + sinonimi), entiteta (Ltd/Limited/LLC/Pty...), NBP, kompenzacioni fondovi
//  4) Linkovi dokumenata: Terms / Risk / Client Agreement / Disclosures
//  5) Normalizacija → description/is_regulated/highlights/caveats/legal_entities/+ top-level links
//
// Napomene:
//  - Nema “gotovog” teksta po brokeru. Opisi su generisani iz detektovanih podataka (spojeni stringovi).
//  - Postoji regulator katalog (abbr ⇄ pun naziv + default “tier” + common region tokens).
//  - Ako ne nađemo ništa smisleno, uredno vraćamo “No clear regulator mentions found...” i “triedPaths/sources”.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TS-Deep/1.0';

const DEFAULT_PATHS = [
  '/regulation', '/regulations', '/regulatory', '/licence', '/license',
  '/legal', '/legal-documents', '/documents', '/policies', '/policy',
  '/risk', '/risk-disclosure', '/disclosure', '/compliance',
  '/terms', '/terms-and-conditions', '/client-agreement', '/client-services-agreement',
  '/customer-service/regulation', '/about/regulation', '/about-us/regulation', '/education/faq/regulation',
];

const LOCALES = ['', '/en', '/en-us', '/en-gb', '/en-au', '/en-eu'];

// Minimalni katalog regulatora (možeš širiti koliko želiš; WP plugin ih linkuje prema svom indexu)
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
    'IIROC': 'CIRO', // legacy -> CIRO
    'FSC (BVI)': 'FSC BVI',
    'FSC (MAURITIUS)': 'FSC Mauritius',
    'FSA (SEYCHELLES)': 'FSA',
    'FSC (SEYCHELLES)': 'FSA',
  };
  const u = s.toUpperCase().replace(/\s+/g, ' ').trim();
  return m[u] || u;
}
function normStr(s) { return (s||'').toLowerCase().replace(/\s+/g, ' ').trim(); }

function sanitizeUrl(u) { try { return new URL(u).toString(); } catch { return ''; } }
function sameHost(a,b){ try { const A=new URL(a),B=new URL(b); return A.host===B.host; } catch { return false; } }
function joinUrl(base, path){ try { return new URL(path, base).toString(); } catch { return ''; } }

async function fetchText(url, timeoutMs=20000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8'
      },
      redirect: 'follow',
      signal: ctrl.signal
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch (e) {
    return { ok:false, status:0, url, text:'', error:String(e?.message||e) };
  } finally {
    clearTimeout(t);
  }
}

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']?([^"' >]+)["']?[^>]*>(.*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1]||'').trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    out.push(joinUrl(baseUrl, href));
  }
  return Array.from(new Set(out));
}

function candidatePaths(homepage, extraSeeds=[]) {
  const base = new URL(homepage).origin;
  const cand = new Set([homepage]);

  for (const loc of LOCALES) {
    for (const p of DEFAULT_PATHS) {
      const path = (loc + '/' + p.replace(/^\/+/,'')).replace(/\/+/g,'/');
      const u = joinUrl(base, path);
      if (sameHost(homepage, u)) cand.add(u);
    }
  }
  for (const s of extraSeeds) {
    const u = joinUrl(base, s);
    if (sameHost(homepage, u)) cand.add(u);
  }
  return Array.from(cand);
}

// Heuristike za linkove dokumenata
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
  if (/\blegal|documents|disclosure|compliance|terms|risk\b/i.test(u)) s += 1;
  return s;
}

// Ekstrakcija iz teksta: regulator, entiteti, NBP, kompenzacija
function parseRegulators(text) {
  const found = new Map(); // abbr -> object
  // prvo probaj skraćenice
  for (const r of REGULATORS) {
    const a = r.abbr;
    const reAbbr = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'i');
    if (reAbbr.test(text)) found.set(r.abbr, r);
  }
  // pa puni nazivi (oprezno)
  for (const r of REGULATORS) {
    if (found.has(r.abbr)) continue;
    const nn = normStr(r.name);
    if (nn && text.toLowerCase().includes(nn)) found.set(r.abbr, r);
  }
  return Array.from(found.values());
}

function parseEntities(text) {
  // traži “XYZ Ltd/LLC/Limited/SA/Pty/GmbH/AS” itd.
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
  // prepoznaj FSCS / ICF iznose
  const bullets = [];
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
  const map = { uk:'UK', eu:'EU/EEA', au:'Australia', za:'South Africa', row:'Rest of World', us:'United States' };
  return map[t] || '';
}

function regionTokensForReg(abbr) {
  const r = REG_BY_ABBR.get(normAbbr(abbr));
  return r ? (r.tokens || []) : [];
}

export async function extractDeepSafety(opt = {}) {
  const homepage = sanitizeUrl(opt.homepage || '');
  const tried = [];
  const sources = new Set();
  const seen = new Set();
  const queue = [];
  const depthOf = new Map();
  const maxPages = Math.max(4, Number(opt.maxPages || 32));
  const maxDepth = Math.max(1, Number(opt.maxDepth || 2));
  const timeoutMs = Number(opt.timeoutMs || 20000);

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

  // seeds + heuristički candidates
  const seeds = Array.isArray(opt.seeds) ? opt.seeds : (opt.seeds ? [opt.seeds] : []);
  const baseCandidates = candidatePaths(homepage, seeds);
  baseCandidates.sort((a,b) => scoreRegPage(b) - scoreRegPage(a));
  for (const u of baseCandidates) {
    if (sameHost(homepage, u)) { queue.push(u); depthOf.set(u, 0); }
  }

  const pageTexts = [];      // čist tekst
  const pageLinks = new Set(); // apsolutni linkovi za doc picks

  while (queue.length && tried.length < maxPages) {
    const url = queue.shift();
    const depth = depthOf.get(url) || 0;
    if (seen.has(url)) continue;
    seen.add(url);

    tried.push(url);
    const res = await fetchText(url, timeoutMs);
    if (!res.ok || !res.text) continue;

    sources.add(res.url);
    const txt  = plainText(res.text);
    pageTexts.push(txt);

    const anchors = extractAnchors(res.text, res.url);
    anchors.forEach(a => { if (sameHost(homepage, a)) pageLinks.add(a); });

    // BFS na linkove koji liče na regulation/legal (do maxDepth)
    if (depth < maxDepth) {
      const nextLinks = anchors
        .filter(u => /\b(regulat|legal|document|risk|disclosure|terms|licen[cs]|compliance)\b/i.test(u));
      for (const n of nextLinks) {
        if (!seen.has(n) && sameHost(homepage, n)) {
          queue.push(n);
          depthOf.set(n, depth + 1);
        }
      }
    }
  }

  // agreguj tekst za detekciju
  const big = pageTexts.join(' • ');

  // 1) Regulatori
  const regs = parseRegulators(big);

  // 2) Entiteti
  const entityNames = parseEntities(big);

  // 3) NBP
  const nbp = parseNBP(big);

  // 4) Kompenzacioni fondovi
  const invProtect = parseCompensation(big);

  // 5) Dokument linkovi
  const linkList = Array.from(pageLinks);
  const terms_url = pickDocLink(linkList,
    'terms-and-conditions', 'terms_of', 'terms', '/terms');
  const risk_disclosure_url = pickDocLink(linkList,
    'risk-disclosure', '/risk', 'risk_disclosure');
  const client_agreement_url = pickDocLink(linkList,
    'client-services-agreement', 'client-agreement', 'clientagreement');
  const open_account_url = pickDocLink(linkList, 'open-account', 'register', 'join');

  // 6) Sklopi legal_entities (heuristika: spari entitete sa regulatorima)
  const legal_entities = [];
  if (entityNames.length && regs.length) {
    // ako ima više entiteta i više regulatora – heuristički “fan-out”
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
        entity_service_url: '', // teško garantovati per-entity url bez spec. patterna
        serves_scope: '', // može se dopuniti kasnije kad imaš više signala
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
    // nema eksplicitnih imena entiteta, ali imamo regulatore – ipak zabeleži po regulatoru
    for (const rg of regs) {
      legal_entities.push({
        entity_name: '', // ostavi prazno – WP front ima fallback labelu
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

  // 7) description / highlights / caveats
  const descBits = [];
  if (regs.length) {
    const regStr = regs.map(r => r.abbr).join(', ');
    descBits.push(`Detected regulators: ${regStr}.`);
  } else {
    descBits.push('Regulatory information detected on legal/compliance pages could not be conclusively resolved.');
  }
  if (nbp) descBits.push('Retail negative balance protection mentioned.');
  if (terms_url || risk_disclosure_url || client_agreement_url) {
    descBits.push('Key legal documents (Terms, Risk, Agreements) surfaced.');
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
    description: descBits.join(' '),
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

// CommonJS
try { module.exports = { extractDeepSafety }; } catch {}
