// packages/acf-map/safety.js
// Normalized → ACF mapping for `safety` section
export function toACF(n) {
  const acf = {};

  // Tekstualni highlight-i
  if (n?.description) acf['description_safety'] = n.description;
  if (n?.is_regulated) acf['description_safety_is_regulated'] = n.is_regulated;

  const highs = Array.isArray(n?.safety_highlights) ? n.safety_highlights : [];
  const caves = Array.isArray(n?.safety_caveats) ? n.safety_caveats : [];

  if (highs[0]) acf['description_safety_is_safe']  = highs[0];
  if (highs[1]) acf['description_safety_is_safe1'] = highs[1];
  if (caves[0]) acf['description_safety_is_safe2'] = caves[0];
  if (caves[1]) acf['description_safety_is_safe3'] = caves[1];

  // Pros/cons repeater (ako normalized dolazi sa pros_cons_safety, inače deriviraj iz highlights/caveats)
  const prosCons = Array.isArray(n?.pros_cons_safety) ? n.pros_cons_safety : [
    ...highs.map(h => ({ type: 'pro', description: h })),
    ...caves.map(c => ({ type: 'con', description: c }))
  ];
  if (prosCons.length) {
    acf['pros_cons_safety'] = prosCons.map(p => ({
      type: p.type === 'con' ? 'con' : 'pro',
      description: String(p.description || '')
    }));
  }

  // Legal entities repeater (ako postoje u normalized)
  if (Array.isArray(n?.legal_entities)) {
    acf['legal_entities'] = n.legal_entities.map(e => ({
      entity_name: e.entity_name || '',
      country_of_clients: e.country_of_clients || '',
      logo_regulator: e.logo_regulator || '',
      regulator_abbreviation: e.regulator_abbreviation || '',
      regulator: e.regulator || '',
      regulation_level: e.regulation_level || '',
      investor_protection_amount: e.investor_protection_amount || '',
      negative_balance_protection: e.negative_balance_protection || '',
      regulator_reference: e.regulator_reference || '',
      entity_service_url: e.entity_service_url || '',
      serves_scope: e.serves_scope || '',
      serve_country_codes: Array.isArray(e.serve_country_codes) ? e.serve_country_codes : [],
      exclude_country_codes: Array.isArray(e.exclude_country_codes) ? e.exclude_country_codes : [],
      terms_url: e.terms_url || '',
      risk_disclosure_url: e.risk_disclosure_url || '',
      client_agreement_url: e.client_agreement_url || '',
      open_account_url: e.open_account_url || '',
      tsbar_manual_seeds: e.tsbar_manual_seeds || '',
      region_tokens: Array.isArray(e.region_tokens) ? e.region_tokens : []
    }));
  }

  // Direktni linkovi (fallback ako nisu pokriveni kroz entitete)
  const pick = (k) => (n && typeof n[k] === 'string') ? n[k] : '';
  acf['terms_url']            = pick('terms_url');
  acf['risk_disclosure_url']  = pick('risk_disclosure_url');
  acf['client_agreement_url'] = pick('client_agreement_url');
  acf['open_account_url']     = pick('open_account_url');

  // Warning liste
  if (Array.isArray(n?.warnings)) {
    acf['broker_warning_lists'] = n.warnings.map(w => ({
      warning_name: w.warning_name || '',
      warning_url:  w.warning_url  || ''
    }));
  }

  return acf;
}
