// packages/sections/safety/index.js
import { extractGenericSafety } from './generic.js';
// (po želji možeš ostaviti specifične – ali nisu obavezni)
// import { extractAdmiralsSafety } from '../../brokers/admirals/safety.js';
// import { extractEtoroSafety }     from '../../brokers/etoro/safety.js';

export async function extract({ homepage, brokerSlug }) {
  // 1) Ako želiš zadržati specifične: prvo probaj specifičan → fallback na generic
  // switch ((brokerSlug || '').toLowerCase()) {
  //   case 'admirals':
  //   case 'admiralmarkets':
  //   case 'admiral':
  //     return await extractAdmiralsSafety();
  //   case 'etoro':
  //     return await extractEtoroSafety();
  // }

  // 2) Univerzalni fallback pokriva sve
  return await extractGenericSafety({ homepage });
}
