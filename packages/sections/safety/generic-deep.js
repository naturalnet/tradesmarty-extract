// packages/sections/safety/generic-deep.js
// Universal deep Safety extractor: BFS crawl (+ JSON-LD), regulator/entity detection,
// document link discovery, jurisdiction heuristics, and normalized output.

import { fetchText, loadCheerio } from '../../core/http.js';

/* ──────────────────────────────────────────────────────────────────────────
   1) Regulator directory (abbr + aliases) — proširen skup
────────────────────────────────────────────────────────────────────────── */

const REGULATORS = [
  // UK
  { abbr: 'FCA', names: ['financial conduct authority','uk fca','fca uk'] },
  { abbr: 'PRA', names: ['prudential regulation authority'] },

  // Core EU/EEA
  { abbr: 'BaFin',  names: ['bafin','federal financial supervisory authority'] },
  { abbr: 'AMF',    names: ['autorité des marchés financiers','amf france'] },
  { abbr: 'ACPR',   names: ['autorité de contrôle prudentiel et de résolution'] },
  { abbr: 'CONSOB', names: ['commissione nazionale per le società e la borsa'] },
  { abbr: 'CNMV',   names: ['comisión nacional del mercado de valores'] },
  { abbr: 'AFM',    names: ['autoriteit financiële markten','netherlands authority for the financial markets'] },
  { abbr: 'FSMA',   names: ['financial services and markets authority','fsma belgium'] },
  { abbr: 'CSSF',   names: ['commission de surveillance du secteur financier'] },
  { abbr: 'MFSA',   names: ['malta financial services authority'] },
  { abbr: 'CySEC',  names: ['cyprus securities and exchange commission','cy sec','cyprus sec'] },
  { abbr: 'CBI',    names: ['central bank of ireland'] },
  { abbr: 'CMVM',   names: ['comissão do mercado de valores mobiliários'] },
  { abbr: 'HCMC',   names: ['hellenic capital market commission'] },
  { abbr: 'CNB',    names: ['czech national bank'] },
  { abbr: 'KNF',    names: ['polish financial supervision authority','komisja nadzoru finansowego'] },
  { abbr: 'FMA-AT', names: ['austrian financial market authority','fma austria'] },
  { abbr: 'FIN-FSA',names: ['financial supervisory authority finland','finanssivalvonta'] },
  { abbr: 'FI',     names: ['finansinspektionen','swedish financial supervisory authority'] },
  { abbr: 'DFSA-NO',names: ['finanstilsynet norway','norwegian financial supervisory authority'] },
  { abbr: 'DFSA-DK',names: ['finanstilsynet denmark','danish financial supervisory authority'] },
  { abbr: 'FSA-IS', names: ['financial supervisory authority of iceland','fme iceland'] },
  { abbr: 'HANFA',  names: ['croatian financial services supervisory agency'] },
  { abbr: 'MNB',    names: ['magyar nemzeti bank'] },
  { abbr: 'ASF-RO', names: ['autoritatea de supraveghere financiară','asf romania'] },
  { abbr: 'BUL-FSC',names: ['financial supervision commission bulgaria'] },
  { abbr: 'ATVP',   names: ['slovenian securities market agency','atvp slovenia'] },
  { abbr: 'LB',     names: ['bank of lithuania'] },
  { abbr: 'FKTK',   names: ['financial and capital market commission latvia','fktk latvia'] },
  { abbr: 'EFSA',   names: ['estonian financial supervisory authority','finantsinspektsioon'] },
  { abbr: 'FINMA',  names: ['swiss financial market supervisory authority'] },
  { abbr: 'FMA-FL', names: ['financial market authority liechtenstein'] },

  // Middle East
  { abbr: 'DFSA',   names: ['dubai financial services authority'] },
  { abbr: 'FSRA',   names: ['financial services regulatory authority','abu dhabi global market','adgm'] },
  { abbr: 'SCA-UAE',names: ['securities and commodities authority','uae securities and commodities authority'] },
  { abbr: 'CMA-KW', names: ['capital markets authority kuwait'] },
  { abbr: 'CMA-SA', names: ['capital market authority saudi arabia'] },
  { abbr: 'CBB',    names: ['central bank of bahrain'] },
  { abbr: 'QFCRA',  names: ['qatar financial centre regulatory authority'] },
  { abbr: 'CMA-OM', names: ['capital market authority oman'] },
  { abbr: 'ISA',    names: ['israel securities authority'] },
  { abbr: 'EFSA-EG',names: ['financial regulatory authority egypt'] },

  // Africa
  { abbr: 'FSCA',   names: ['financial sector conduct authority'] },
  { abbr: 'CMA-KE', names: ['capital markets authority kenya'] },
  { abbr: 'SEC-NG', names: ['securities and exchange commission nigeria'] },
  { abbr: 'NAMFISA',names: ['namibia financial institutions supervisory authority'] },
  { abbr: 'FSC-MU', names: ['financial services commission mauritius'] },
  { abbr: 'FSA-SC', names: ['financial services authority seychelles','fsa seychelles'] },

  // APAC
  { abbr: 'ASIC',   names: ['australian securities & investments commission','australian securities and investments commission'] },
  { abbr: 'NZ-FMA', names: ['financial markets authority new zealand','fma new zealand'] },
  { abbr: 'SFC',    names: ['securities and futures commission hong kong'] },
  { abbr: 'MAS',    names: ['monetary authority of singapore'] },
  { abbr: 'JFSA',   names: ['financial services agency japan','jfsa japan'] },
  { abbr: 'SEBI',   names: ['securities and exchange board of india'] },
  { abbr: 'OJK',    names: ['otoritas jasa keuangan'] },
  { abbr: 'SC-MY',  names: ['securities commission malaysia'] },
  { abbr: 'LFSA',   names: ['labuan financial services authority','labuan fsa'] },
  { abbr: 'FSC-TW', names: ['financial supervisory commission taiwan'] },
  { abbr: 'SEC-PH', names: ['securities and exchange commission philippines'] },
  { abbr: 'BSP',    names: ['bangko sentral ng pilipinas'] },
  { abbr: 'SEC-TH', names: ['securities and exchange commission thailand'] },
  { abbr: 'SSC-VN', names: ['state securities commission of vietnam'] },

  // Americas — US/CA
  { abbr: 'SEC',    names: ['securities and exchange commission'] },
  { abbr: 'CFTC',   names: ['commodity futures trading commission'] },
  { abbr: 'NFA',    names: ['national futures association'] },
  { abbr: 'FINRA',  names: ['financial industry regulatory authority'] },
  { abbr: 'SIPC',   names: ['securities investor protection corporation'] },
  { abbr: 'FDIC',   names: ['federal deposit insurance corporation'] },
  { abbr: 'OCC',    names: ['office of the comptroller of the currency'] },
  { abbr: 'CIRO',   names: ['canadian investment regulatory organization','iiroc','mfda'] },
  { abbr: 'FINTRAC',names: ['financial transactions and reports analysis centre of canada'] },
  { abbr: 'OSC',    names: ['ontario securities commission'] },
  { abbr: 'AMF-QC', names: ['autorité des marchés financiers quebec'] },
  { abbr: 'BCSC',   names: ['british columbia securities commission'] },
  { abbr: 'ASC-AB', names: ['alberta securities commission'] },

  // LatAm / Caribbean / Offshore
  { abbr: 'CVM-BR', names: ['comissão de valores mobiliários brazil','cvm brazil'] },
  { abbr: 'CNBV-MX',names: ['comisión nacional bancaria y de valores mexico'] },
  { abbr: 'CMF-CL', names: ['comisión para el mercado financiero chile'] },
  { abbr: 'SMV-PE', names: ['superintendencia del mercado de valores peru'] },
  { abbr: 'SFC-CO', names: ['superintendencia financiera de colombia'] },
  { abbr: 'SMV-PA', names: ['superintendencia del mercado de valores panama'] },
  { abbr: 'SVGFSA', names: ['financial services authority st. vincent and the grenadines','svg fsa'] },
  { abbr: 'IFSC-BZ',names: ['international financial services commission belize','belize ifsc'] },
  { abbr: 'CIMA',   names: ['cayman islands monetary authority'] },
  { abbr: 'BMA',    names: ['bermuda monetary authority'] },
  { abbr: 'BVI-FSC',names: ['british virgin islands financial services commission','bvi fsc'] },
  { abbr: 'SCB',    names: ['securities commission of the bahamas','scb bahamas'] },
  { abbr: 'CBCS',   names: ['central bank of curaçao and sint maarten','cbcs'] },
  { abbr: 'VFSC',   names: ['vanuatu financial services commission'] },
  { abbr: 'FSA',    names: ['financial services authority'] }, // generic fallback
];

/* ────────────────────────────────────────────────────────────────────────── */

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildRegIndex(list) {
  const byAbbr = new Map(), byKey = new Map();
  for (const r of list) {
    byAbbr.set(r.abbr.toUpperCase(), r);
    byKey.set(normKey(r.abbr), r);
    (r.names || []).forEach(n => byKey.set(normKey(n), r));
  }
  return { byAbbr, byKey };
}
const REG_INDEX = buildRegIndex(REGULATORS);

function resolveAbbr(raw) {
  if (!raw) return '';
  const t = String(raw).trim();
  const A = t.toUpperCase();
  if (REG_INDEX.byAbbr.has(A)) return A;
  const hit = REG_INDEX.byKey.get(normKey(t));
  return hit ? hit.abbr.toUpperCase() : '';
}

function tierFor(abbr) {
  const A = (abbr || '').toUpperCase();
  if (['FCA','PRA','BaFin','AMF','ACPR','CONSOB','CNMV','AFM','FSMA','CSSF','FINMA','ASIC','NZ-FMA','SFC','MAS','SEC','CFTC','NFA','FINRA','SIPC','CIRO','OSC','AMF-QC','BCSC','ASC-AB'].includes(A)) return 'Tier-1';
  if (['CySEC','CBI','CMVM','HCMC','CNB','KNF','FMA-AT','FIN-FSA','FI','DFSA-NO','DFSA-DK','FSA-IS','HANFA','MNB','ASF-RO','BUL-FSC','ATVP','LB','FKTK','EFSA','DFSA','FSRA','SCA-UAE','FSCA','CMA-KE','ISA','CBB','QFCRA','CMA-OM','CMA-SA','SCB','CIMA','BMA','BVI-FSC','IFSC-BZ','FSC-MU','FSA-SC'].includes(A)) return 'Tier-2';
  return 'Tier-3';
}

function serveScopeFor(abbr) {
  const A = (abbr || '').toUpperCase();
  if (A === 'FCA' || A === 'PRA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['GB'], region_tokens:['uk'] };
  if (A === 'CySEC' || A === 'CBI') return { serves_scope:'EEA', serve_country_codes:[], region_tokens:['eu'] };
  if (A === 'ASIC') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['AU'], region_tokens:['au'] };
  if (A === 'NZ-FMA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['NZ'], region_tokens:['nz'] };
  if (A === 'SFC') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['HK'], region_tokens:['hk'] };
  if (A === 'MAS') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['SG'], region_tokens:['sg'] };
  if (A === 'FINMA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['CH'], region_tokens:['ch'] };
  if (['DFSA','FSRA','SCA-UAE'].includes(A)) return { serves_scope:'COUNTRY_LIST', serve_country_codes:['AE'], region_tokens:['ae'] };
  if (A === 'FSCA') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['ZA'], region_tokens:['za'] };
  if (A === 'CMA-KE') return { serves_scope:'COUNTRY_LIST', serve_country_codes:['KE'], region_tokens:['ke'] };
  if (['SEC','CFTC','NFA','FINRA','SIPC','FDIC','OCC'].includes(A)) return { serves_scope:'COUNTRY_LIST', serve_country_codes:['US'], region_tokens:['us'] };
  if (['CIRO','OSC','AMF-QC','BCSC','ASC-AB','FINTRAC'].includes(A)) return { serves_scope:'COUNTRY_LIST', serve_country_codes:['CA'], region_tokens:['ca'] };
  return { serves_scope:'GLOBAL', serve_country_codes:[], region_tokens:['row'] };
}

/* ──────────────────────────────────────────────────────────────────────────
   2) Crawl (BFS) sa prioritetom na legal/regulation/terms/risk; + JSON-LD
────────────────────────────────────────────────────────────────────────── */

const PATH_HINTS = [
  'regulation','regulations','regulatory','license','licence','licensing',
  'legal','legal-documents','documents','disclosure','risk','risk-disclosure',
  'policies','policy','compliance','terms','terms-and-conditions',
  'client-agreement','client-services-agreement','clientagreement',
  'about','about-us','imprint','privacy','security','safety','company','support'
];

const LINK_SCORE = [
  { re: /(regulation|regulatory|license|licen[cs]e|legal|disclosure|risk)/i, w: 6 },
  { re: /(terms|conditions|client( services)? agreement)/i,                    w: 4 },
  { re: /(policy|policies|compliance|governance)/i,                           w: 3 },
  { re: /(security|safety|privacy)/i,                                         w: 2 }
];

function sameHost(a,b){ try{ return new URL(a).host===new URL(b).host; }catch{return false;} }
function absolutize(href, base){ try{ return new URL(href, base).toString(); } catch { return href||''; } }
function normText(t){ return (t||'').replace(/\s+/g,' ').trim(); }

function scoreUrl(url, anchorText='') {
  let s = 0;
  for (const r of LINK_SCORE) if (r.re.test(url) || r.re.test(anchorText)) s += r.w;
  for (const p of PATH_HINTS) if (url.toLowerCase().includes('/'+p)) s += 1;
  return s;
}

async function crawl({ homepage, seeds=[], maxPages=40, maxDepth=2, timeoutMs=25000, allowPdf=true }) {
  const origin = homepage.replace(/\/+$/,'');
  const seen = new Set(); const queue = []; const pages = []; const tried = [];

  function push(u, depth, atxt='') {
    if (!u) return;
    const url = absolutize(u, origin).replace(/#.*$/,'');
    if (!sameHost(url, origin)) return;
    if (seen.has(url)) return;
    seen.add(url);
    queue.push({ url, depth, score: scoreUrl(url, atxt) });
  }

  push(origin, 0, 'home');
  seeds.forEach(s => push(s, 0, 'seed'));
  // najčešće legal putanje pokušavamo odmah
  PATH_HINTS.forEach(p => push(origin + '/' + p, 1, p));

  while (queue.length && pages.length < maxPages) {
    queue.sort((a,b)=>b.score-a.score);
    const { url, depth } = queue.shift();
    tried.push(url);

    try {
      if (allowPdf && /\.pdf($|\?)/i.test(url)) {
        // PDF: preskačemo tekstualno parsiranje; ali beležimo url
        pages.push({ url, text:'', ld:[] });
        continue;
      }
      const html = await fetchText(url, { timeout: timeoutMs });
      if (!html || html.length < 180) continue;

      const $ = await loadCheerio(html);
      const text = normText($('body').text());

      // JSON-LD snapshots (organizacija/FAQ mogu imati legalName/brand)
      const ld = [];
      $('script[type="application/ld+json"]').each((_, s)=>{
        try {
          const j = JSON.parse($(s).contents().text());
          if (j) ld.push(j);
        } catch {}
      });

      pages.push({ url, text, ld });

      if (depth < maxDepth) {
        $('a[href]').each((_, a)=>{
          const href = $(a).attr('href');
          const t    = normText($(a).text());
          push(href, depth+1, t);
        });
        // footer shortcut
        $('footer a[href]').each((_, a)=>{
          const href = $(a).attr('href');
          const t    = 'footer:' + normText($(a).text());
          push(href, depth+1, t);
        });
      }
    } catch { /* ignore */ }
  }

  return { pages, tried };
}

/* ──────────────────────────────────────────────────────────────────────────
   3) Extraction: entiteti, dokumenti, JSON-LD pomoć, heuristike
────────────────────────────────────────────────────────────────────────── */

const NAME_END = /(Ltd|Limited|LLC|LLP|PLC|Pty(?:\sLtd)?|GmbH|AG|SA|S\.A\.|Pte(?:\.|\s)Ltd|Inc\.?)/i;
const NEAR_TOKENS = /(authori[sz]ed|licensed|regulated|supervised|governed)/i;

function extractJSONLDOrgs(ld) {
  const out = [];
  const bucket = Array.isArray(ld) ? ld : [ld];
  for (const node of bucket) {
    if (!node) continue;
    if (Array.isArray(node)) { out.push(...extractJSONLDOrgs(node)); continue; }
    const t = (node['@type'] || node['type'] || '').toString().toLowerCase();
    if (t.includes('organization')) {
      const legalName = node.legalName || node.name || '';
      if (legalName && NAME_END.test(legalName)) {
        out.push({ entity_name: legalName });
      }
    }
    // recurse in graph
    if (node['@graph']) out.push(...extractJSONLDOrgs(node['@graph']));
  }
  return out;
}

function extractEntities(text, pageUrl, ldOrgHints=[]) {
  const out = [];
  const T = text || '';

  // Pattern A: "<Entity> Ltd ... authorised/regulated by <Regulator>"
  const rx1 = new RegExp(
    `([A-Z][A-Za-z0-9&'().\\- ]+?\\s${NAME_END.source}).{0,200}?${NEAR_TOKENS.source}.{0,120}?\\b([A-Za-z&()' .-]{3,100})\\b`,
    'gi'
  );

  let m;
  while ((m = rx1.exec(T)) !== null) {
    const entity = normText(m[1]);
    const regRaw = normText(m[2]);
    const abbr   = resolveAbbr(regRaw);
    if (!entity || !abbr) continue;

    const scope = serveScopeFor(abbr);
    out.push({
      entity_name: entity,
      country_of_clients: scope.serve_country_codes?.[0] || '',
      regulator_abbreviation: abbr,
      regulator: '',
      regulation_level: tierFor(abbr),
      investor_protection_amount: investorFor(abbr),
      negative_balance_protection: nbpFor(abbr),
      entity_service_url: pageUrl || '',
      ...scope,
      terms_url:'', risk_disclosure_url:'', client_agreement_url:'', open_account_url:'',
      sources:[pageUrl]
    });
  }

  // Pattern B: "<Regulator> ... <Entity> Ltd"
  const rx2 = new RegExp(
    `\\b([A-Za-z&()' .-]{3,100})\\b.{0,160}?${NEAR_TOKENS.source}.{0,200}?([A-Z][A-Za-z0-9&'().\\- ]+?\\s${NAME_END.source})`,
    'gi'
  );
  while ((m = rx2.exec(T)) !== null) {
    const regRaw = normText(m[1]);
    const entity = normText(m[2]);
    const abbr   = resolveAbbr(regRaw);
    if (!entity || !abbr) continue;

    const scope = serveScopeFor(abbr);
    out.push({
      entity_name: entity,
      country_of_clients: scope.serve_country_codes?.[0] || '',
      regulator_abbreviation: abbr,
      regulator: '',
      regulation_level: tierFor(abbr),
      investor_protection_amount: investorFor(abbr),
      negative_balance_protection: nbpFor(abbr),
      entity_service_url: pageUrl || '',
      ...scope,
      terms_url:'', risk_disclosure_url:'', client_agreement_url:'', open_account_url:'',
      sources:[pageUrl]
    });
  }

  // Pattern C: fallback — JSON-LD legalName (ako nađemo), pa pokušamo “nearby regulator” u tekstu
  for (const h of ldOrgHints) {
    if (!h?.entity_name) continue;
    const around = nearbyRegAbbr(T, h.entity_name);
    for (const abbr of around) {
      const scope = serveScopeFor(abbr);
      out.push({
        entity_name: h.entity_name,
        country_of_clients: scope.serve_country_codes?.[0] || '',
        regulator_abbreviation: abbr,
        regulator: '',
        regulation_level: tierFor(abbr),
        investor_protection_amount: investorFor(abbr),
        negative_balance_protection: nbpFor(abbr),
        entity_service_url: pageUrl || '',
        ...scope,
        terms_url:'', risk_disclosure_url:'', client_agreement_url:'', open_account_url:'',
        sources:[pageUrl]
      });
    }
  }

  return out;
}

function nearbyRegAbbr(text, entityName) {
  const hits = new Set();
  if (!text || !entityName) return [];
  const idx = text.toLowerCase().indexOf(entityName.toLowerCase());
  const window = 600;
  const slice = idx >= 0 ? text.slice(Math.max(0, idx - window), idx + entityName.length + window) : text;
  for (const { abbr, names } of REGULATORS) {
    if (slice.includes(abbr)) hits.add(abbr);
    for (const n of (names||[])) if (slice.toLowerCase().includes(n.toLowerCase())) hits.add(abbr);
  }
  return Array.from(hits);
}

// Document links
function collectDocLinks(text, url) {
  const t = (text || '').toLowerCase();
  const out = {};
  const set = (k,v)=>{ if (v && !out[k]) out[k]=v; };

  if (/open-?account|start-?trading|signup|register/.test(url)) set('open_account_url', url);
  if (/client.*agreement|client-?services-?agreement/.test(url)) set('client_agreement_url', url);
  if (/risk/.test(url) || t.includes('risk disclosure')) set('risk_disclosure_url', url);
  if (/terms/.test(url) || t.includes('terms and conditions')) set('terms_url', url);

  return out;
}
function foldLinks(pages) {
  const bag = {};
  for (const p of pages) {
    const x = collectDocLinks(p.text, p.url);
    for (const k of Object.keys(x)) if (!bag[k]) bag[k] = x[k];
  }
  return bag;
}

// Heuristics: investor protection / nbp by regulator
function investorFor(abbr){
  const A = (abbr||'').toUpperCase();
  if (A==='FCA')   return 'FSCS (eligibility dependent)';
  if (A==='CySEC') return 'ICF (eligibility dependent)';
  if (A==='SIPC')  return 'SIPC (eligibility dependent)';
  return 'N/A';
}
function nbpFor(abbr){
  const A = (abbr||'').toUpperCase();
  if (['FCA','CySEC','ASIC','NZ-FMA','SFC','MAS'].includes(A)) return 'Yes (retail; CFD rules/policy)';
  return 'Policy-based or N/A';
}

/* ──────────────────────────────────────────────────────────────────────────
   4) Public API
────────────────────────────────────────────────────────────────────────── */

export async function extractDeepSafety({
  homepage,
  seeds = [],
  maxPages = 40,
  maxDepth = 2,
  timeoutMs = 25000,
  allowPdf = true
} = {}) {

  // Novi fallback: koristi origin prvog seeda ako nema homepage
  const cleanSeeds = Array.isArray(seeds) ? seeds.filter(Boolean) : [];
  if (!homepage && cleanSeeds.length) {
    try {
      const u = new URL(cleanSeeds[0]);
      homepage = `${u.protocol}//${u.host}`;
    } catch {}
  }

  // Ako i dalje nemamo ni homepage ni seeds → tek tada graceful poruka
  if (!homepage && !cleanSeeds.length) {
    return {
      description: 'No homepage or seeds provided — cannot crawl legal/regulatory pages.',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['Homepage/seed URL is missing.'],
      legal_entities: [],
      terms_url:'', risk_disclosure_url:'', client_agreement_url:'', open_account_url:'',
      triedPaths: [], sources: [], hints: ['Pass ?homepage=<url> or seeds[].']
    };
  }

  const { pages, tried } = await crawl({
    homepage,
    seeds: cleanSeeds,
    maxPages, maxDepth, timeoutMs, allowPdf
  });

  // JSON-LD hints
  const ldHints = pages.flatMap(p => extractJSONLDOrgs(p.ld || []));

  // Extract entities across pages
  const entities = [];
  const sourceSet = new Set();
  for (const p of pages) {
    const es = extractEntities(p.text, p.url, ldHints);
    if (es.length) {
      es.forEach(e => {
        entities.push(e);
        (e.sources || []).forEach(s => sourceSet.add(s));
      });
    }
  }

  // Deduplicate by entity_name + regulator_abbreviation
  const uniq = new Map();
  for (const e of entities) {
    const key = `${e.entity_name}__${e.regulator_abbreviation}`;
    if (!uniq.has(key)) uniq.set(key, e);
  }
  const legal_entities = Array.from(uniq.values());

  // Gather doc links
  const links = foldLinks(pages);

  // Compose description / pros-cons style highlights
  const abbrs = Array.from(new Set(legal_entities.map(e => e.regulator_abbreviation).filter(Boolean)));
  const highlights = [];
  const caveats = [];
  let desc = '';

  if (abbrs.length) {
    desc = `Detected regulators: ${abbrs.join(', ')}.`;
    highlights.push('Regulatory licenses detected.');
    if (abbrs.some(a => ['SVGFSA','IFSC-BZ','BVI-FSC','FSC-MU','FSA-SC','VFSC','LFSA','SCB','CIMA','BMA'].includes(a))) {
      caveats.push('Offshore authorizations typically provide limited investor compensation.');
    }
    if (abbrs.some(a => ['FCA','CySEC','ASIC','NZ-FMA','SFC','MAS'].includes(a))) {
      highlights.push('Retail negative balance protection (per CFD rules/policies).');
    }
  } else {
    caveats.push('No clear regulator mentions found on crawled pages.');
    desc = 'Regulator information not conclusively found on the crawled pages.';
  }

  const normalized = {
    description: desc,
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
    sources: Array.from(sourceSet),
    hints: []
  };

  return normalized;
}

// CJS compat
try { module.exports = { extractDeepSafety }; } catch {}
