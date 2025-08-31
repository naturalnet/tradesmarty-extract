// packages/sections/safety/generic.js
import { fetchText, loadCheerio } from '../../core/http.js';
import { findRegulatorsInText, tierFor, regionGuessFor } from '../../shared/regulators.js';

const CANDIDATE_PATHS = [
  '', 'regulation', 'regulations', 'regulatory', 'legal', 'legal-documents', 'documents',
  'policies', 'compliance', 'risk', 'risk-disclosure', 'disclosures', 'disclosure',
  'terms', 'terms-and-conditions', 'terms-and-conditions-of-business', 'client-agreement',
  'about', 'about-us', 'imprint', 'licence', 'license', 'licensing', 'privacy',
  'contact', 'faq', 'education/faq/regulation'
];

const A_TXT = [
  { key: 'terms_url',            rx: /(terms|conditions|client agreement)/i },
  { key: 'risk_disclosure_url',  rx: /(risk( disclosure| warning)?)/i },
  { key: 'client_agreement_url', rx: /(client( services)? agreement|customer agreement|account agreement)/i },
  { key: 'open_account_url',     rx: /(open account|start trading|create account|sign up)/i }
];

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function guessServeScope(abbr) {
  const A = (abbr || '').toUpperCase();
  if (A === 'FCA') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['GB'], region_tokens: ['uk'] };
  if (A === 'ASIC') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['AU'], region_tokens: ['au'] };
  if (A === 'CySEC') return { serves_scope: 'EEA', serve_country_codes: [], region_tokens: ['eu'] };
  if (A === 'FSCA') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['ZA'], region_tokens: ['row'] };
  if (A === 'FSRA' || A === 'DFSA') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['AE'], region_tokens: ['me'] };
  if (A === 'GFSC') return { serves_scope: 'GLOBAL', serve_country_codes: [], region_tokens: ['wallet'] };
  if (A === 'FSA') return { serves_scope: 'GLOBAL', serve_country_codes: [], region_tokens: ['row'] };
  if (A === 'SEC' || A === 'FINRA' || A === 'SIPC' || A === 'NFA' || A === 'CFTC') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['US'], region_tokens: ['us'] };
  return { serves_scope: 'GLOBAL', serve_country_codes: [], region_tokens: ['row'] };
}

function normText(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

function extractEntitiesFromText(text) {
  const ents = [];
  const T = text;

  // Entity + regulator u istoj rečenici
  const rx = /([A-Z][A-Za-z0-9&'().\- ]{2,}?\s(?:Ltd|Limited|LLC|LLP|PLC|Pty(?:\sLtd)?|GmbH|AG|SA|S\.A\.|Pte(?:\.|\s)Ltd|Inc\.?))[^.]{0,200}?(?:authori[sz]ed|regulated|licensed|supervised|governed).{0,50}?\b(FCA|CySEC|ASIC|FSCA|FSA|FSRA|DFSA|GFSC|SEC|FINRA|SIPC|NFA|CFTC)\b/gi;

  let m;
  while ((m = rx.exec(T)) !== null) {
    const entity_name = normText(m[1]);
    const abbr = m[2].toUpperCase();
    const level = tierFor(abbr);
    const country_of_clients = regionGuessFor(abbr) || '';
    const scope = guessServeScope(abbr);

    ents.push({
      entity_name,
      country_of_clients,
      regulator_abbreviation: abbr,
      regulator: '',
      regulation_level: level,
      investor_protection_amount: (abbr === 'FCA') ? 'FSCS (eligibility dependent)' :
                                  (abbr === 'CySEC') ? 'ICF (eligibility dependent)' :
                                  (abbr === 'SIPC') ? 'SIPC (brokerage accounts)' : 'N/A',
      negative_balance_protection: (abbr === 'FCA' || abbr === 'CySEC' || abbr === 'ASIC') ? 'Yes (retail; CFD rules/policy)' : 'Policy-based or N/A',
      entity_service_url: '',
      ...scope,
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: '',
      region_tokens: scope.region_tokens
    });
  }

  return ents;
}

function mergeEntities(a, b) {
  const key = e => `${e.entity_name}|${e.regulator_abbreviation}|${e.country_of_clients}`.toLowerCase();
  const map = new Map();
  [...a, ...b].forEach(e => {
    if (!e || !e.entity_name) return;
    const k = key(e);
    if (!map.has(k)) map.set(k, e);
  });
  return Array.from(map.values());
}

export async function extractGenericSafety({ homepage }) {
  if (!homepage) return null;
  const base = homepage.replace(/\/+$/, '');
  const triedPaths = [];
  const sources = [];
  const pages = [];

  // 1) Skupi sve kandidat URL-ove (plusevi: bez duplih /)
  const candidates = uniq(CANDIDATE_PATHS.map(p => p ? `${base}/${p}` : base));

  // 2) Fetch + parsiraj
  const settled = await Promise.allSettled(candidates.map(async (url) => {
    triedPaths.push(url);
    const html = await fetchText(url, { timeout: 30000 });
    const $ = await loadCheerio(url, { timeout: 30000 });
    pages.push({ url, $, text: normText($('body').text()) });
    sources.push(url);
  }));

  // 3) Rangiraj stranice (više bodova za prisutne regulatore/ključne fraze)
  const scores = pages.map(p => {
    let s = 0;
    const T = p.text;
    const regs = findRegulatorsInText(T);
    s += regs.length * 5;
    if (/authori[sz]ed|regulated|licensed/i.test(T)) s += 2;
    if (/terms|risk|disclosure|client agreement/i.test(T)) s += 1;
    return { url: p.url, s, regsCount: regs.length };
  }).sort((x, y) => y.s - x.s);

  // 4) Odredi skup regulatora + entitete
  let regulatorsFound = [];
  let entities = [];
  const links = { terms_url: '', risk_disclosure_url: '', client_agreement_url: '', open_account_url: '' };

  for (const p of pages) {
    const regs = findRegulatorsInText(p.text);
    if (regs.length) regulatorsFound = mergeRegs(regulatorsFound, regs);
    entities = mergeEntities(entities, extractEntitiesFromText(p.text));

    // linkovi
    for (const a of p.$('a').toArray()) {
      const href = p.$(a).attr('href') || '';
      const txt  = normText(p.$(a).text());
      if (!href || !txt) continue;
      for (const def of A_TXT) {
        if (!links[def.key] && def.rx.test(txt)) {
          links[def.key] = absolutize(href, p.url);
        }
      }
    }
  }

  // Ako nemamo entitete, makar složi “po abbr”
  if (entities.length === 0 && regulatorsFound.length) {
    entities = regulatorsFound.map(r => {
      const scope = guessServeScope(r.abbr);
      return {
        entity_name: '', // nema eksplicitno na sajtu – backfill u WP ne menja ime
        country_of_clients: r.countryGuess || '',
        regulator_abbreviation: r.abbr,
        regulator: r.name,
        regulation_level: r.level,
        investor_protection_amount: (r.abbr === 'FCA') ? 'FSCS (eligibility dependent)' :
                                    (r.abbr === 'CySEC') ? 'ICF (eligibility dependent)' :
                                    (r.abbr === 'SIPC') ? 'SIPC (brokerage accounts)' : 'N/A',
        negative_balance_protection: (r.abbr === 'FCA' || r.abbr === 'CySEC' || r.abbr === 'ASIC') ? 'Yes (retail; CFD rules/policy)' : 'Policy-based or N/A',
        entity_service_url: scores[0]?.url || base,
        ...scope,
        terms_url: links.terms_url,
        risk_disclosure_url: links.risk_disclosure_url,
        client_agreement_url: links.client_agreement_url,
        open_account_url: links.open_account_url,
        region_tokens: scope.region_tokens
      };
    });
  }

  // 5) Summary polja
  const abbrs = uniq([
    ...regulatorsFound.map(r => r.abbr),
    ...entities.flatMap(e => (e.regulator_abbreviation || '').split('/').map(x => x.trim()))
  ]);
  const tierCounts = {
    t1: entities.filter(e => (e.regulation_level || '').toLowerCase() === 'tier-1').length,
    t2: entities.filter(e => (e.regulation_level || '').toLowerCase() === 'tier-2').length,
    t3: entities.filter(e => (e.regulation_level || '').toLowerCase() === 'tier-3').length,
  };

  const description = abbrs.length
    ? `Broker posluje pod više regulatora (${abbrs.join(', ')}). Višeslojna regulativa (Tier-1: ${tierCounts.t1}, Tier-2: ${tierCounts.t2}, Tier-3: ${tierCounts.t3}) — konkretne zaštite zavise od entiteta i jurisdikcije.`
    : 'Nisu eksplicitno navedene licence na javnim “legal/regulatory” stranama — proveriti direktno dokumente i fusnote.';

  const safety_highlights = [];
  if (tierCounts.t1 > 0) safety_highlights.push('Prisutan Tier-1 nadzor (npr. FCA/ASIC/SEC).');
  if (abbrs.includes('CySEC')) safety_highlights.push('EU pokrivenost kroz CySEC entitet.');
  if (abbrs.includes('FSRA') || abbrs.includes('DFSA')) safety_highlights.push('Bliski Istok (ADGM/DFSA) podrška.');
  if (abbrs.includes('GFSC')) safety_highlights.push('Poseban DLT/wallet nadzor (GFSC).');

  const safety_caveats = [
    'Zaštite (FSCS/ICF/SIPC itd.) i NBP važe po entitetu i statusu klijenta.',
    'Potrebno proveriti pod kojim entitetom je otvoren nalog (razlike u zaštitama).',
  ];

  // 6) Normalized odgovor
  return {
    description,
    is_regulated: abbrs.join(', '),
    safety_highlights,
    safety_caveats,
    legal_entities: entities,
    terms_url: links.terms_url,
    risk_disclosure_url: links.risk_disclosure_url,
    client_agreement_url: links.client_agreement_url,
    open_account_url: links.open_account_url || base,
    warnings: [],
    triedPaths: triedPaths,
    sources: uniq(sources),
    hints: []
  };
}

function mergeRegs(a, regs) {
  const by = new Map(a.map(r => [r.abbr, r]));
  for (const r of regs) by.set(r.abbr, r);
  return Array.from(by.values());
}

function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
