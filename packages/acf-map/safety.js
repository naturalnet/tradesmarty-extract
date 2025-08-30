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

  // Pros/Cons repeater
  acf['pros_cons_safety'] = [
    ...highs.map(h => ({ type: 'pro', description: h })),
    ...caves.map(c => ({ type: 'con', description: c })),
  ];

  // Legal entities repeater (ako postoji u ACF-u)
  if (Array.isArray(n?.legal_entities)) {
    acf['legal_entities'] = n.legal_entities.map(e => ({
      entity_name:               e.entity_name || '',
      country_of_clients:        e.country_of_clients || '',
      logo_regulator:            '',
      regulator_abbreviation:    e.regulator_abbreviation || '',
      regulator:                 e.regulator || '',
      regulation_level:          e.regulation_level || '',
      investor_protection_amount:e.investor_protection_amount || '',
      negative_balance_protection:e.negative_balance_protection || '',
      regulator_reference:       '',
      entity_service_url:        e.entity_service_url || '',
      serves_scope:              e.serves_scope || '',
      serve_country_codes:       e.serve_country_codes || [],
      exclude_country_codes:     e.exclude_country_codes || [],
      terms_url:                 e.terms_url || '',
      risk_disclosure_url:       e.risk_disclosure_url || '',
      client_agreement_url:      e.client_agreement_url || '',
      open_account_url:          e.open_account_url || '',
      tsbar_manual_seeds:        [
        e.entity_service_url, e.terms_url, e.risk_disclosure_url, e.client_agreement_url, e.open_account_url
      ].filter(Boolean).join('\n'),
      region_tokens:             e.region_tokens || [],
    }));
  }

  // ---------- Top-level Compliance URL polja ----------
  // Preferencija: UK → EU → ostalo → prva ne-prazna.
  const pick = (field) => {
    const list = Array.isArray(n?.legal_entities) ? n.legal_entities : [];
    const byTok = (tok) => list.find(e => Array.isArray(e.region_tokens) && e.region_tokens.includes(tok) && e[field]);
    const uk  = byTok('uk');
    const eu  = byTok('eu');
    const any = list.find(e => e[field]);
    return (uk && uk[field]) || (eu && eu[field]) || (any ? any[field] : '');
  };

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
