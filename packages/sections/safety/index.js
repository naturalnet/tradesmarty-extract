// packages/sections/safety/index.js
import { extractAdmiralsSafety } from '../../brokers/admirals/safety.js';
import { extractGenericSafety } from './generic.js';

/**
 * Sekcijski extractor:
 * - poznati brokeri (admirals) koriste specifičan extractor
 * - ostali brokeri koriste generički extractor zasnovan na homepage/seeds
 */
export async function extract({ brokerSlug, ctx }) {
  const slug = (brokerSlug || '').toLowerCase();

  // 1) Specifični adapteri (ako imamo)
  switch (slug) {
    case 'admirals':
    case 'admiralmarkets':
    case 'admiral':
      return await extractAdmiralsSafety();
  }

  // 2) Generički fallback — zahteva homepage ili seeds
  if (!ctx?.homepage && !(Array.isArray(ctx?.seeds) && ctx.seeds.length)) {
    return { ok: false, error: 'not_supported', reason: 'no_homepage_or_seeds', hints: ['Provide homepage or add seeds[] URLs'] };
  }

  // Generički pokušaj (deterministički discovery + parsiranje)
  const out = await extractGenericSafety({ homepage: ctx.homepage, seeds: ctx.seeds || [] });
  return out;
}
