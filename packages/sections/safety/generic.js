// packages/sections/safety/generic.js
import { fetchOK, loadCheerio, toAbs } from '../../core/http.js';
import { autoSeedsFromSitemaps, mergeAbs } from '../../core/sitemap.js';
import { crawlDomainSeeds } from '../../core/crawl.js';

const CANDIDATE_PATHS = [
  '/regulation','/regulations','/regulatory','/legal','/legal-documents',
  '/documents','/policies','/compliance','/risk','/risk-disclosure',
  '/about/regulation','/about-us/regulation','/education/faq/regulation'
];

const REGULATOR_TOKENS = [
  { re: /\bFCA\b/i,   label: 'FCA'  },
  { re: /\bCySEC\b/i, label: 'CySEC'},
  { re: /\bASIC\b/i,  label: 'ASIC' },
  { re: /\bFSCA\b/i,  label: 'FSCA' },
  { re: /\bJSC\b/i,   label: 'JSC'  },
  { re: /\bCMA\b/i,   label: 'CMA'  },
  { re: /\bFSA\b/i,   label: 'FSA'  }
];

// višejezični tokeni za filter linkova (header/footer/nav)
const LEGAL_TOKENS = [
  'legal','regulation','regulatory','documents','policies','policy','risk','disclosure',
  'terms','conditions','agreement','client','juridique','condizioni','condiciones',
  'politica','política','regulament','regulación','регулирован', 'правила', 'условия'
].map(x => new RegExp(x, 'i'));

const KEYWORD_PATTERNS = [
  /risk|disclosure|terms|agreement|documents|policy|client|legal/i,
  /regulation|regulatory|cysec|fca|fsa|fsca|asic|jsc|cma/i
];

function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }

async function tryLoad(url) { return !!(await fetchOK(url)); }

function detectOpenAccount($, baseUrl) {
  const candidates = [];
  $('a[href]').each((_i,a)=>{
    const $a = $(a);
    const label = ($a.text() || '').toLowerCase();
    const href  = String($a.attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (/(open (live )?account|join now|start trading|get started|open account|create account)/i.test(label)) {
      candidates.push(toAbs(baseUrl, href));
    }
  });
  return candidates[0] || '';
}

function pickFirst(links, needle) {
  const low = needle.toLowerCase();
  for (const h of links) if (h.toLowerCase().includes(low)) return h;
  return '';
}

function extractEntitiesFromText(allText, pageUrl, homepage) {
  const ents = [];

  // SEYCHELLES
  const sey = /Seychelles|FSA/i.test(allText);
  const fsaRef = (allText.match(/(?:Licence|License)\s*(?:No\.?|Number)?\s*(SD\d{2,3})/i)?.[1])
              || (allText.match(/\bSD\d{2,3}\b/)?.[0]);
  if (sey && fsaRef) {
    ents.push({
      entity_name: /Traders\s+Trust/i.test(allText) ? 'Traders Trust Ltd' : 'Traders Trust (Seychelles)',
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

  // CYPRUS / CySEC 107/09
  const cyMatch = allText.match(/CySEC[^.\n]*(?:licen[cs]e\s*(?:no\.?|number)?\s*)?(\d{2,3}\/\d{2})/i);
  const hasTTCM = /TTCM\s+Traders\s+Trust\s+Capital\s+Markets\s+Limite?d/i.test(allText);
  if (cyMatch || hasTTCM || /Cyprus Investment Firm|MiFID/i.test(allText)) {
    ents.push({
      entity_name: hasTTCM ? 'TTCM Traders Trust Capital Markets Ltd' : 'Traders Trust (Cyprus)',
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
      regulator_reference: cyMatch?.[1] ? `License ${cyMatch[1]}` : 'License 107/09'
    });
  }

  return ents;
}

function extractHeaderFooterLinks($, baseUrl) {
  const buckets = new Set();
  const areas = ['header','footer','nav'];
  areas.forEach(sel => {
    $(sel).find('a[href]').each((_i,a)=>{
      const href = String($(a).attr('href') || '');
      const txt  = String($(a).text() || '');
      const pair = (txt + ' ' + href);
      if (LEGAL_TOKENS.some(re => re.test(pair))) {
        buckets.add(toAbs(baseUrl, href));
      }
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

export async function extractGenericSafety({ homepage, seeds = [] }) {
  const triedPaths = [];
  const sources = [];
  const hints = [];

  const origin = (() => { try { return new URL(homepage).origin; } catch { return ''; } })();
  if (!origin) return { ok:false, error:'not_supported', reason:'bad_homepage' };

  // 0) homepage (za CTA + nav linkove)
  let openAccount = '';
  let homepageText = '';
  let headerFooterLinks = [];
  let hreflangHomes = [];

  triedPaths.push(homepage);
  try {
    const $home = await loadCheerio(homepage);
    sources.push(homepage);
    homepageText = $('body').text() || '';
    openAccount = detectOpenAccount($home, homepage);
    headerFooterLinks = extractHeaderFooterLinks($home, homepage);
    hreflangHomes = extractHreflangs($home, homepage).filter(u => new URL(u).origin === origin);
  } catch {
    // homepage može da padne, idemo dalje
  }

  // 1) robots/sitemaps auto-seeds
  const sitemapFilters = [
    /regulat/i, /legal/i, /document/i, /policy/i,
    /risk/i, /disclosure/i, /terms/i, /agreement/i, /client/i
  ];
  let sitemapSeeds = [];
  try {
    sitemapSeeds = await autoSeedsFromSitemaps(origin, sitemapFilters, 24);
  } catch {}

  // 2) kandidat putanje (well-known)
  const knownCandidates = CANDIDATE_PATHS.map(p => new URL(p, origin).toString());

  // 3) hreflang homepage varijante → izvuci i sa njih nav-linkove
  let hreflangNav = [];
  for (const hp of hreflangHomes.slice(0, 3)) {
    triedPaths.push(hp);
    try {
      const $h = await loadCheerio(hp);
      hreflangNav = hreflangNav.concat(extractHeaderFooterLinks($h, hp));
    } catch {}
  }

  // 4) plitki domain crawl (BFS ≤30 str) od homepage + nav-linkova
  const crawlSeeds = uniq([homepage, ...headerFooterLinks]).slice(0, 8);
  let crawled = [];
  try {
    crawled = await crawlDomainSeeds({
      origin,
      startUrls: crawlSeeds,
      keywordPatterns: KEYWORD_PATTERNS,
      maxPages: 30
    });
  } catch {}

  // 5) finalni skup stranica koje ćemo parsirati
  const candidatePages = uniq([
    ...seeds.map(s => toAbs(origin, s)),
    ...sitemapSeeds,
    ...headerFooterLinks,
    ...hreflangNav,
    ...knownCandidates,
    ...crawled
  ]);

  // validacija dostupnosti i skupljanje
  const pages = [];
  for (const u of candidatePages) {
    triedPaths.push(u);
    if (await tryLoad(u)) {
      pages.push(u);
      sources.push(u);
    }
    if (pages.length >= 10) break; // plafon
  }

  if (!pages.length && !homepageText) {
    return { ok:false, error:'not_supported', reason:'no_documents', triedPaths, hints:['Site has no detectable legal/risk pages. Consider adding seeds.'] };
  }

  // 6) parsiranje stranica
  const links = [];
  const regsFound = new Set();
  const texts = [homepageText].filter(Boolean);

  for (const u of pages) {
    try {
      const $ = await loadCheerio(u);
      const text = $('body').text() || '';
      texts.push(text);

      $('a[href]').each((_i, a) => {
        const href = String($(a).attr('href') || '');
        const label = String($(a).text() || '');
        const combo = (label + ' ' + href).toLowerCase();
        if (/(risk|disclosure|terms|agreement|documents|policy|client|legal)/i.test(combo)) {
          links.push(toAbs(u, href));
        }
      });

      for (const t of REGULATOR_TOKENS) if (t.re.test(text)) regsFound.add(t.label);

      if (!openAccount) openAccount = detectOpenAccount($, u);
    } catch {/* ignore */}
  }

  // 7) entiteti iz teksta
  const allText = texts.join('\n');
  const entities = extractEntitiesFromText(allText, pages[0] || '', homepage);

  // 8) link picks
  const uniqLinks = uniq(links);
  const terms = pickFirst(uniqLinks, 'terms');
  const risk  = pickFirst(uniqLinks, 'risk');
  const agree = pickFirst(uniqLinks, 'agreement') || pickFirst(uniqLinks, 'client');

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
