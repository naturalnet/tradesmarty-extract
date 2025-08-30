// apps/worker/src/orchestrator.js
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Orchestrate extraction for a given broker+section, map to ACF, and (optionally) upsert to WP.
 *
 * @param {Object} opts
 * @param {string} opts.broker        - broker slug (npr. "admirals")
 * @param {string} opts.section       - sekcija (npr. "safety", "fees", ...)
 * @param {boolean} [opts.debug]
 * @param {string}  [opts.mode]       - ako je "deep" → radi ingest
 * @param {boolean} [opts.ingest]     - forsiraj ingest (true/false)
 * @param {string}  [opts.homepage]   - početni URL brokera (prosledi iz plugina)
 * @param {Array}   [opts.seeds]      - opciono: lista seed putanja/URL-ova
 */
export async function orchestrate(opts) {
  const {
    broker,
    section,
    debug = false,
    mode,
    ingest,
    homepage,
    seeds = []
  } = (opts || {});

  const t0 = Date.now();

  // 1) Učitaj sekcijski extractor
  const sectionModPath = path.join(__dirname, '../../..', 'packages/sections', section, 'index.js');
  let sectionMod, sectionErr;
  try {
    sectionMod = await import(url.pathToFileURL(sectionModPath));
  } catch (e) {
    sectionErr = e;
  }
  if (!sectionMod?.extract) {
    return debug
      ? { ok: false, error: 'section_module_missing', sectionModPath, sectionErr: String(sectionErr) }
      : null;
  }

  // 2) Ekstrakcija → normalized model (ACF-neutral)
  const normalized = await sectionMod.extract({
    brokerSlug: broker,
    ctx: { homepage, seeds }
  });
  if (!normalized) {
    return debug ? { ok: false, error: 'extract_returned_null' } : null;
  }

  // 3) Mapiranje u ACF (ako postoji mapper za tu sekciju)
  const acfMapPath = path.join(__dirname, '../../..', 'packages/acf-map', `${section}.js`);
  let acfMapper;
  try {
    acfMapper = await import(url.pathToFileURL(acfMapPath));
  } catch {
    acfMapper = null;
  }
  const acf = acfMapper?.toACF ? acfMapper.toACF(normalized) : null;

  // 4) (Opciono) Ingest u WordPress
  //    Uslovi: ingest==true ILI mode=="deep" ILI WP_FORCE_INGEST=1
  const shouldIngest =
    ingest === true ||
    String(mode || '').toLowerCase() === 'deep' ||
    process.env.WP_FORCE_INGEST === '1';

  let upsert = null;
  let upsertErr = null;

  if (shouldIngest) {
    try {
      // Lazy import da ne povlačimo axios kad nije potrebno
      const writerPath = path.join(__dirname, '../../..', 'packages/writer-wp', 'index.js');
      const writer = await import(url.pathToFileURL(writerPath));

      if (!writer?.upsertCanonical) {
        upsert = { ok: false, error: 'writer_missing', hint: 'packages/writer-wp/index.js → export upsertCanonical' };
      } else {
        // "canonical" je normalized sekcijski payload; WP bridge ga mapira u odgovarajuća ACF polja
        const proofs = normalized?.__proofs || {}; // ako extractor vraća izvore; opcionalno
        upsert = await writer.upsertCanonical({
          homepage: homepage || normalized?.homepage || '',
          canonical: normalized,
          proofs
        });
      }
    } catch (e) {
      upsertErr = String(e?.message || e);
      upsert = { ok: false, error: 'wp_upsert_exception', details: upsertErr };
    }
  }

  const t1 = Date.now();

  return {
    ok: true,
    normalized,
    acf,
    upsert,                         // null ako ingest nije tražen; inače rezultat iz WP
    meta: {
      broker,
      section,
      homepage: homepage || null,
      seedsCount: Array.isArray(seeds) ? seeds.length : 0,
      ms: t1 - t0,
      ingested: !!shouldIngest,
      writerError: upsertErr || null
    }
  };
}
