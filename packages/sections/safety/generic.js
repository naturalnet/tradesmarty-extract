// packages/sections/safety/generic.js
import { fetchText, loadCheerio } from '../../core/http.js';
import { findRegulatorsInText, tierFor } from '../../shared/regulators.js';

const CANDIDATE_PATHS = [
  '', 'regulation', 'regulations', 'regulatory', 'legal', 'legal-documents', 'documents',
  'policies', 'compliance', 'risk', 'risk-disclosure', 'disclosures', 'disclosure',
  'terms', 'terms-and-conditions', 'terms-and-conditions-of-business', 'client-agreement',
  'about', 'about-us', 'imprint', 'licence', 'license', 'licensing', 'privacy',
  'contact', 'faq', 'education/faq/regulation'
];

const LINK_GUESS = [
  { key: 'terms_url',            rx: /(terms|conditions|client agreement)/i },
  { key: 'risk_disclosure_url',  rx: /(risk( disclosure| warning)?)/i },
  { key: 'client_agreement_url', rx: /(client( services)? agreement|customer agreement|account agreement)/i },
  { key: 'open_account_url',     rx: /(open account|start trading|create account|sign up)/i }
];

function uniq(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
function normText(t) { return (t || '').replace(/\s+/g, ' ').trim(); }
function absolutize(href, base) {
  if (!href) return '';
  try { return new URL(href, base).toString(); } catch { return href; }
}

function guessServeScope(abbr) {
  const A = (abbr || '').toUpperCase();
  if (A === 'FCA') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['GB'], region_tokens: ['uk'] };
  if (A === 'ASIC') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['AU'], region_tokens: ['au'] };
  if (A === 'CYSEC') return { serves_scope: 'EEA', serve_country_codes: [], region_tokens: ['eu'] };
  if (A === 'FSCA') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['ZA'], region_tokens: ['row'] };
  if (A === 'FSRA' || A === 'DFSA') return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['AE'], region_tokens: ['me'] };
  if (A === 'GFSC') return { serves_scope: 'GLOBAL', serve_country_codes: [], region_tokens: ['wallet'] };
  if (['SEC','FINRA','SIPC','NFA','CFTC'].includes(A)) return { serves_scope: 'COUNTRY_LIST', serve_country_codes: ['US'], region_tokens: ['us'] };
  if (A === 'FSA') return { serves_scope: 'GLOBAL', serve_country_codes: [], region_tokens: ['row'] };
  return { serves_scope: 'GLOBAL', serve_country_codes: [], region_tokens: ['row'] };
}

function extractEntitiesFromText(text, pageUrl) {
  const ents = [];
  const T = text || '';

  // Uzmi “Entitet + regulator” obrasce (pragmatično)
  const rx = /([A-Z][A-Za-z0-9&'().\- ]{2,}?\s(?:Ltd|Limited|LLC|LLP|PLC|Pty(?:\sLtd)?|GmbH|AG|SA|S\.A\.|Pte(?:\.|\s)Ltd|Inc\.?))[^.]{0,200}?(?:authori[sz]ed|regulated|licensed|supervised|governed).{0,80}?\b(FCA|CySEC|ASIC|FSCA|FSA|FSRA|DFSA|GFSC|SEC|FINRA|SIPC|NFA|CFTC)\b/gi;

  let m;
  while ((m = rx.exec(T)) !== null) {
    const entity_name = normText(m[1]);
    const abbr = String(m[2] || '').toUpperCase();
    const level = tierFor(abbr) || '';
    const scope = guessServeScope(abbr);
    const investor =
      (abbr === 'FCA')   ? 'FSCS (eligibility dependent)' :
      (abbr === 'CYSEC') ? 'ICF (eligibility dependent)'  :
      (abbr === 'SIPC')  ? 'SIPC (brokerage accounts)'     : 'N/A';
    const nbp =
      (abbr === 'FCA' || abbr === 'CYSEC' || abbr === 'ASIC')
        ? 'Yes (retail; CFD rules/policy)'
        : 'Policy-based or N/A';

    ents.push({
      entity_name,
      country_of_clients: scope.serve_country_codes?.[0] ? scope.serve_country_codes[0] : '',
      regulator_abbreviation: abbr,
      regulator: '', // punimo u WP linkovanjem ka regulator postu
      regulation_level: level,
      investor_protection_amount: investor,
      negative_balance_protection: nbp,
      entity_service_url: pageUrl || '',
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
  [...(a||[]), ...(b||[])].forEach(e => {
    if (!e || !e.entity_name) return;
    const k = key(e);
    if (!map.has(k)) map.set(k, e);
  });
  return Array.from(map.values());
}

export async function extractGenericSafety({ homepage }) {
  const base = (homepage || '').replace(/\/+$/, '');
  const triedPaths = [];
  const sources = [];
  const pages = [];
  const links = { terms_url: '', risk_disclosure_url: '', client_agreement_url: '', open_account_url: '' };

  if (!base) {
    // **nikad ne vrati null**
    return {
      description: 'No homepage provided — cannot crawl legal/regulatory pages.',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['Homepage URL is missing.'],
      legal_entities: [],
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: '',
      warnings: [],
      triedPaths: [],
      sources: [],
      hints: ['Provide homepage (e.g. https://example.com).'],
    };
  }

  // Kandidat URL-ovi
  const candidates = uniq(CANDIDATE_PATHS.map(p => p ? `${base}/${p}` : base));

  // Fetch defanzivno — čak i kad nešto padne, idemo dalje
  for (const url of candidates) {
    triedPaths.push(url);
    try {
      const html = await fetchText(url, { timeout: 30000 });
      if (!html || html.length < 64) continue;

      const $ = await loadCheerio(html); // <— bitno: prosleđujemo HTML, ne URL
      const text = normText($('body').text());
      if (!text) continue;

      // Linkovi (Terms/Risk/Client/Open)
      $('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        const txt  = normText($(a).text());
        if (!href || !txt) return;
        for (const def of LINK_GUESS) {
          if (!links[def.key] && def.rx.test(txt)) {
            links[def.key] = absolutize(href, url);
          }
        }
      });

      pages.push({ url, text });
      sources.push(url);
    } catch (e) {
      // WAF/403/timeout — samo nastavi
      continue;
    }
  }

  // Ako baš ništa nismo uspeli da učitamo — i dalje vrati minimalni objekat
  if (pages.length === 0) {
    return {
      description: 'Could not fetch any legal/regulatory pages (site may block bots or requires JS).',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['Try whitelisting worker IP or provide direct legal URLs.'],
      legal_entities: [],
      terms_url: links.terms_url,
      risk_disclosure_url: links.risk_disclosure_url,
      client_agreement_url: links.client_agreement_url,
      open_account_url: links.open_account_url || base,
      warnings: [],
      triedPaths,
      sources: uniq(sources),
      hints: ['Consider adding manual seed paths for this domain.'],
    };
  }

  // Skupi regulatore + entitete
  let regulatorsFound = [];
  let entities = [];

  for (const p of pages) {
    const regs = findRegulatorsInText(p.text);
    for (const r of regs) {
      if (!regulatorsFound.find(x => x.abbr === r.abbr)) regulatorsFound.push(r);
    }
    entities = mergeEntities(entities, extractEntitiesFromText(p.text, p.url));
  }

  // Ako nema entiteta, ali ima abbr-ova, formiraj “generic entitete” po abbr
  if (entities.length === 0 && regulatorsFound.length) {
    entities = regulatorsFound.map(r => {
      const scope = guessServeScope(r.abbr);
      const investor =
        (r.abbr === 'FCA')   ? 'FSCS (eligibility dependent)' :
        (r.abbr === 'CYSEC') ? 'ICF (eligibility dependent)'  :
        (r.abbr === 'SIPC')  ? 'SIPC (brokerage accounts)'     : 'N/A';
      const nbp =
        (r.abbr === 'FCA' || r.abbr === 'CYSEC' || r.abbr === 'ASIC')
          ? 'Yes (retail; CFD rules/policy)'
          : 'Policy-based or N/A';
      return {
        entity_name: '', // ime entiteta ne izmišljamo — WP ne menja naziv
        country_of_clients: scope.serve_country_codes?.[0] ? scope.serve_country_codes[0] : '',
        regulator_abbreviation: r.abbr,
        regulator: r.name,
        regulation_level: r.level,
        investor_protection_amount: investor,
        negative_balance_protection: nbp,
        entity_service_url: pages[0]?.url || base,
        ...scope,
        terms_url: links.terms_url,
        risk_disclosure_url: links.risk_disclosure_url,
        client_agreement_url: links.client_agreement_url,
        open_account_url: links.open_account_url,
        region_tokens: scope.region_tokens
      };
    });
  }

  // Summary polja
  const abbrs = uniq([
    ...regulatorsFound.map(r => r.abbr),
    ...entities.flatMap(e => String(e.regulator_abbreviation || '').split('/').map(x => (x || '').trim().toUpperCase()))
  ]);
  const tierCounts = {
    t1: entities.filter(e => String(e.regulation_level || '').toLowerCase() === 'tier-1').length,
    t2: entities.filter(e => String(e.regulation_level || '').toLowerCase() === 'tier-2').length,
    t3: entities.filter(e => String(e.regulation_level || '').toLowerCase() === 'tier-3').length,
  };

  const description = abbrs.length
    ? `Broker posluje pod više regulatora (${abbrs.join(', ')}). Višeslojna regulativa (Tier-1: ${tierCounts.t1}, Tier-2: ${tierCounts.t2}, Tier-3: ${tierCounts.t3}) — konkretne zaštite zavise od entiteta i jurisdikcije.`
    : 'Nisu eksplicitno navedene licence na javnim “legal/regulatory” stranama — proveriti direktno dokumente i fusnote.';

  const safety_highlights = [];
  if (tierCounts.t1 > 0) safety_highlights.push('Prisutan Tier-1 nadzor (npr. FCA/ASIC/SEC).');
  if (abbrs.includes('CYSEC')) safety_highlights.push('EU pokrivenost kroz CySEC entitet.');
  if (abbrs.includes('FSRA') || abbrs.includes('DFSA')) safety_highlights.push('Bliski Istok (ADGM/DFSA) podrška.');
  if (abbrs.includes('GFSC')) safety_highlights.push('Poseban DLT/wallet nadzor (GFSC).');

  const safety_caveats = [
    'Zaštite (FSCS/ICF/SIPC itd.) i NBP važe po entitetu i statusu klijenta.',
    'Potrebno je proveriti pod kojim entitetom je otvoren nalog (razlike u zaštitama).',
  ];

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
    triedPaths,
    sources: uniq(sources),
    hints: []
  };
}

// kompatibilnost za CommonJS
try { module.exports = { extractGenericSafety }; } catch (_) {}
