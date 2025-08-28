// packages/brokers/admirals/safety.js
import { fetchOK, loadCheerio } from '../../core/http.js';

const BASE = 'https://admiralmarkets.com';

async function discoverRestrictions() {
  try {
    const $ = await loadCheerio(`${BASE}/start-trading/documents`);
    const footerText = $('footer').text().toLowerCase();
    const hasBelgium = footerText.includes('belgium');
    return { excludeBE: hasBelgium };
  } catch {
    return { excludeBE: true };
  }
}

function docsFor(reg) {
  const D = {
    fca:  { terms:`${BASE}/utils/pdf/start-trading/documents/terms-of-securities-trading.pdf?regulator=fca`,
            risk: `${BASE}/start-trading/documents/product-information-docs/risk-disclosure?regulator=fca`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`, svc:`${BASE}/?regulator=fca` },
    cysec:{ terms:`${BASE}/start-trading/documents`, risk:`${BASE}/risk-disclosure`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`, svc:`${BASE}/` },
    asic: { terms:`${BASE}/utils/pdf/start-trading/documents/account-terms.pdf`,
            risk:`${BASE}/utils/pdf/start-trading/documents/product-disclosure.pdf`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`, svc:`${BASE}/` },
    fsca: { terms:`${BASE}/start-trading/documents`, risk:`${BASE}/risk-disclosure`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`, svc:`${BASE}/?regulator=fsca` },
    jsc:  { terms:`${BASE}/utils/pdf/start-trading/documents/terms-and-conditions.pdf?regulator=jsc`,
            risk:`${BASE}/utils/pdf/start-trading/documents/securities-trading-risk-disclosure.pdf?regulator=jsc`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`, svc:`${BASE}/?regulator=jsc` },
    cma:  { terms:`${BASE}/start-trading/documents`, risk:`${BASE}/risk-disclosure`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`, svc:`${BASE}/` },
    fsa:  { terms:`${BASE}/start-trading/documents`, risk:`${BASE}/risk-disclosure`,
            center:`${BASE}/start-trading/documents`, open:`${BASE}/start-trading`,
            svc:`${BASE}/education/faq/regulation` }
  };
  return D[reg];
}

/**
 * SOFT validation:
 * - Never blanks a URL if remote check fails (CDNs often block bots/HEAD/PDFs).
 * - Only annotates a hint field like `_unverified` which we ignore in ACF mapping.
 */
async function softValidateLinks(o) {
  for (const k of ['terms','risk','center','open','svc']) {
    if (!o[k] || !/^https?:\/\//i.test(o[k])) continue;
    const ok = await fetchOK(o[k]);
    if (!ok) o[`${k}_unverified`] = true;
  }
}

export async function extractAdmiralsSafety() {
  const restr = await discoverRestrictions();
  const excludeBE = restr.excludeBE ? ['BE'] : [];

  const entities = [
    { name:'Admiral Markets UK Ltd', cc:'UK',          reg:'FCA',  level:'Tier-1', prot:'FSCS up to £85,000', nbp:'Yes (retail, FCA rules)',          scope:'COUNTRY_LIST', serve:['GB'], excl: excludeBE, region:['uk'], key:'fca'  },
    { name:'Admirals Europe Ltd',    cc:'EU/EEA',      reg:'CySEC',level:'Tier-2', prot:'ICF up to €20,000',  nbp:'Yes (retail; policy)',             scope:'EEA',          serve:[],    excl: excludeBE, region:['eu'], key:'cysec'},
    { name:'Admirals AU Pty Ltd',    cc:'Australia',   reg:'ASIC', level:'Tier-1', prot:'N/A',               nbp:'Yes (retail; ASIC CFD order)',     scope:'COUNTRY_LIST', serve:['AU'], excl:[],         region:['au'], key:'asic' },
    { name:'Admirals SA (Pty) Ltd',  cc:'South Africa',reg:'FSCA', level:'Tier-2', prot:'N/A',               nbp:'Yes (policy)',                     scope:'COUNTRY_LIST', serve:['ZA'], excl:[],         region:['row'],key:'fsca' },
    { name:'Admiral Markets AS Jordan Ltd', cc:'Jordan', reg:'JSC', level:'Tier-3', prot:'N/A',             nbp:'Yes (policy)',                     scope:'COUNTRY_LIST', serve:['JO'], excl:[],         region:['row'],key:'jsc'  },
    { name:'Admirals KE Limited',    cc:'Kenya',       reg:'CMA',  level:'Tier-3', prot:'N/A',               nbp:'Yes (policy)',                     scope:'COUNTRY_LIST', serve:['KE'], excl:[],         region:['ke'], key:'cma'  },
    { name:'Admirals SC Ltd',        cc:'Rest of World',reg:'FSA', level:'Tier-3', prot:'N/A',               nbp:'Yes (policy)',                     scope:'GLOBAL',       serve:[],    excl:[],         region:['row'],key:'fsa'  }
  ];

  // attach docs (no hard blanking)
  for (const e of entities) {
    const d = docsFor(e.key);
    await softValidateLinks(d); // keep original URLs even if unverified
    e.docs = d;
  }

  return {
    description: 'Admirals operates multiple regulated entities (UK/EU/AU/ZA/JO/KE/SC). FSCS (UK) up to £85k; ICF (EU) up to €20k. Retail NBP in UK/EU/AU; policies elsewhere.',
    is_regulated: 'FCA (FRN 595450), CySEC (201/13), ASIC (AFSL 410681), FSCA (FSP 51311), JSC (JO), CMA (KE), FSA (SC).',
    safety_highlights: [
      'Retail negative balance protection (UK/EU/AU).',
      'Public Terms/Risk/Policy documents per entity.'
    ],
    safety_caveats: [
      'Outside UK/EU no statutory compensation fund (ZA/JO/KE/SC).',
      'Beware of clone-firm scams — verify official domains.'
    ],
    legal_entities: entities.map(e => ({
      entity_name: e.name,
      country_of_clients: e.cc,
      regulator_abbreviation: e.reg,
      regulator: ({
        FCA:'Financial Conduct Authority',
        CySEC:'Cyprus Securities and Exchange Commission',
        ASIC:'Australian Securities & Investments Commission',
        FSCA:'Financial Sector Conduct Authority',
        JSC:'Jordan Securities Commission',
        CMA:'Capital Markets Authority (Kenya)',
        FSA:'Financial Services Authority (Seychelles)'
      }[e.reg]) || e.reg,
      regulation_level: e.level,
      investor_protection_amount: e.prot,
      negative_balance_protection: e.nbp,
      entity_service_url: e.docs.svc,
      serves_scope: e.scope,
      serve_country_codes: e.serve,
      exclude_country_codes: e.excl,
      terms_url: e.docs.terms,
      risk_disclosure_url: e.docs.risk,
      client_agreement_url: e.docs.center,
      open_account_url: e.docs.open,
      region_tokens: e.region
    })),
    warnings: [
      { warning_name: 'FCA clone warning — Admiral Trading (clone)', warning_url: 'https://www.fca.org.uk/news/warnings/admiral-trading-clone' },
      { warning_name: 'FCA clone warning — fxsadmiral.com',          warning_url: 'https://www.fca.org.uk/news/warnings/fxsadmiralcom' }
    ]
  };
}
