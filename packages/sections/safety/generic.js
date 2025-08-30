// packages/sections/safety/generic.js
import { fetchOK, loadCheerio, toAbs, sameSite } from '../../core/http.js';
import { autoSeedsFromSitemaps } from '../../core/sitemap.js';
import { crawlDomainSeeds } from '../../core/crawl.js';

const REGULATOR_TOKENS = [
  { re: /\bFCA\b/i,   label: 'FCA'  },
  { re: /\bCySEC\b/i, label: 'CySEC'},
  { re: /\bASIC\b/i,  label: 'ASIC' },
  { re: /\bFSCA\b/i,  label: 'FSCA' },
  { re: /\bJSC\b/i,   label: 'JSC'  },
  { re: /\bCMA\b/i,   label: 'CMA'  },
  { re: /\bFSA\b/i,   label: 'FSA'  }
];

const LEGAL_TOKENS = [
  'legal','regulation','regulatory','documents','document','policies','policy',
  'risk','disclosure','terms','conditions','agreement','client',
  'complaint','complaints','privacy','cookie','cookies','kyc','aml','legal-information','docs',
  // ex-YU / EU varijante:
  'pravni','pravne','pravno','regulaci','uslovi','uvjeti','odredbe','sporazum','klijent',
  'rizik','politika','privatnost','kolačić','kolacic'
].map(x => new RegExp(x, 'i'));

const KEYWORD_PATTERNS = [
  /risk|disclosure|terms|conditions|agreement|client|legal|privacy|cookie|complaints|kyc|aml/i,
  /regulation|regulatory|cysec|fca|fsa|fsca|asic|jsc|cma/i
];

function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }
async function tryLoad(url, acceptLanguage) { return !!(await fetchOK(url, {acceptLanguage})); }

function detectOpenAccount($, baseUrl) {
  const candidates = [];
  $('a[href]').each((_i,a)=>{
    const $a = $(a);
    const label = ($a.text() || '').toLowerCase();
    const href  = String($a.attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (/(open (live )?account|join now|start trading|get started|open account|create account|register|signup|sign up|live account)/i.test(label)) {
      candidates.push(toAbs(baseUrl, href));
    }
  });
  return candidates[0] || '';
}

function extractHeaderFooterLinks($, baseUrl) {
  const buckets = new Set();
  const areas = ['header','footer','nav','[role="navigation"]'];
  areas.forEach(sel => {
    $(sel).find('a[href]').each((_i,a)=>{
      const href = String($(a).attr('href') || '');
      const txt  = String($(a).text() || '');
      const pair = (txt + ' ' + href);
      if (LEGAL_TOKENS.some(re => re.test(pair))) buckets.add(toAbs(baseUrl, href));
    });
  });
  return Array.from(buckets);
}

function extractHreflangs($, baseUrl) {
  const out = new Set();
  $('link[rel="alternate"][hreflang]').each((_i, link)=>{
    const href = String($(link).attr('href') || '');
    if (!href) return;
    out.add(toAbs(baseUrl, href));
  });
  return Array.from(out);
}

function discoverLocalePrefixes({ homepageUrl, headerFooterLinks, hreflangHomes }) {
  const prefixes = new Set();
  const push = s => { if (s) prefixes.add('/' + s.replace(/^\//,'').replace(/\/$/,'')); };

  try {
    const seg = new URL(homepageUrl).pathname.replace(/(^\/|\/$)/g,'').split('/')[0];
    if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(seg)) push(seg);
  } catch {}

  const scan = (arr=[]) => {
    for (const u of arr) {
      try {
        const path = new URL(u).pathname;
        const m = path.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
        if (m) push(m[1]);
      } catch {}
    }
  };
  scan(headerFooterLinks); scan(hreflangHomes);

  // česte varijante
  ['en','cy-en','au-en','bs-en','eu-en','int-en','global-en','sg-en','uk-en','za-en'].forEach(push);

  return Array.from(prefixes);
}

function buildLocalizedCandidates(origin, prefixes) {
  const tails = [
    '/terms','/terms-and-conditions','/legal','/legal-information','/regulation','/regulations','/regulatory',
    '/documents','/document','/policies','/policy','/risk','/risk-disclosure','/agreement','/client',
    '/privacy','/privacy-policy','/cookies','/cookie-policy','/complaints','/kyc','/aml','/docs'
  ];
  const out = new Set();
  for (const t of tails) out.add(new URL(t, origin).toString());
  for (const pref of prefixes) for (const t of tails)
    out.add(new URL(pref + t.replace(/^\//,''), origin).toString());
  return Array.from(out);
}

function classifyPdfLinks(urls = []) {
  const low = (s='') => s.toLowerCase();
  const result = { terms:'', risk:'', agreement:'' };
  for (const u of urls) {
    if (!/\.pdf(\?|$)/i.test(u)) continue;
    const L = low(u);
    if (!result.risk && /(risk|disclos)/.test(L)) result.risk = u;
    else if (!result.agreement && /(agreement|client|services?-agreement)/.test(L)) result.agreement = u;
    else if (!result.terms && /(terms|conditions|tandc|t&c)/.test(L)) result.terms = u;
  }
  return result;
}

// --- JSON scraper: hvata PDF/route linkove iz __NEXT_DATA__/__NUXT__/INITIAL_STATE
function extractJsonLinks($, baseUrl) {
  const found = new Set();
  const rxUrl = /(https?:\/\/[^\s"']+|\b\/[A-Za-z0-9_\-./%?=&]+)(?=["'\s}])/g;
  $('script').each((_i, s) => {
    const type = (s.attribs?.type || '').toLowerCase();
    // skip očigledne non-JSON skripte
    if (type && !/json|ld\+json/.test(type) && !/application\/json/.test(type)) {
      // ipak pročitaj i običan <script> — Next/NUXT ume da inline-uje state
    }
    const txt = $(s).html() || '';
    if (!/__NEXT_DATA__|__NUXT__|INITIAL_STATE|Nuxt|next|hydrate|pageProps|payload/i.test(txt)) return;
    let m; let guard = 0;
    while ((m = rxUrl.exec(txt)) && guard < 2000) {
      guard++;
      const u = m[1];
      if (!u) continue;
      const abs = toAbs(baseUrl, u);
      // dozvoli samo isti sajt (i poddomene)
      if (sameSite(abs, baseUrl)) found.add(abs);
    }
  });
  return Array.from(found);
}

function extractEntitiesFromText(allText, pageUrl, homepage) {
  const ents = [];

  // Seychelles / FSA SDxxx
  const fsaRef = (allText.match(/(?:Licence|License)\s*(?:No\.?|Number)?\s*(SD\d{2,3})/i)?.[1])
              || (allText.match(/\bSD\d{2,3}\b/)?.[0]);
  if (/Seychelles|FSA/i.test(allText) && fsaRef) {
    ents.push({
      entity_name: /Quadcode/i.test(allText) ? 'Quadcode Markets Ltd' : 'Seychelles Entity',
      country_of_clients: 'Rest of World',
      regulator_abbreviation: 'FSA',
      regulator: 'Financial Services Authority (Seychelles)',
      regulation_level: 'Tier-3',
      investor_protection_amount: 'N/A',
      negative_balance_protection: 'Yes (policy)',
      entity_service_url: pageUrl || homepage || '',
      serves_scope: 'GLOBAL',
      serve_country_codes: [],
      exclude_country_codes: [],
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: '',
      tsbar_manual_seeds: '',
      region_tokens: ['row'],
      regulator_reference: fsaRef
    });
  }

  // Cyprus / CySEC xx/xx
  const cyMatch = allText.match(/CySEC[^.\n]*(?:licen[cs]e\s*(?:no\.?|number)?\s*)?(\d{2,3}\/\d{2})/i);
  if (cyMatch || /Cyprus Investment Firm|MiFID|CySEC/i.test(allText)) {
    ents.push({
      entity_name: /Quadcode/i.test(allText) ? 'Quadcode Markets (Cyprus) Ltd' : 'Cyprus Entity',
      country_of_clients: 'EU/EEA',
      regulator_abbreviation: 'CySEC',
      regulator: 'Cyprus Securities and Exchange Commission',
      regulation_level: 'Tier-2',
      investor_protection_amount: 'ICF up to €20,000',
      negative_balance_protection: 'Yes (retail; policy)',
      entity_service_url: pageUrl || homepage || '',
      serves_scope: 'EEA',
      serve_country_codes: [],
      exclude_country_codes: ['BE'],
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: '',
      tsbar_manual_seeds: '',
      region_tokens: ['eu'],
      regulator_reference: cyMatch?.[1] ? `License ${cyMatch[1]}` : ''
    });
  }

  // ASIC / AFSL
  const afsl = allText.match(/\bAFSL\s*\d{3,6}\b/i)?.[0];
  if (afsl || /ASIC\b/i.test(allText)) {
    ents.push({
      entity_name: 'Australian Entity',
      country_of_clients: 'Australia',
      regulator_abbreviation: 'ASIC',
      regulator: 'Australian Securities & Investments Commission',
      regulation_level: 'Tier-1',
      investor_protection_amount: 'N/A',
      negative_balance_protection: 'Yes (retail; ASIC CFD order)',
      entity_service_url: pageUrl || homepage || '',
      serves_scope: 'COUNTRY_LIST',
      serve_country_codes: ['AU'],
      exclude_country_codes: [],
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: '',
      tsbar_manual_seeds: '',
      region_tokens: ['au'],
      regulator_reference: afsl || ''
    });
  }

  return ents;
}

export async function extractGenericSafety({ homepage, seeds = [] }) {
  const triedPaths = [];
  const sources = [];
  const hints = [];

  const origin = (() => { try { return new URL(homepage).origin; } catch { return ''; } })();
  if (!origin) return { ok:false, error:'not_supported', reason:'bad_homepage' };

  // Accept-Language hint iz locale prefiksa
  let acceptLanguage = 'en;q=0.9, *;q=0.5';

  // 0) homepage (CTA + nav + hreflang + JSON)
  let openAccount = '';
  let homepageText = '';
  let headerFooterLinks = [];
  let hreflangHomes = [];
  let jsonLinks = [];

  triedPaths.push(homepage);
  try {
    const $home = await loadCheerio(homepage, { acceptLanguage });
    sources.push(homepage);
    homepageText = $('body').text() || '';
    openAccount = detectOpenAccount($home, homepage);
    headerFooterLinks = extractHeaderFooterLinks($home, homepage);
    hreflangHomes = extractHreflangs($home, homepage).filter(u => sameSite(u, origin));
    jsonLinks = extractJsonLinks($home, homepage);
    // probaj da izvučeš Accept-Language iz hreflang (ako postoji npr bs-en → bs,en)
    const pref = (new URL(homepage).pathname.match(/^\/([a-z]{2})(?:-[a-z]{2})?\b/i)?.[1] || '').toLowerCase();
    if (pref) acceptLanguage = `${pref};q=0.9, en;q=0.8, *;q=0.5`;
  } catch { /* ignore */ }

  // 1) robots/sitemaps
  let sitemapSeeds = [];
  try {
    sitemapSeeds = await autoSeedsFromSitemaps(origin, [
      /regulat/i, /legal/i, /document/i, /policy/i,
      /risk/i, /disclosure/i, /terms/i, /agreement/i, /client/i,
      /privacy/i, /cookie/i, /complaints?/i, /kyc/i, /aml/i, /docs?/i, /legal-information/i
    ], 64);
  } catch {}

  // 2) locale prefiksi -> kandidati
  const prefixes = (() => {
    const set = new Set(discoverLocalePrefixes({
      homepageUrl: homepage, headerFooterLinks, hreflangHomes
    }));
    return Array.from(set);
  })();
  const localizedCandidates = buildLocalizedCandidates(origin, prefixes);

  // 3) plitki crawl od homepage + nav linkova + json linkova
  const crawlSeeds = uniq([homepage, ...headerFooterLinks, ...jsonLinks]).slice(0, 16);
  let crawled = [];
  try {
    crawled = await crawlDomainSeeds({
      origin,
      startUrls: crawlSeeds,
      keywordPatterns: KEYWORD_PATTERNS,
      maxPages: 60
    });
  } catch {}

  // 4) finalni skup kandidata (do 18 za parsiranje)
  const candidatePages = uniq([
    ...seeds.map(s => toAbs(origin, s)),
    ...sitemapSeeds,
    ...headerFooterLinks,
    ...hreflangHomes,
    ...localizedCandidates,
    ...jsonLinks,
    ...crawled
  ]).filter(u => sameSite(u, origin));

  const pages = [];
  for (const u of candidatePages) {
    triedPaths.push(u);
    if (await tryLoad(u, acceptLanguage)) {
      pages.push(u);
      sources.push(u);
    }
    if (pages.length >= 18) break;
  }

  if (!pages.length && !homepageText) {
    return { ok:false, error:'not_supported', reason:'no_documents', triedPaths, hints:['No detectable legal/risk pages. Consider adding one seed URL.'] };
  }

  // 5) parsiranje kandidata
  const links = [];
  const regsFound = new Set();
  const texts = [homepageText].filter(Boolean);

  for (const u of pages) {
    try {
      const $ = await loadCheerio(u, { acceptLanguage });
      const text = $('body').text() || '';
      texts.push(text);

      $('a[href]').each((_i, a) => {
        const href = String($(a).attr('href') || '');
        const label = String($(a).text() || '');
        const combo = (label + ' ' + href);
        const abs = toAbs(u, href);
        if (!sameSite(abs, origin)) return;
        if (LEGAL_TOKENS.some(re => re.test(combo))) links.push(abs);
        if (/\.pdf(\?|$)/i.test(abs)) links.push(abs); // zadrži sve PDF-ove sa istog sajta/poddomena
      });

      // JSON linkovi i sa ovih strana (npr. pageProps)
      extractJsonLinks($, u).forEach(L => { if (sameSite(L, origin)) links.push(L); });

      for (const t of REGULATOR_TOKENS) if (t.re.test(text)) regsFound.add(t.label);
      if (!openAccount) openAccount = detectOpenAccount($, u);
    } catch {/* ignore */}
  }

  // 6) entiteti + PDF klasifikacija
  const allText = texts.join('\n');
  const entities = extractEntitiesFromText(allText, pages[0] || '', homepage);
  const uniqLinks = uniq(links);
  const pdfPick = classifyPdfLinks(uniqLinks);

  const pickFirst = (needle) => {
    const n = needle.toLowerCase();
    for (const h of uniqLinks) if (h.toLowerCase().includes(n)) return h;
    return '';
  };

  const terms = pdfPick.terms || pickFirst('terms') || pickFirst('conditions') || pickFirst('privacy');
  const risk  = pdfPick.risk  || pickFirst('risk')  || pickFirst('disclosure');
  const agree = pdfPick.agreement || pickFirst('agreement') || pickFirst('client');

  const normalized = {
    description: regsFound.size
      ? `Detected regulators: ${Array.from(regsFound).join(', ')}.`
      : 'Regulatory information found on legal/risk pages.',
    is_regulated: Array.from(regsFound).join(', '),
    safety_highlights: regsFound.size ? ['Regulatory authorizations detected.'] : [],
    safety_caveats: (!terms && !risk ? ['Key legal/risk links not clearly detected.'] : []),
    legal_entities: entities,
    terms_url: terms || '',
    risk_disclosure_url: risk || '',
    client_agreement_url: agree || '',
    open_account_url: openAccount || '',
    warnings: [],
    triedPaths: uniq(triedPaths),
    hints,
    sources: uniq(sources)
  };

  return normalized;
}
