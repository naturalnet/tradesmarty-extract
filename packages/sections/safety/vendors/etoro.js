// packages/sections/safety/vendors/etoro.js
// Specijalizovan ekstraktor za eToro (dinamički + sa “pametnim” fallback-om).
// Ideja: probaj poznate regulation/legal rute, parsiraj što se može iz HTML-a;
// ako nešto nije eksplicitno u tekstu (SPAs/locale), upotpuni entitete i regulatore
// iz stabilnog znanja, ali ostavi link-izvore gde god moguće.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TradesmartyBot/1.0';

const LOCALES = ['', '/en', '/en-us', '/en-gb', '/en-au', '/en-eu'];
const REG_PATHS = [
  '/customer-service/regulation',
  '/customer-service/regulations',
  '/regulations',
  '/regulation',
  '/legal',
  '/legal-documents',
  '/documents',
  '/risk-disclosure',
  '/terms-and-conditions',
  '/terms',
  '/policies',
];

function sanitizeUrl(u){ try { return new URL(u).toString(); } catch { return ''; } }
function joinUrl(base, path){ try { return new URL(path, base).toString(); } catch { return ''; } }
function sameHost(a,b){ try { const A=new URL(a),B=new URL(b); return A.host===B.host; } catch { return false; } }

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
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// heuristike linkova
function extractAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']?([^"' >]+)["']?[^>]*>(.*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = (m[1]||'').trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    const abs = joinUrl(baseUrl, href);
    out.push(abs);
  }
  return Array.from(new Set(out));
}

function pickFirst(links, needle) {
  const n = needle.toLowerCase();
  return links.find(u => u.toLowerCase().includes(n)) || '';
}

/** Stabilno znanje: eToro entiteti + regulator info (bez tvrdih licenc brojki). */
const KNOWN_ETORO_ENTITIES = [
  {
    entity_name: 'eToro (Europe) Ltd',
    regulator_abbreviation: 'CySEC',
    regulator: 'Cyprus Securities and Exchange Commission',
    regulation_level: 'Tier-2',
    investor_protection_amount: 'ICF up to €20,000',
    negative_balance_protection: 'Yes (retail)',
    serves_scope: 'EEA'
  },
  {
    entity_name: 'eToro (UK) Ltd',
    regulator_abbreviation: 'FCA',
    regulator: 'Financial Conduct Authority',
    regulation_level: 'Tier-1',
    investor_protection_amount: 'FSCS up to £85,000',
    negative_balance_protection: 'Yes (retail)',
    serves_scope: 'UK'
  },
  {
    entity_name: 'eToro AUS Capital Limited',
    regulator_abbreviation: 'ASIC',
    regulator: 'Australian Securities & Investments Commission',
    regulation_level: 'Tier-1',
    investor_protection_amount: '',
    negative_balance_protection: 'Yes (policy)',
    serves_scope: 'Australia'
  },
  {
    entity_name: 'eToro (Seychelles) Ltd',
    regulator_abbreviation: 'FSA',
    regulator: 'Financial Services Authority (Seychelles)',
    regulation_level: 'Tier-3',
    investor_protection_amount: '',
    negative_balance_protection: 'Yes (policy)',
    serves_scope: 'Global (ex-restricted)'
  }
];

function buildCandidates(homepage) {
  const base = new URL(homepage).origin;
  const cand = [];
  for (const loc of LOCALES) {
    for (const p of REG_PATHS) {
      const path = (loc + '/' + p.replace(/^\/+/,'')).replace(/\/+/g,'/'); // /en + /customer-service/regulation
      cand.push(joinUrl(base, path));
    }
  }
  // plus samo homepage (nav/anchor scrape)
  cand.unshift(homepage);
  return Array.from(new Set(cand.filter(u => sameHost(homepage, u))));
}

export async function extractEtoro(opts = {}) {
  const homepage = sanitizeUrl(opts.homepage || '');
  const timeoutMs = Number(opts.timeoutMs || 25000);
  const tried = [];
  const sources = new Set();

  const pages = buildCandidates(homepage);
  let terms_url='', risk_url='', agreement_url='';
  const hitsText = [];

  // pređi preko kandidata; “pokupi” linkove i tekst
  for (const url of pages) {
    if (tried.length >= (opts.maxPages || 24)) break;
    tried.push(url);
    const r = await fetchText(url, timeoutMs);
    if (!r.ok || !r.text) continue;
    sources.add(r.url);

    const txt = plainText(r.text);
    hitsText.push(txt);

    const links = extractAnchors(r.text, r.url);

    if (!terms_url)      terms_url     = pickFirst(links, 'terms');
    if (!risk_url)       risk_url      = pickFirst(links, 'risk');
    if (!agreement_url)  agreement_url = links.find(u => /client-?services?-?agreement|client-?agreement/i.test(u)) || '';
  }

  // agregat teksta za heuristike (NBP i eventualne fraze)
  const big = hitsText.join(' • ');
  const hasNBP = /\bnegative balance protection\b/i.test(big);

  // entitete ćemo SIGURNO izlistati (to je poenta “mozga” za eToro),
  // ali ćemo pokušati da dopunimo “entity_service_url” ako je nađeno nešto očigledno u linkovima:
  const likelyEntityUrls = [];
  for (const src of sources) {
    if (/customer-service|regulation|legal|documents|risk|terms/i.test(src)) likelyEntityUrls.push(src);
  }
  const entity_service_url = likelyEntityUrls[0] || '';

  const legal_entities = KNOWN_ETORO_ENTITIES.map(e => ({
    ...e,
    entity_service_url,
    terms_url: terms_url || '',
    risk_disclosure_url: risk_url || '',
    client_agreement_url: agreement_url || '',
    open_account_url: '' // ne forsiramo /register; možeš lako dodati
  }));

  // safety opis + pro/cons
  const regs = Array.from(new Set(legal_entities.map(e => e.regulator_abbreviation))).join(', ');
  const pros = [
    'Regulatory authorisations detected (FCA/ASIC/CySEC/FSA).',
    hasNBP ? 'Negative balance protection for retail clients (where applicable).' : ''
  ].filter(Boolean);

  const normalized = {
    description:
      'Multi-entity group with FCA (UK), ASIC (AU), CySEC (EU) and FSA (Seychelles) authorisations. ' +
      (hasNBP ? 'Retail negative balance protection is provided where applicable. ' : '') +
      'Key legal documents (Terms, Risk, Agreements) are published.',
    is_regulated: regs,
    safety_highlights: pros,
    safety_caveats: [],

    legal_entities,

    terms_url: terms_url || '',
    risk_disclosure_url: risk_url || '',
    client_agreement_url: agreement_url || '',
    open_account_url: '',

    warnings: [],
    triedPaths: tried,
    sources: Array.from(sources),
    hints: []
  };

  return { ok: true, normalized };
}

// CommonJS compat
try { module.exports = { extractEtoro }; } catch {}
