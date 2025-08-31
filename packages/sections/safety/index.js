// packages/sections/safety/index.js
// ESM file
// Zadaci ovog modula:
// 1) Uzeti ulaz (homepage, seeds, …) i odrediti validan homepage (fallback na origin iz prvog seeda)
// 2) Pozvati generic deep extractor
// 3) Ulepšati (polish) tekstualna polja i spakovati u ACF shape

import { extractDeepSafety } from './generic-deep.js';

/* --------------------------------- helpers -------------------------------- */

function pickHomepage(ctx = {}) {
  const cand = [
    ctx.homepage, ctx.url, ctx.website, ctx.home, ctx.base
  ]
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);

  let hp = cand[0] || '';
  if (hp && !/^https?:\/\//i.test(hp)) hp = 'https://' + hp;
  return hp.replace(/\/+$/, '');
}

function originFrom(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

function uniq(arr) {
  const set = new Set();
  const out = [];
  for (const s of arr || []) {
    const key = (typeof s === 'string' ? s.trim().toLowerCase() : JSON.stringify(s));
    if (!set.has(key)) { set.add(key); out.push(s); }
  }
  return out;
}

function sentenceCase(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function ensurePeriod(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : t + '.';
}
function clampLen(s, max = 300) {
  if (!s || typeof s !== 'string') return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
function polishList(list = []) {
  const cleaned = (list || [])
    .map(x => (typeof x === 'string' ? x : ''))
    .map(x => ensurePeriod(sentenceCase(x)))
    .filter(Boolean);
  return uniq(cleaned);
}

/**
 * Ako description fali, pokušaj da napraviš kratak opis iz legal entities
 */
function fallbackDescription(n = {}) {
  try {
    const ents = Array.isArray(n.legal_entities) ? n.legal_entities : [];
    const abbrs = uniq(
      ents
        .map(e => e?.regulator_abbreviation || e?.regulator || '')
        .filter(Boolean)
        .map(x => x.toString().trim().toUpperCase())
    );
    if (!abbrs.length) return '';

    // primer: "Regulated by FCA, CySEC, ASIC."
    const desc = `Regulated by ${abbrs.join(', ')}.`;
    return desc;
  } catch {
    return '';
  }
}

/* ------------------------------- ACF packing ------------------------------- */

function toAcf(n = {}) {
  const pros = Array.isArray(n.safety_highlights) ? polishList(n.safety_highlights) : [];
  const cons = Array.isArray(n.safety_caveats)    ? polishList(n.safety_caveats)    : [];

  const pc = [
    ...pros.map(d => ({ type: 'pro', description: clampLen(d, 240) })),
    ...cons.map(d => ({ type: 'con', description: clampLen(d, 240) })),
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
    regulator_reference: '', // WP plugin linkuje preko abbreviation
    entity_service_url: e.entity_service_url || '',
    serves_scope: e.serves_scope || '',
    serve_country_codes: e.serve_country_codes || [],
    exclude_country_codes: e.exclude_country_codes || [],
    terms_url: e.terms_url || '',
    risk_disclosure_url: e.risk_disclosure_url || '',
    client_agreement_url: e.client_agreement_url || '',
    open_account_url: e.open_account_url || '',
    tsbar_manual_seeds: (e.sources || []).join('\n'),
    region_tokens: e.region_tokens || []
  }));

  const description =
    clampLen(ensurePeriod(sentenceCase(n.description || '')), 480) ||
    clampLen(ensurePeriod(fallbackDescription(n)), 480);

  const isReg =
    (Array.isArray(n.is_regulated) ? n.is_regulated.join(', ') : n.is_regulated) || '';

  return {
    description_safety:               description || '',
    description_safety_is_regulated:  isReg,
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
      warning_name: w.warning_name || '',
      warning_url: w.warning_url || ''
    })),
  };
}

/* --------------------------------- extract -------------------------------- */

export async function extract(ctx = {}) {
  // seeds normalizacija
  const seeds = Array.isArray(ctx.seeds)
    ? ctx.seeds.filter(Boolean)
    : (ctx.seeds ? [ctx.seeds] : []);

  // homepage + fallback na origin iz prvog seeda
  let homepage = pickHomepage(ctx);
  if (!homepage && seeds.length) {
    const guess = originFrom(seeds[0]);
    if (guess) homepage = guess;
  }

  const opt = {
    homepage,
    seeds,
    maxPages: Number(ctx.maxPages || 24),
    maxDepth: Number(ctx.maxDepth || 2),
    timeoutMs: Number(ctx.timeoutMs || 25000),
    allowPdf: true
  };

  const n = await extractDeepSafety(opt);

  const normalized = (n && typeof n === 'object') ? n : {
    description: 'Could not extract safety information.',
    is_regulated: '',
    safety_highlights: [],
    safety_caveats: ['No regulatory pages detected.'],
    legal_entities: [],
    terms_url: '',
    risk_disclosure_url: '',
    client_agreement_url: '',
    open_account_url: homepage,
    warnings: [],
    triedPaths: opt.seeds || [],
    sources: [],
    hints: (homepage ? [] : ['Homepage inferred from seeds or missing'])
  };

  return {
    ok: true,
    normalized,
    acf: toAcf(normalized)
  };
}

/* ---------------------------- module compat exports ----------------------- */

export default { extract };
// CommonJS compat (ako bundler traži)
try { module.exports = { extract, default: { extract } }; } catch {}
