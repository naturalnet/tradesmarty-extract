// packages/sections/safety/index.js

// Ako koristiš ESM helpers:
import { extractGenericSafety } from './generic.js';

// Ako projekat koristi CommonJS require svuda, umesto gornjeg importa možeš:
// const { extractGenericSafety } = require('./generic');

function pickHomepage(ctx = {}) {
  // pokušaj da izvučeš homepage iz raznih imena polja koja orchestrator može da prosledi
  const cand = [
    ctx.homepage,
    ctx.url,
    ctx.home,          // ponekad se koristi "home"
    ctx.base,          // ponekad "base"
    ctx.website,
  ].map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);

  // normalizuj na https://...
  let hp = cand[0] || '';
  if (hp && !/^https?:\/\//i.test(hp)) hp = 'https://' + hp;
  return hp.replace(/\/+$/, ''); // bez završnog /
}

export async function extract(ctx = {}) {
  const homepage = pickHomepage(ctx);

  // 1) Ako nema homepage uopšte, vrati “minimalni” objekt da WP može da prikaže bar nešto,
  //    i da ne upadne u not_supported.
  if (!homepage) {
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

  // 2) Generički ekstraktor (pokriva sve brokere)
  const normalized = await extractGenericSafety({ homepage });

  // 3) Ako je nešto pošlo po zlu, i dalje vrati “minimalni”, nikako null
  if (!normalized || typeof normalized !== 'object') {
    return {
      description: 'Could not extract safety information from the provided homepage.',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['No regulatory pages detected or site blocked crawling.'],
      legal_entities: [],
      terms_url: '',
      risk_disclosure_url: '',
      client_agreement_url: '',
      open_account_url: homepage,
      warnings: [],
      triedPaths: [homepage],
      sources: [],
      hints: ['Check robots, WAF/CDN, or provide a specific legal/regulation URL.'],
    };
  }

  return normalized;
}

// kompatibilnost za CommonJS okruženje
try { module.exports = { extract }; } catch (_) {}
