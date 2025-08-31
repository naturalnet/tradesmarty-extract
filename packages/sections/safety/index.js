// packages/sections/safety/index.js
import { extractDeepSafety } from './generic-deep.js';

function pickHomepage(ctx = {}) {
  const cand = [ctx.homepage, ctx.url, ctx.website, ctx.home, ctx.base]
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  let hp = cand[0] || '';
  if (hp && !/^https?:\/\//i.test(hp)) hp = 'https://' + hp;
  return hp.replace(/\/+$/, '');
}

function toAcf(n = {}) {
  const pros = Array.isArray(n.safety_highlights) ? n.safety_highlights : [];
  const cons = Array.isArray(n.safety_caveats) ? n.safety_caveats : [];
  const pc = [
    ...pros.map(d => ({ type: 'pro', description: d })),
    ...cons.map(d => ({ type: 'con', description: d })),
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
    regulator_reference: '', // WP plugin će linkovati preko abbreviations/indexa
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

  return {
    description_safety:               n.description || '',
    description_safety_is_regulated:  n.is_regulated || '',
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
      warning_name: w.warning_name || '', warning_url: w.warning_url || ''
    })),
  };
}

export async function extract(ctx = {}) {
  const homepage = pickHomepage(ctx);
  const seeds = Array.isArray(ctx.seeds) ? ctx.seeds : (ctx.seeds ? [ctx.seeds] : []);
  const opt = {
    homepage,
    seeds,
    maxPages: Number(ctx.maxPages || 32),
    maxDepth: Number(ctx.maxDepth || 2),
    timeoutMs: Number(ctx.timeoutMs || 25000),
    allowPdf: true
  };

  let out;
  if (!homepage) {
    out = {
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
    };
  } else {
    out = await extractDeepSafety(opt);
    out = (out && out.normalized) ? out.normalized : out;
  }

  const normalized = (out && typeof out === 'object') ? out : {
    description: 'Could not extract safety information.',
    is_regulated: '',
    safety_highlights: [],
    safety_caveats: ['No regulatory pages detected.'],
    legal_entities: [],
    terms_url: '', risk_disclosure_url: '', client_agreement_url: '',
    open_account_url: homepage,
    warnings: [],
    triedPaths: opt.seeds || [],
    sources: [],
    hints: []
  };

  return { ok: true, normalized, acf: toAcf(normalized) };
}

// CommonJS
try { module.exports = { extract }; } catch {}
