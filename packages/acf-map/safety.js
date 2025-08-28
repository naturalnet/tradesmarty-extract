// packages/acf-map/safety.js
export function toACF(normalized) {
  if (!normalized) return null;

  const pros = (normalized.safety_highlights || []).map(d => ({ type: 'pro', description: d }));
  const cons = (normalized.safety_caveats || []).map(d => ({ type: 'con', description: d }));

  return {
    description_safety: normalized.description || '',
    description_safety_is_regulated: normalized.is_regulated || '',
    description_safety_is_safe: normalized.safety_highlights?.[0] || '',
    description_safety_is_safe1: normalized.safety_highlights?.[1] || '',
    description_safety_is_safe2: normalized.safety_caveats?.[0] || '',
    description_safety_is_safe3: normalized.safety_caveats?.[1] || '',
    pros_cons_safety: [...pros, ...cons],
    legal_entities: (normalized.legal_entities || []).map(e => ({
      entity_name: e.entity_name,
      country_of_clients: e.country_of_clients,
      logo_regulator: '',
      regulator_abbreviation: e.regulator_abbreviation,
      regulator: e.regulator,
      regulation_level: e.regulation_level,
      investor_protection_amount: e.investor_protection_amount,
      negative_balance_protection: e.negative_balance_protection,
      regulator_reference: '',
      entity_service_url: e.entity_service_url,
      serves_scope: e.serves_scope,
      serve_country_codes: e.serve_country_codes,
      exclude_country_codes: e.exclude_country_codes,
      terms_url: e.terms_url,
      risk_disclosure_url: e.risk_disclosure_url,
      client_agreement_url: e.client_agreement_url,
      open_account_url: e.open_account_url,
      tsbar_manual_seeds: [
        e.entity_service_url, e.terms_url, e.risk_disclosure_url, e.client_agreement_url, e.open_account_url
      ].filter(Boolean).join('\n'),
      region_tokens: e.region_tokens || []
    })),
    broker_warning_lists: (normalized.warnings || []).map(w => ({
      warning_name: w.warning_name,
      warning_url: w.warning_url
    }))
  };
}
