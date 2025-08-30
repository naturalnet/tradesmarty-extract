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
  { re: /\bFSA\b/i,   label: 'FSA'  },
  { re: /\bSFC\b/i,   label: 'SFC'  }, // Hong Kong
  { re: /Securities\s+and\s+Futures\s+Commission/i, label: 'SFC' }
];

// višejezični tokeni (EN + ex-YU + ZH)
const LEGAL_TOKENS = [
  // EN/common
  'legal','legal-information','regulation','regulatory','documents','document','docs',
  'policies','policy','risk','disclosure','terms','conditions','agreement','client',
  'complaint','complaints','privacy','cookie','cookies','kyc','aml','download','downloads','forms','resources','support',
  // ex-YU
  'pravni','pravne','pravno','regulaci','uslovi','uvjeti','odredbe','sporazum','klijent',
  'rizik','politika','privatnost','kolačić','kolacic',
  // ZH (繁/简)
  '法律','法規','法规','條款','条款','細則','细则','協議','协议','客戶協議','客户协议','風險','风险','披露',
  '私隱','私隐','隱私','隐私','免責','免责声明','下載','下载','表格'
].map(x => new RegExp(x, 'i'));

const KEYWORD_PATTERNS = [
  /risk|disclosure|terms|conditions|agreement|client|legal|privacy|cookie|complaints|kyc|aml|download|form|docs?/i,
  /regulation|regulatory|cysec|fca|fsa|fsca|asic|jsc|cma|sfc/i
];

function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }
async function tryLoad(url, acceptLanguage) { return !!(await fetchOK(url, { acceptLanguage })); }

function detectOpenAccount($, baseUrl) {
  const candidates = [];
  $('a[href]').each((_i,a)=>{
    const $a = $(a);
    const label = ($a.text() || '').toLowerCase();
    const href  = String($a.attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (/(open (live )?account|join now|start trading|get started|open account|create account|register|signup|sign up|live account|apply now|start now)/i.test(label)) {
      candidates.push(toAbs(baseUrl, href));
    }
    // kineski: 開戶/开户/註冊/注册
    if (/(開戶|开户|開設帳戶|开设账户|立即開戶|立即开户|註冊|注册)/.test(label)) {
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

function extractJsonLinks($, baseUrl) {
  const found = new Set();
  const rxUrl = /(https?:\/\/[^\s"']+|\b\/[A-Za-z0-9_\-./%?=&]+)(?=["'\s}])/g;
  $('script').each((_i, s) => {
    const txt = $(s).html() || '';
    if (!/__NEXT_DATA__|__NUXT__|INITIAL_STATE|Nuxt|next|hydrate|pageProps|payload/i.test(txt)) return;
    let m; let guard = 0;
    while ((m = rxUrl.exec(txt)) && guard < 2000) {
      guard++;
      const abs = toAbs(baseUrl, m[1]);
      if (sameSite(abs, baseUrl)) found.add(abs);
    }
  });
  return Array.from(found);
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
  ['en','cy-en','au-en','bs-en','eu-en','int-en','global-en','sg-en','uk-en','za-en','zh-hk','zh-cn'].forEach(push);

  return Array.from(prefixes);
}

function buildLocalizedCandidates(origin, prefixes) {
  const tails = [
    '/terms','/terms-and-conditions','/legal','/legal-information','/regulation','/regulations','/regulatory',
    '/documents','/document','/docs','/download','/downloads','/forms','/resources','/support',
    '/policies','/policy','/risk','/risk-disclosure','/agreement','/client',
    '/privacy','/privacy-policy','/cookies','/cookie-policy','/complaints','/kyc','/aml'
  ];
  const out = new Set();
  for (const t of tails) out.add(new URL(t, origin).toString());
  for (const pref of prefixes) for (const t of tails)
    out.add(new URL(pref + t.replace(/^\//,''), origin).toString());
  return Array.from(out);
}

// klasifikacija po labeli i/ili URL-u (EN + ZH)
function classifyByLabelOrUrl(items = []) {
  const result = { terms:'', risk:'', agreement:'', privacy:'', disclaimer:'' };
  const mk = (reArr) => (s) => reArr.some(re => re.test(s));

  const RE = {
    risk: mk([/risk/i, /disclos/i, /風險|风险|披露/]),
    agreement: mk([/agreement|client/i, /協議|协议|客戶協議|客户协议/]),
    terms: mk([/terms|conditions|tandc|t&c/i, /條款|条款|細則|细则|服務條款|使用條款/]),
    privacy: mk([/privacy/i, /私隱|私隐|隱私|隐私/]),
    disclaimer: mk([/disclaimer/i, /免責|免责声明/]),
  };

  for (const it of items) {
    const low = (it.label + ' ' + it.url).toLowerCase();
    // redosled: risk → agreement → terms → privacy → disclaimer
    if (!result.risk && RE.risk(low)) result.risk = it.url;
    else if (!result.agreement && RE.agreement(low)) result.agreement = it.url;
    else if (!result.terms && RE.terms(low)) result.terms = it.url;
    else if (!result.privacy && RE.privacy(low)) result.privacy = it.url;
    else if (!result.disclaimer && RE.disclaimer(low)) result.disclaimer = it.url;
  }
  return result;
}

function extractEntitiesFromText(allText, pageUrl, homepage) {
  const ents = [];

  // Seychelles / FSA SDxxx
  const fsaRef = (allText.match(/(?:Licence|License)\s*(?:No\.?|Number)?\s*(SD\d{2,3})/i)?.[1])
              || (allText.match(/\bSD\d{2,3}\b/)?.[0]);
  if (/Seychelles|FSA/i.test(allText) && fsaRef) {
    ents.push({
      entity_name: 'Seychelles Entity',
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
      entity_name: 'Cyprus Entity',
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

  // Hong Kong / SFC (CE No.)
  const sfcHit = /SFC|Securities\s+and\s+Futures\s+Commission|證監會|证监会|香港/i.test(allText);
  const ceNo = (allText.match(/\bCE\s*(?:No\.?|Number)?\s*[:：]?\s*([A-Z0-9]{5,8})/i)?.[1]) || '';
  if (sfcHit) {
    ents.push({
      entity_name: 'Hong Kong Entity',
      country_of_clients: 'Hong Kong',
      regulator_abbreviation: 'SFC',
      regulator: 'Securities and Futures Commission (Hong Kong)',
      regulation_level: 'Tier-1',
      investor_protection_amount: 'N/A',
      negative_balance_protection: 'N/A',
      entity_service_url: pageUrl || homepage || '',
      serves_scope: 'COUNTRY_LIST',
      serve_country_codes: ['HK'],
      exclude_country_codes: [],
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: '',
      tsbar_manual_seeds: '',
      region_tokens: ['hk'],
      regulator_reference: ceNo
    });
  }

  // ASIC / AFSL
  const afsl = allText.match(/\bAFSL\s*\d{3,6}\b/i)?.[0];
  if (afsl || /\bASIC\b/i.test(allText)) {
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

  // Accept-Language: dodaj zh-HK
  let acceptLanguage = 'zh-HK;q=0.9, zh;q=0.8, en;q=0.7, *;q=0.5';

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
    // ako path nosi npr /en/ postavi accept
    const pref = (new URL(homepage).pathname.match(/^\/([a-z]{2})(?:-[a-z]{2})?\b/i)?.[1] || '').toLowerCase();
    if (pref) acceptLanguage = `${pref};q=0.9, zh-HK;q=0.85, en;q=0.8, *;q=0.5`;
  } catch { /* ignore */ }

  // 1) robots/sitemaps
  let sitemapSeeds = [];
  try {
    sitemapSeeds = await autoSeedsFromSitemaps(origin, [
      /regulat/i, /legal/i, /document/i, /policy/i,
      /risk/i, /disclosure/i, /terms/i, /agreement/i, /client/i,
      /privacy/i, /cookie/i, /complaints?/i, /kyc/i, /aml/i, /docs?/i, /legal-information/i,
      /download/i, /form/i, /resource/i, /support/i
    ], 64);
  } catch {}

  // 2) locale prefiksi -> kandidati
  const prefixes = discoverLocalePrefixes({
    homepageUrl: homepage, headerFooterLinks, hreflangHomes
  });
  const localizedCandidates = buildLocalizedCandidates(origin, prefixes);

  // 3) crawl od homepage + nav + json linkova
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

  // 4) finalni kandidati
  const candidatePages = uniq([
    ...seeds.map(s => toAbs(origin, s)),
    ...sitemapSeeds,
    ...headerFooterLinks,
    ...hreflangHomes,
    ...localizedCandidates,
    ...jsonLinks,
    ...crawled
  ]).filter(u => sameSite(u, origin));

  // validacija dostupnosti
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

  // 5) parsiranje i sakupljanje linkova + labela
  const labeled = []; // {url, label}
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
        const abs = toAbs(u, href);
        if (!sameSite(abs, origin)) return;

        const pair = (label + ' ' + href);
        if (LEGAL_TOKENS.some(re => re.test(pair)) || /\.pdf(\?|$)/i.test(abs)) {
          labeled.push({ url: abs, label });
        }
      });

      // BONUS: neke download stranice imaju liste bez <a> labela – pokupi i <a> u tablicama/ikonama
      $('[download], .download, .downloads, .doc, .docs').find('a[href]').each((_i, a) => {
        const href = String($(a).attr('href') || '');
        const label = String($(a).text() || 'Download');
        const abs = toAbs(u, href);
        if (sameSite(abs, origin)) labeled.push({ url: abs, label });
      });

      for (const t of REGULATOR_TOKENS) if (t.re.test(text)) regsFound.add(t.label);
      if (!openAccount) openAccount = detectOpenAccount($, u);
    } catch {/* ignore */}
  }

  // 6) entiteti + klasifikacija
  const allText = texts.join('\n');
  const entities = extractEntitiesFromText(allText, pages[0] || '', homepage);

  // deduplikacija po URL-u, zadrži prvu labelu
  const seen = new Set();
  const items = [];
  for (const it of labeled) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    items.push(it);
  }

  const pick = classifyByLabelOrUrl(items);

  // fallback pick po substringu ako treba
  const fallbackPick = (needle) => {
    const n = needle.toLowerCase();
    for (const it of items) if ((it.url + ' ' + it.label).toLowerCase().includes(n)) return it.url;
    return '';
  };

  const terms = pick.terms || fallbackPick('terms') || fallbackPick('條款') || fallbackPick('条款') || pick.privacy || fallbackPick('privacy');
  const risk  = pick.risk  || fallbackPick('risk')  || fallbackPick('風險') || fallbackPick('风险') || fallbackPick('披露');
  const agree = pick.agreement || fallbackPick('agreement') || fallbackPick('協議') || fallbackPick('协议') || fallbackPick('client');

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
    sources: uniq(pages)
  };

  return normalized;
}
