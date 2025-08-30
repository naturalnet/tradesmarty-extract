// apps/worker/src/orchestrator.js
import * as path from 'node:path';
import * as url from 'node:url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export async function orchestrate({ broker, section, debug }) {
  const sectionModPath = path.join(__dirname, '../../..', 'packages/sections', section, 'index.js');
  let sectionMod, sectionErr;
  try {
    sectionMod = await import(url.pathToFileURL(sectionModPath));
  } catch (e) {
    sectionErr = e;
  }
  if (!sectionMod?.extract) {
    return debug ? { ok:false, error:'section_module_missing', sectionModPath, sectionErr: String(sectionErr) } : null;
  }

  const normalized = await sectionMod.extract({ brokerSlug: broker, ctx: {} });
  if (!normalized) return debug ? { ok:false, error:'extract_returned_null' } : null;

  const acfMapPath = path.join(__dirname, '../../..', 'packages/acf-map', `${section}.js`);
  let acfMapper;
  try { acfMapper = await import(url.pathToFileURL(acfMapPath)); } catch { acfMapper = null; }
  const acf = acfMapper?.toACF ? acfMapper.toACF(normalized) : null;

  return { normalized, acf };
}
