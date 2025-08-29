// apps/worker/src/routes/run.js
import { Router } from 'express';
import { orchestrate } from '../orchestrator.js';

const router = Router();

// 1) Plugin traži /__routes: reci mu šta postoji
router.get('/__routes', (_req, res) => {
  res.json({
    ok: true,
    routes: ['/run', '/run.js', '/run.json'], // plugin će probati ove
    sse: true,
  });
});

// 2) Legacy/tolerant rute
const PATHS = ['/run', '/run.js', '/run.json'];

/* ---------- helpers ---------- */
function firstNonEmpty(obj, keys = []) {
  for (const k of keys) {
    if (!obj) break;
    const v = obj[k];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}
function toSlugish(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
function hostFirst(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./,'').split('.')[0]; }
  catch { return ''; }
}
const aliasMap = {
  // kanonski slugovi
  'admirals':'admirals','admiralmarkets':'admirals','admiral':'admirals',
  'xtb':'xtb','icmarkets':'icmarkets',
  // domeni -> slug
  'admiralmarkets.com':'admirals','admirals.com':'admirals',
  'icmarkets.com':'icmarkets','xtb.com':'xtb',
};

function inferBroker(payload) {
  let raw = firstNonEmpty(payload, ['broker','broker_slug','slug','name','brand','broker_name','b']);
  if (raw) {
    const key = toSlugish(raw);
    return aliasMap[key] || key;
  }
  const domain = firstNonEmpty(payload, ['domain','site','website','host']);
  if (domain) {
    const d = toSlugish(domain);
    return aliasMap[d] || d.split('-')[0];
  }
  const url = firstNonEmpty(payload, ['url','link','homepage','home']);
  if (url) {
    const h = hostFirst(url);
    return aliasMap[h] || h;
  }
  return '';
}
function inferSection(payload, path) {
  let sec = firstNonEmpty(payload, ['section','sec','s','section_name']).toLowerCase();
  if (sec) return sec;
  const action = firstNonEmpty(payload, ['action','ts_action','tsbar_action']).toLowerCase();
  if (action.includes('safety')) return 'safety';
  if (action.includes('fees')) return 'fees';
  if (action.includes('platform')) return 'trading_platforms';
  if (action.includes('deposit') || action.includes('withdraw')) return 'deposits_withdrawals';
  if (action.includes('account')) return 'account_types';
  if (action.includes('research')) return 'research_tools';
  if (action.includes('education')) return 'education';
  if (action.includes('support')) return 'customer_support';
  const group = firstNonEmpty(payload, ['acf_group','tsbar_section']).toLowerCase();
  if (group) return group;
  // default (korisno za dashboard “Run” bez eksplicitne sekcije)
  if (PATHS.includes(path)) return 'safety';
  return '';
}
function sanitizeDebug(obj){
  const c = JSON.parse(JSON.stringify(obj||{}));
  for (const k of Object.keys(c)) {
    const low = k.toLowerCase();
    if (low.includes('key') || low.includes('token')) c[k] = '***';
  }
  return c;
}
function isSSE(req) {
  const v = String(firstNonEmpty({ ...req.query, ...req.body }, ['stream'])).toLowerCase();
  return v === '1' || v === 'true';
}
function sseWrite(res, event, dataObj) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
}

/* ---------- main (GET/POST, SSE + JSON) ---------- */
router.all(PATHS, async (req, res) => {
  const payload = { ...(req.query || {}), ...(req.body || {}) };
  const debug   = String(firstNonEmpty(payload, ['debug'])).trim() === '1';

  // Ako je SSE tražen, isporuči minimalni SSE stream da UI ne “visi”
  if (isSSE(req)) {
    const jobId = `tsbar-${Date.now()}`;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    sseWrite(res, 'hello', { jobId, status: 'started' });

    try {
      const broker  = inferBroker(payload);
      const section = inferSection(payload, req.path);

      if (!broker || !section) {
        // nema dovoljno za pokretanje – javi i završi stream “done”
        sseWrite(res, 'update', { level: 'warn', message: 'Missing broker/section; provide ?broker=…&section=… or homepage/domain.' });
        sseWrite(res, 'done',   { ok:false, error:'missing_params', hint:'?broker=admirals&section=safety or ?homepage=https://admiralmarkets.com' });
        return res.end();
      }

      // pokreni naš standardni orchestrator
      const result = await orchestrate({ broker, section, debug });

      if (!result || result.ok === false) {
        sseWrite(res, 'update', { level:'error', message:'not_supported' });
        sseWrite(res, 'done',   { ok:false, error:'not_supported' });
        return res.end();
      }

      // isporuči rezultat unutar SSE “done”
      sseWrite(res, 'update', { level:'info', message:`Extracted ${broker}/${section}` });
      sseWrite(res, 'done',   { ok:true, broker, section, ...result });
      return res.end();
    } catch (err) {
      sseWrite(res, 'update', { level:'error', message:String(err?.message || err) });
      sseWrite(res, 'done',   { ok:false, error:'internal_error' });
      return res.end();
    }
  }

  // JSON (fallback ili direktan GET/POST bez stream-a)
  try {
    const broker  = inferBroker(payload);
    const section = inferSection(payload, req.path);

    if (!broker || !section) {
      const details = {
        brokerResolved: broker || null,
        sectionResolved: section || null,
        receivedKeys: Object.keys(payload || {}),
      };
      if (debug) {
        details.query = sanitizeDebug(req.query);
        details.body  = sanitizeDebug(req.body);
      }
      return res.status(400).json({
        ok:false, error:'missing_params',
        hint:'Provide broker and section. e.g. ?broker=admirals&section=safety (or pass homepage/domain)',
        ...details
      });
    }

    const result = await orchestrate({ broker, section, debug });
    if (!result || result.ok === false) {
      return res.status(404).json(result || { ok:false, error:'not_supported' });
    }

    const out = { ok:true, broker, section, ...result };
    if (debug) out._debug = { path:req.path, receivedKeys:Object.keys(payload||{}) };
    return res.json(out);
  } catch (err) {
    console.error('run error:', err?.stack || err);
    return res.status(500).json({ ok:false, error:'internal_error' });
  }
});

// CORS preflight (za svaki slučaj)
router.options(PATHS, (_req, res) => res.sendStatus(204));

export default router;
