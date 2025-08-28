// packages/sections/safety/index.js
import { extractAdmiralsSafety } from '../../brokers/admirals/safety.js';

export async function extract({ brokerSlug }) {
  switch ((brokerSlug || '').toLowerCase()) {
    case 'admirals':
    case 'admiralmarkets':
    case 'admiral':
      return await extractAdmiralsSafety();
    default:
      return null;
  }
}
