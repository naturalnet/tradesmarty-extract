// packages/sections/safety/generic-deep.js
// Generic deep Safety extractor: BFS crawl + regulator/entity detection

import { fetchText, loadCheerio, fetchBuffer } from '../../core/http.js';

// -----------------------------------------------------------------------------
// 1) Regulator directory (expanded)
// -----------------------------------------------------------------------------

/**
 * REGULATORS: bogat skup skraćenica + naziv/aliasa.
 * - abbr: prikazna skraćenica
 * - names: niz mogućih formi u tekstu (lowercased će se porediti)
 *
 * Ako želiš dodati još, samo ubaci novi objekat.
 */
const REGULATORS = [
  // UK
  { abbr: 'FCA',  names: ['financial conduct authority', 'uk fca', 'fca uk'] },
  { abbr: 'PRA',  names: ['prudential regulation authority'] },

  // EU/EEA — “big 5”
  { abbr: 'BaFin', names: ['bafin', 'federal financial supervisory authority'] }, // DE
  { abbr: 'AMF',   names: ['autorité des marchés financiers', 'amf france'] },    // FR
  { abbr: 'ACPR',  names: ['autorité de contrôle prudentiel et de résolution'] }, // FR prudential
  { abbr: 'CONSOB',names: ['commissione nazionale per le società e la borsa'] },  // IT
  { abbr: 'CNMV',  names: ['comisión nacional del mercado de valores'] },         // ES
  { abbr: 'AFM',   names: ['autoriteit financiële markten', 'netherlands authority for the financial markets'] }, // NL
  { abbr: 'FSMA',  names: ['financial services and markets authority', 'fsma belgium'] }, // BE
  { abbr: 'CSSF',  names: ['commission de surveillance du secteur financier'] },   // LU
  { abbr: 'MFSA',  names: ['malta financial services authority'] },               // MT
  { abbr: 'CySEC', names: ['cyprus securities and exchange commission', 'cy sec', 'cyprus sec'] }, // CY
  { abbr: 'CBI',   names: ['central bank of ireland'] },                          // IE
  { abbr: 'CMVM',  names: ['comissão do mercado de valores mobiliários'] },       // PT
  { abbr: 'HCMC',  names: ['hellenic capital market commission'] },               // GR
  { abbr: 'CNB',   names: ['czech national bank', 'czech national bank (cnb)'] }, // CZ
  { abbr: 'KNF',   names: ['polish financial supervision authority', 'komisja nadzoru finansowego'] }, // PL
  { abbr: 'FMA-AT',names: ['austrian financial market authority', 'fma austria'] }, // AT
  { abbr: 'FIN-FSA', names: ['financial supervisory authority finland', 'finanssivalvonta'] }, // FI
  { abbr: 'FI',    names: ['finansinspektionen', 'swedish financial supervisory authority'] }, // SE
  { abbr: 'DFSA-NO', names: ['finanstilsynet norway', 'norwegian financial supervisory authority'] }, // NO
  { abbr: 'DFSA-DK', names: ['finanstilsynet denmark', 'danish financial supervisory authority'] }, // DK
  { abbr: 'FSA-IS', names: ['financial supervisory authority of iceland', 'fme iceland'] }, // IS
  { abbr: 'HANFA', names: ['croatian financial services supervisory agency'] },   // HR
  { abbr: 'MNB',   names: ['magyar nemzeti bank'] },                              // HU
  { abbr: 'ASF-RO',names: ['autoritatea de supraveghere financiară', 'asf romania'] }, // RO
  { abbr: 'BUL-FSC', names: ['financial supervision commission bulgaria'] },      // BG
  { abbr: 'ATVP',  names: ['slovenian securities market agency', 'atvp slovenia'] }, // SI
  { abbr: 'LB',    names: ['bank of lithuania'] },                                // LT
  { abbr: 'FKTK',  names: ['financial and capital market commission latvia', 'fktk latvia'] }, // LV
  { abbr: 'EFSA',  names: ['estonian financial supervisory authority', 'finantsinspektsioon'] }, // EE
  { abbr: 'FINMA', names: ['swiss financial market supervisory authority'] },     // CH
  { abbr: 'FMA-FL',names: ['financial market authority liechtenstein'] },         // LI

  // Middle East
  { abbr: 'DFSA',  names: ['dubai financial services authority'] },               // DIFC
  { abbr: 'FSRA',  names: ['financial services regulatory authority', 'abu dhabi global market', 'adgm'] }, // ADGM
  { abbr: 'SCA-UAE', names: ['securities and commodities authority', 'united arab emirates securities and commodities authority'] }, // UAE onshore
  { abbr: 'CMA-KW', names: ['capital markets authority kuwait'] },
  { abbr: 'CMA-SA', names: ['capital market authority saudi arabia'] },
  { abbr: 'CBB',   names: ['central bank of bahrain'] },
  { abbr: 'QFCRA', names: ['qatar financial centre regulatory authority'] },
  { abbr: 'CMA-OM', names: ['capital market authority oman'] },
  { abbr: 'ISA',   names: ['israel securities authority'] },
  { abbr: 'EFSA-EG', names: ['financial regulatory authority egypt'] },

  // Africa
  { abbr: 'FSCA',  names: ['financial sector conduct authority'] },               // ZA
  { abbr: 'CMA-KE',names: ['capital markets authority kenya'] },                  // KE
  { abbr: 'SEC-NG',names: ['securities and exchange commission nigeria'] },
  { abbr: 'NAMFISA', names: ['namibia financial institutions supervisory authority'] },
  { abbr: 'CMA-MA', names: ['autorité marocaine du marché des capitaux','ammmc morocco','amc morocco','ammmc'] },
  { abbr: 'BOURSA', names: ['bourse des valeurs mobilières de tunis'] }, // placeholder
  { abbr: 'CMA-RW', names: ['capital markets authority rwanda'] },
  { abbr: 'CMSA-TZ',names: ['capital markets and securities authority tanzania'] },
  { abbr: 'SEC-GH',names: ['securities and exchange commission ghana'] },
  { abbr: 'FSC-MU',names: ['financial services commission mauritius'] },
  { abbr: 'FSA-SC',names: ['financial services authority seychelles'] },

  // APAC
  { abbr: 'ASIC',  names: ['australian securities & investments commission','australian securities and investments commission'] },
  { abbr: 'NZ-FMA',names: ['financial markets authority new zealand','fma new zealand'] },
  { abbr: 'SFC',   names: ['securities and futures commission hong kong'] },
  { abbr: 'MAS',   names: ['monetary authority of singapore'] },
  { abbr: 'JFSA',  names: ['financial services agency japan','jfsa japan'] },
  { abbr: 'SEBI',  names: ['securities and exchange board of india'] },
  { abbr: 'OJK',   names: ['otoritas jasa keuangan','financial services authority indonesia'] },
  { abbr: 'SC-MY', names: ['securities commission malaysia'] },
  { abbr: 'LFSA',  names: ['labuan financial services authority','labuan fsa'] },
  { abbr: 'FSC-TW',names: ['financial supervisory commission taiwan'] },
  { abbr: 'SEC-PH',names: ['securities and exchange commission philippines'] },
  { abbr: 'BSP',   names: ['bangko sentral ng pilipinas'] },
  { abbr: 'SEC-TH',names: ['securities and exchange commission thailand','sec thailand'] },
  { abbr: 'SSC-VN',names: ['state securities commission of vietnam'] },
  { abbr: 'SC-CN', names: ['china securities regulatory commission','csrc'] },

  // Americas — US/Canada
  { abbr: 'SEC',   names: ['securities and exchange commission'] },
  { abbr: 'CFTC',  names: ['commodity futures trading commission'] },
  { abbr: 'NFA',   names: ['national futures association'] },
  { abbr: 'FINRA', names: ['financial industry regulatory authority'] },
  { abbr: 'SIPC',  names: ['securities investor protection corporation'] },
  { abbr: 'FDIC',  names: ['federal deposit insurance corporation'] },
  { abbr: 'OCC',   names: ['office of the comptroller of the currency'] },

  { abbr: 'CIRO',  names: ['canadian investment regulatory organization','iiroc','mfda'] }, // Canada (IIROC+MFDA merger)
  { abbr: 'FINTRAC', names: ['financial transactions and reports analysis centre of canada'] },
  { abbr: 'OSC',   names: ['ontario securities commission'] },
  { abbr: 'AMF-QC',names: ['autorité des marchés financiers quebec'] },
  { abbr: 'BCSC',  names: ['british columbia securities commission'] },
  { abbr: 'ASC-AB',names: ['alberta securities commission'] },

  // Americas — LatAm/Caribbean
  { abbr: 'CVM-BR', names: ['comissão de valores mobiliários brazil','cvm brazil'] },
  { abbr: 'CNBV-MX',names: ['comisión nacional bancaria y de valores mexico'] },
  { abbr: 'CMF-CL', names: ['comisión para el mercado financiero chile'] },
  { abbr: 'SMV-PE', names: ['superintendencia del mercado de valores peru'] },
  { abbr: 'SFC-CO', names: ['superintendencia financiera de colombia'] },
  { abbr: 'SMV-PA', names: ['superintendencia del mercado de valores panama'] },
  { abbr: 'SVGFSA', names: ['financial services authority st. vincent and the grenadines','svg fsa','fsa svg'] },
  { abbr: 'IFSC-BZ', names: ['international financial services commission belize','belize ifsc'] },
  { abbr: 'CIMA',  names: ['cayman islands monetary authority'] },
  { abbr: 'BMA',   names: ['bermuda monetary authority'] },
  { abbr: 'BVI-FSC', names: ['financial services commission british virgin islands','bvi fsc'] },
  { abbr: 'SCB',   names: ['securities commission of the bahamas','scb bahamas'] },
  { abbr: 'CBCS',  names: ['central bank of curaçao and sint maarten','cbcs'] },
  { abbr: 'FSC-BB', names: ['financial services commission barbados'] },
  { abbr: 'FSRA-AI', names: ['anguilla financial services regulatory authority'] },

  // Popular ROW / offshore misc.
  { abbr: 'FSA',   names: ['financial services authority','seychelles financial services authority','fsa seychelles'] },
  { abbr: 'VFSC',  names: ['vanuatu financial services commission'] },
  { abbr: 'FSC-M', names: ['mauritius financial services commission','fsc mauritius'] },
  { abbr: 'LFSA',  names: ['labuan fsa','labuan financial services authority'] },
];

/** Build lookup maps */
function buildRegIndex(list) {
  const byAbbr = new Map();
  const byKey  = new Map();

  for (const r of list) {
    byAbbr.set(r.abbr.toUpperCase(), r);
    byKey.set(normKey(r.abbr), r);
    for (const n of r.names || []) {
      byKey.set(normKey(n), r);
    }
  }
  return { byAbbr, byKey };
}

const REG_INDEX = buildRegIndex(REGULATORS);

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Resolve abbr or long name to abbr (uppercase), else '' */
function resolveAbbr(str = '') {
  if (!str) return '';
  const raw = String(str).trim();
  const A = raw.toUpperCase();
  if (REG_INDEX.byAbbr.has(A)) return A;
  const hit = REG_INDEX.byKey.get(normKey(raw));
  return hit ? hit.abbr.toUpperCase() : '';
}

// tier guess (opšta heuristika)
function tierFor(abbr = '') {
  const A = abbr.toUpperCase();
  if (['FCA','PRA','BaFin','AMF','ACPR','CONSOB','CNMV','AFM','FSMA','CSSF','MFSA','FINMA','ASIC','NZ-FMA','SFC','MAS','SEC','CFTC','NFA','FINRA','SIPC','CIRO','OSC','AMF-QC','BCSC','ASC-AB'].includes(A)) return 'Tier-1';
  if (['CySEC','CBI','CMVM','HCMC','CNB','KNF','FMA-AT','FIN-FSA','FI','DFSA-NO','DFSA-DK','FSA-IS','HANFA','MNB','ASF-RO','BUL-FSC','ATVP','LB','FKTK','EFSA','DFSA','FSRA','SCA-UAE','FSCA','CMA-KE','ISA','CBB','QFCRA','CMA-OM','CMA-SA','SCB','CIMA','BMA','BVI-FSC','IFSC-BZ','FSC-MU','FSA-SC'].includes(A)) return 'Tier-2';
  return 'Tier-3';
}

function serveScopeFor(abbr = '') {
  const A = abbr.toUpperCase();
  if (A === 'FCA' || A === 'PRA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['GB'], region_tokens:['uk'] };
  if (A === 'ASIC') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['AU'], region_tokens:['au'] };
  if (A === 'CySEC') return { serves_scope:'EEA', serve_country_codes:[], region_tokens:['eu'] };
  if (A === 'CBI') return { serves_scope:'EEA', serve_country_codes:[], region_tokens:['eu'] };
  if (A === 'NZ-FMA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['NZ'], region_tokens:['nz'] };
  if (A === 'SFC') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['HK'], region_tokens:['hk'] };
  if (A === 'MAS') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['SG'], region_tokens:['sg'] };
  if (A === 'FINMA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['CH'], region_tokens:['ch'] };
  if (A === 'DFSA' || A === 'FSRA' || A === 'SCA-UAE') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['AE'], region_tokens:['ae'] };
  if (A === 'FSCA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['ZA'], region_tokens:['za'] };
  if (A === 'CMA-KE') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['KE'], region_tokens:['ke'] };
  if (['SEC','CFTC','NFA','FINRA','SIPC','FDIC','OCC'].includes(A)) return { serves_scope:'COUNTRY_LIST', serve_country_codes:['US'], region_tokens:['us'] };
  if (['CIRO','OSC','AMF-QC','BCSC','ASC-AB','FINTRAC'].includes(A)) return { serves_scope:'COUNTRY_LIST', serve_country_codes:['CA'], region_tokens:['ca'] };
  // default
  return { serves_scope:'GLOBAL', serve_country_codes:[], region_tokens:['row'] };
}

// -----------------------------------------------------------------------------
// 2) Crawl (BFS prioritizovan legal/terms/risk linkovima)
// -----------------------------------------------------------------------------

const PATH_HINTS = [
  'regulation','regulations','regulatory','license','licence','licensing',
  'legal','legal-documents','documents','disclosure','risk','risk-disclosure',
  'policies','policy','compliance','terms','terms-and-conditions','client-agreement',
  'about','about-us','imprint','privacy','security','safety'
];

const LINK_SCORE_RULES = [
  { rx: /(regulation|regulatory|license|licen[cs]e|legal|disclosure|risk)/i, w: 6 },
  { rx: /(terms|conditions|client( services)? agreement)/i,                    w: 4 },
  { rx: /(policy|policies|compliance|governance)/i,                           w: 3 },
  { rx: /(security|safety|privacy)/i,                                         w: 2 }
];

function normText(t){ return (t||'').replace(/\s+/g,' ').trim(); }
function sameHost(a,b){ try{ return new URL(a).host===new URL(b).host; } catch { return false; } }
function absolutize(href, base){ try{ return new URL(href, base).toString(); } catch { return href||''; } }

function scoreUrl(url, anchorText='') {
  let s = 0;
  for (const r of LINK_SCORE_RULES) if (r.rx.test(url) || r.rx.test(anchorText)) s += r.w;
  for (const p of PATH_HINTS) if (url.toLowerCase().includes('/'+p)) s += 1;
  return s;
}

async function crawl({ homepage, seeds=[], maxPages=30, maxDepth=2, timeoutMs=25000, allowPdf=true }) {
  const start = homepage.replace(/\/+$/,'');
  const queue = [];
  const seen  = new Set();
  const pages = [];
  const tried = [];

  function push(u, depth, fromText='') {
    if (!u) return;
    const url = absolutize(u, start).replace(/#.*$/,'');
    if (!sameHost(url, start)) return;
    if (seen.has(url)) return;
    seen.add(url);
    queue.push({ url, depth, score: scoreUrl(url, fromText) });
  }

  push(start, 0, 'home');
  for (const s of seeds) push(s, 0, 'seed');

  while (queue.length && pages.length < maxPages) {
    queue.sort((a,b)=>b.score-a.score);
    const { url, depth } = queue.shift();
    tried.push(url);

    try {
      if (allowPdf && /\.pdf($|\?)/i.test(url)) {
        const buf = await fetchBuffer(url, { timeout: timeoutMs });
        // PDF: samo memorisaćemo URL kao source; ne pokušavamo OCR ovde
        pages.push({ url, text: '' });
        continue;
      }

      const html = await fetchText(url, { timeout: timeoutMs });
      if (!html || html.length < 200) continue;

      const $ = await loadCheerio(html);
      const body = $('body');
      const text = normText(body.text());
      pages.push({ url, text });

      if (depth < maxDepth) {
        $('a[href]').each((_, a)=>{
          const href = $(a).attr('href');
          const t    = normText($(a).text());
          push(href, depth+1, t);
        });
      }
    } catch {
      // ignore fetch errors
    }
  }

  return { pages, tried };
}

// -----------------------------------------------------------------------------
// 3) Extraction: regulatori + entiteti + linkovi
// -----------------------------------------------------------------------------

const NAME_END = /(Ltd|Limited|LLC|LLP|PLC|Pty(?:\sLtd)?|GmbH|AG|SA|S\.A\.|Pte(?:\.|\s)Ltd|Inc\.?)/i;
const ENTITY_NEAR_TOKENS = /(authori[sz]ed|licensed|regulated|supervised|governed)/i;

function extractEntities(text, pageUrl) {
  const out = [];
  const T = text || '';

  // Pattern A: "<Entity> Ltd ... authorised/regulated by <Regulator>"
  const rx1 = new RegExp(
    `([A-Z][A-Za-z0-9&'().\\- ]+?\\s${NAME_END.source}).{0,160}?${ENTITY_NEAR_TOKENS.source}.{0,80}?\\b([A-Za-z&()' .-]{3,80})\\b`,
    'gi'
  );
  let m;
  while ((m = rx1.exec(T)) !== null) {
    const entity = normText(m[1]);
    const regRaw = normText(m[2]);
    const abbr   = resolveAbbr(regRaw);
    if (!entity || !abbr) continue;

    const scope  = serveScopeFor(abbr);
    const investor =
      (abbr==='FCA')  ? 'FSCS (eligibility dependent)' :
      (abbr==='CySEC')? 'ICF (eligibility dependent)'  :
      (abbr==='SIPC') ? 'SIPC (brokerage accounts)'     : 'N/A';
    const nbp =
      (['FCA','CySEC','ASIC','NZ-FMA','SFC','MAS'].includes(abbr)) ? 'Yes (retail; CFD rules/policy)' : 'Policy-based or N/A';

    out.push({
      entity_name: entity,
      country_of_clients: scope.serve_country_codes?.[0] || '',
      regulator_abbreviation: abbr,
      regulator: '',
      regulation_level: tierFor(abbr),
      investor_protection_amount: investor,
      negative_balance_protection: nbp,
      entity_service_url: pageUrl || '',
      ...scope,
      terms_url: '', risk_disclosure_url: '', client_agreement_url: '', open_account_url: '',
      sources: [pageUrl]
    });
  }

  // Pattern B: "<Regulator> ... <Entity> Ltd"
  const rx2 = new RegExp(
    `\\b([A-Za-z&()' .-]{3,80})\\b.{0,120}?${ENTITY_NEAR_TOKENS.source}.{0,160}?([A-Z][A-Za-z0-9&'().\\- ]+?\\s${NAME_END.source})`,
    'gi'
  );
  while ((m = rx2.exec(T)) !== null) {
    const regRaw = normText(m[1]);
    const entity = normText(m[2]);
    const abbr   = resolveAbbr(regRaw);
    if (!entity || !abbr) continue;

    const scope  = serveScopeFor(abbr);
    out.push({
      entity_name: entity,
      country_of_clients: scope.serve_country_codes?.[0] || '',
      regulator_abbreviation: abbr,
      regulator: '',
      regulation_level: tierFor(abbr),
      investor_protection_amount: 'N/A',
      negative_balance_protection: (['FCA','CySEC','ASIC','NZ-FMA','SFC','MAS'].includes(abbr)) ? 'Yes (retail; policy)' : 'Policy-based or N/A',
      entity_service_url: pageUrl || '',
      ...scope,
      terms_url: '', risk_disclosure_url: '', client_agreement_url: '', open_account_url: '',
      sources: [pageUrl]
    });
  }

  return out;
}

function collectDocLinks(text, url) {
  const lower = (text || '').toLowerCase();
  const hits = {};
  function set(k,v){ if (v && !hits[k]) hits[k]=v; }

  // heuristika: ako url sadrži match u path-u, koristi ga
  if (/terms|conditions|client/i.test(url)) set('client_agreement_url', url);
  if (/risk/i.test(url))                    set('risk_disclosure_url', url);
  if (/terms/i.test(url))                   set('terms_url', url);
  if (/open-?account|start-?trading|signup|register/i.test(url)) set('open_account_url', url);

  // text-based fallback hintovi
  if (lower.includes('risk disclosure')) set('risk_disclosure_url', url);
  if (lower.includes('terms'))           set('terms_url', url);
  if (lower.includes('client agreement') || lower.includes('client services agreement')) set('client_agreement_url', url);

  return hits;
}

function foldLinks(pages) {
  const bag = {};
  for (const p of pages) {
    const hit = collectDocLinks(p.text, p.url);
    for (const k of Object.keys(hit)) if (!bag[k]) bag[k]=hit[k];
  }
  return bag;
}

// -----------------------------------------------------------------------------
// 4) Public API
// -----------------------------------------------------------------------------

export async function extractDeepSafety(opts) {
  const {
    homepage,
    seeds = [],
    maxPages = 30,
    maxDepth = 2,
    timeoutMs = 25000,
    allowPdf = true
  } = opts || {};

  if (!homepage) {
    return {
      description: 'No homepage provided — cannot crawl legal/regulatory pages.',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['Homepage URL is missing.'],
      legal_entities: [],
      triedPaths: [],
      sources: [],
      hints: []
    };
  }

  const { pages, tried } = await crawl({ homepage, seeds, maxPages, maxDepth, timeoutMs, allowPdf });

  // extract
  const entities = [];
  const sources  = new Set();
  for (const p of pages) {
    if (!p) continue;
    const es = extractEntities(p.text, p.url);
    if (es.length) {
      for (const e of es) {
        entities.push(e);
        if (e.sources) e.sources.forEach(s => sources.add(s));
      }
    }
  }

  // unique entities by name + abbr
  const uniqKey = e => `${e.entity_name}__${e.regulator_abbreviation}`;
  const uniqMap = new Map();
  for (const e of entities) if (!uniqMap.has(uniqKey(e))) uniqMap.set(uniqKey(e), e);
  const legal_entities = Array.from(uniqMap.values());

  // docs/links
  const links = foldLinks(pages);
  const abbrs = Array.from(new Set(legal_entities.map(e => e.regulator_abbreviation).filter(Boolean)));

  // description & highlights/caveats
  let description = '';
  let highlights = [];
  let caveats = [];

  if (abbrs.length) {
    description = `Detected regulators: ${abbrs.join(', ')}.`;
    highlights.push('Regulatory authorizations detected.');
    if (['SVGFSA','IFSC-BZ','BVI-FSC','FSC-M','FSA','SCB','CIMA','BMA','VFSC','LFSA','FSA-SC'].some(a => abbrs.includes(a))) {
      caveats.push('Some offshore authorizations provide limited investor protections.');
    }
  } else {
    caveats.push('No clear regulator mentions found on crawled pages.');
  }

  const normalized = {
    description,
    is_regulated: abbrs.join(', '),
    safety_highlights: highlights,
    safety_caveats: caveats,
    legal_entities,
    terms_url: links.terms_url || '',
    risk_disclosure_url: links.risk_disclosure_url || '',
    client_agreement_url: links.client_agreement_url || '',
    open_account_url: links.open_account_url || '',
    warnings: [],
    triedPaths: tried,
    sources: Array.from(sources),
    hints: []
  };

  return normalized;
}

// CommonJS compat
try { module.exports = { extractDeepSafety }; } catch {}
