// apps/worker/src/orchestrator.js
import * as path from 'node:path';
import * as url from 'node:url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Orkestrator za sekcije: prosleđuje broker slug + kontekst (homepage, seeds, debug)
 * i mapira normalized -> acf preko packages/acf-map/<section>.js
 */
export async function orchestrate({ broker, section, homepage, seeds, debug }) {
  const sectionModPath = path.join(__dirname, '../../..', 'packages/sections', section, 'index.js');

  let sectionMod, sectionErr;
  try {
    sectionMod = await import(url.pathToFileURL(sectionModPath));
  } catch (e) {
    sectionErr = e;
  }
  if (!sectionMod?.extract) {
    const out = { ok: false, error: 'section_module_missing', section, sectionModPath, sectionErr: String(sectionErr) };
    return debug ? out : out; // i u non-debugu vrati jasan razlog
  }

  // prosledi kontekst
  const ctx = {
    homepage: homepage || '',
    seeds: Array.isArray(seeds) ? seeds : (seeds ? [seeds] : []),
    debug: !!debug
  };

  // Izvuci normalizovane podatke iz sekcijskog adaptera
  const normalized = await sectionMod.extract({ brokerSlug: (broker || '').toLowerCase(), ctx });

  // Ako adapter vrati "strukturisanu grešku", propagiraj
  if (normalized && normalized.ok === false) {
    return { ok: false, ...normalized, section, broker };
  }

  // Ako nije uspeo – not_supported sa hintovima koje je sekcija skupila
  if (!normalized) {
    return { ok: false, error: 'not_supported', section, broker, reason: 'extract_returned_null' };
  }

  // ACF mapiranje
  const acfMapPath = path.join(__dirname, '../../..', 'packages/acf-map', `${section}.js`);
  let acfMapper, acfErr;
  try {
    acfMapper = await import(url.pathToFileURL(acfMapPath));
  } catch (e) {
    acfErr = e;
  }

  const acf = acfMapper?.toACF ? acfMapper.toACF(normalized) : null;

  return {
    ok: true,
    section,
    broker,
    version: { section: `${section}@1`, schema: '2025-08-30' },
    normalized,
    acf,
    mapError: (!acf && acfErr) ? String(acfErr) : undefined
  };
}
