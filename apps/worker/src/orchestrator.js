import * as path from 'node:path';
import * as url from 'node:url';


const __dirname = path.dirname(url.fileURLToPath(import.meta.url));


export async function orchestrate({ broker, section }) {
// SECTION module
const sectionModPath = path.join(__dirname, '../../..', 'packages/sections', section, 'index.js');
let sectionMod;
try {
sectionMod = await import(url.pathToFileURL(sectionModPath));
} catch {
return null; // section not implemented
}


// Extract normalized
const normalized = await sectionMod.extract({ brokerSlug: broker, ctx: {} });
if (!normalized) return null;


// Map to ACF (if mapping exists)
const acfMapPath = path.join(__dirname, '../../..', 'packages/acf-map', `${section}.js`);
let acfMapper;
try { acfMapper = await import(url.pathToFileURL(acfMapPath)); } catch { acfMapper = null; }


const acf = acfMapper?.toACF ? acfMapper.toACF(normalized) : null;


return { normalized, acf };
}
