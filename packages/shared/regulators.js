// packages/shared/regulators.js
export const REGULATORS = [
  // Tier-1
  { abbr: 'FCA',   name: 'Financial Conduct Authority',          countryGuess: 'UK',           level: 'Tier-1',
    patterns: [/FCA\b/i, /Financial Conduct Authority/i] },
  { abbr: 'ASIC',  name: 'Australian Securities & Investments Commission', countryGuess: 'Australia', level: 'Tier-1',
    patterns: [/ASIC\b/i, /Australian Securities/i] },
  { abbr: 'SEC',   name: 'U.S. Securities and Exchange Commission', countryGuess: 'United States', level: 'Tier-1',
    patterns: [/\bSEC\b/i, /Securities and Exchange Commission/i] },
  { abbr: 'FINRA', name: 'Financial Industry Regulatory Authority', countryGuess: 'United States', level: 'Tier-1',
    patterns: [/FINRA\b/i, /Financial Industry Regulatory Authority/i] },
  { abbr: 'SIPC',  name: 'Securities Investor Protection Corporation', countryGuess: 'United States', level: 'Tier-1',
    patterns: [/SIPC\b/i, /Securities Investor Protection Corporation/i] },
  { abbr: 'FINMA', name: 'Swiss Financial Market Supervisory Authority', countryGuess: 'Switzerland', level: 'Tier-1',
    patterns: [/FINMA\b/i, /Swiss Financial Market Supervisory/i] },
  { abbr: 'BaFin', name: 'Federal Financial Supervisory Authority (Germany)', countryGuess: 'Germany', level: 'Tier-1',
    patterns: [/BaFin\b/i, /Federal Financial Supervisory Authority/i] },

  // Tier-2
  { abbr: 'CySEC', name: 'Cyprus Securities and Exchange Commission', countryGuess: 'EU/EEA',    level: 'Tier-2',
    patterns: [/CySEC\b/i, /Cyprus Securities and Exchange Commission/i, /\(109\/\d+\)/i] },
  { abbr: 'MFSA',  name: 'Malta Financial Services Authority',   countryGuess: 'EU/EEA',        level: 'Tier-2',
    patterns: [/MFSA\b/i, /Malta Financial Services Authority/i] },
  { abbr: 'FSRA',  name: 'ADGM – Financial Services Regulatory Authority', countryGuess: 'Middle East', level: 'Tier-2',
    patterns: [/FSRA\b/i, /Abu Dhabi Global Market/i, /ADGM/i] },
  { abbr: 'DFSA',  name: 'Dubai Financial Services Authority',    countryGuess: 'Middle East',   level: 'Tier-2',
    patterns: [/DFSA\b/i, /Dubai Financial Services Authority/i] },
  { abbr: 'GFSC',  name: 'Gibraltar Financial Services Commission', countryGuess: 'Gibraltar',   level: 'Tier-2',
    patterns: [/GFSC\b/i, /Gibraltar Financial Services Commission/i] },
  { abbr: 'MAS',   name: 'Monetary Authority of Singapore',       countryGuess: 'Singapore',     level: 'Tier-2',
    patterns: [/MAS\b/i, /Monetary Authority of Singapore/i] },

  // Tier-3
  { abbr: 'FSCA',  name: 'Financial Sector Conduct Authority',    countryGuess: 'South Africa',  level: 'Tier-2',
    patterns: [/FSCA\b/i, /Financial Sector Conduct Authority/i] },
  { abbr: 'FSA',   name: 'Financial Services Authority (Seychelles)', countryGuess: 'Rest of World', level: 'Tier-3',
    patterns: [/\bFSA\b/i, /Seychelles/i, /Financial Services Authority/i] },
  { abbr: 'JSC',   name: 'Jordan Securities Commission',          countryGuess: 'Jordan',        level: 'Tier-3',
    patterns: [/JSC\b/i, /Jordan Securities Commission/i] },
  { abbr: 'CMA',   name: 'Capital Markets Authority (Kenya)',     countryGuess: 'Kenya',         level: 'Tier-3',
    patterns: [/CMA\b/i, /Capital Markets Authority/i] },
  { abbr: 'IFSC',  name: 'International Financial Services Commission (Belize)', countryGuess: 'Belize', level: 'Tier-3',
    patterns: [/IFSC\b/i, /International Financial Services Commission/i] },
  { abbr: 'FSC BVI', name: 'Financial Services Commission (BVI)', countryGuess: 'BVI',           level: 'Tier-3',
    patterns: [/FSC\b/i, /BVI/i] },
  { abbr: 'FSC MAURITIUS', name: 'Financial Services Commission (Mauritius)', countryGuess: 'Mauritius', level: 'Tier-3',
    patterns: [/FSC\b/i, /Mauritius/i] },

  // Derivatives (US)
  { abbr: 'CFTC',  name: 'Commodity Futures Trading Commission',  countryGuess: 'United States', level: 'Tier-1',
    patterns: [/CFTC\b/i, /Commodity Futures Trading Commission/i] },
  { abbr: 'NFA',   name: 'National Futures Association',          countryGuess: 'United States', level: 'Tier-1',
    patterns: [/NFA\b/i, /National Futures Association/i] },
];

export function findRegulatorsInText(text) {
  const found = [];
  for (const reg of REGULATORS) {
    if (reg.patterns.some(rx => rx.test(text))) {
      found.push(reg);
    }
  }
  // dedupe by abbr
  const byAbbr = {};
  for (const r of found) byAbbr[r.abbr] = r;
  return Object.values(byAbbr);
}

export function tierFor(abbr) {
  const r = REGULATORS.find(x => x.abbr.toUpperCase() === abbr.toUpperCase());
  return r?.level || '';
}

export function regionGuessFor(abbr) {
  const r = REGULATORS.find(x => x.abbr.toUpperCase() === abbr.toUpperCase());
  return r?.countryGuess || '';
}
