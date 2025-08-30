// apps/worker/src/routes/run.js
import { Router } from 'express';

const router = Router();

// Plugin prvo pita koje rute postoje
router.get('/__routes', (_req, res) => {
  res.json({ ok: true, routes: ['/run', '/run.js', '/run.json', '/jobs/:id', '/regulators'], sse: true });
});

// Minimalan in-memory jobs store (za Dashboard flow)
const Jobs = new Map(); // id -> { createdAt, params }
function makeJobId() {
  return `tsbar-${Date.now()}-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}
function firstNonEmpty(obj, keys = []) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

const PATHS = ['/run', '/run.js', '/run.json'];

router.all(PATHS, async (req, res) => {
  const payload = { ...(req.query || {}), ...(req.body || {}) };

  // Plugin flow (Dashboard šalje stream/homepage/sections/mode/seeds…)
  const isPluginFlow = ['stream','homepage','sections','mode','seeds','maxPages'].some(
    k => Object.prototype.hasOwnProperty.call(payload, k)
  );

  if (isPluginFlow) {
    const jobId = makeJobId();
    Jobs.set(jobId, { createdAt: Date.now(), params: payload });
    return res.json({ ok: true, jobId, status: 'started' });
  }

  // Direktan mod (curl): broker + section
  const broker  = String(firstNonEmpty(payload, ['broker','broker_slug','slug','name','brand'])).toLowerCase();
  const section = String(firstNonEmpty(payload, ['section','sec','s','section_name'])).toLowerCase();
  if (!broker || !section) {
    return res.status(400).json({
      ok: false,
      error: 'missing_params',
      hint: 'Either use plugin flow (?homepage&stream=1) or pass ?broker=<slug>&section=<name>',
    });
  }

  const jobId = makeJobId();
  Jobs.set(jobId, { createdAt: Date.now(), params: { ...payload, broker, section, direct: true } });
  return res.json({ ok: true, jobId, status: 'started' });
});

export { Jobs };
export default router;
