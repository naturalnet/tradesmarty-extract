// apps/worker/src/routes/run.js
import { Router } from 'express';

export const Jobs = new Map(); // id -> { id, createdAt, params }

const router = Router();

// Plugin i ti (debug) možete da proverite koje rute postoje
router.get('/__routes', (_req, res) => {
  res.json({
    ok: true,
    routes: ['/run', '/run.js', '/run.json', '/jobs/:id', '/regulators'],
    sse: true,
  });
});

function makeJobId() {
  return `tsbar-${Date.now()}-${Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0')}`;
}

function firstNonEmpty(obj, keys = []) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const s = String(obj[k] ?? '').trim();
      if (s) return s;
    }
  }
  return '';
}

const PATHS = ['/run', '/run.js', '/run.json'];

/**
 * /run, /run.js, /run.json
 * - Plugin flow: ?homepage=&stream=1&mode=&sections=&seeds=&maxPages=...
 *   → kreira jobId; /jobs/:id će odraditi extract i vratiti normalized/acf
 * - Direct flow: ?broker=<slug>&section=<name>
 *   → takođe kreira jobId i onda /jobs/:id izvršava posao
 */
router.all(PATHS, (req, res) => {
  const payload =
    (req.method === 'POST' ? { ...(req.query || {}), ...(req.body || {}) } : { ...(req.query || {}) });

  // detekcija plugin flow-a
  const isPluginFlow = ['stream', 'homepage', 'sections', 'mode', 'seeds', 'maxPages', 'spin', 'serp'].some(
    (k) => Object.prototype.hasOwnProperty.call(payload, k)
  );

  const baseParams = { debug: String(payload.debug || '').trim() };

  if (isPluginFlow) {
    const jobId = makeJobId();
    Jobs.set(jobId, { id: jobId, createdAt: Date.now(), params: { ...baseParams, ...payload, flow: 'plugin' } });
    return res.json({ ok: true, jobId, status: 'started' });
  }

  // direct flow zahteva broker + section
  const broker = String(firstNonEmpty(payload, ['broker', 'broker_slug', 'slug', 'name', 'brand'])).toLowerCase();
  const section = String(firstNonEmpty(payload, ['section', 'sec', 's', 'section_name'])).toLowerCase();

  if (!broker || !section) {
    return res.status(400).json({
      ok: false,
      error: 'missing_params',
      hint: 'Use plugin flow (?homepage&stream=1) or pass ?broker=<slug>&section=<name>',
      receivedKeys: Object.keys(payload),
    });
  }

  const jobId = makeJobId();
  Jobs.set(jobId, {
    id: jobId,
    createdAt: Date.now(),
    params: { ...baseParams, ...payload, broker, section, flow: 'direct' },
  });
  return res.json({ ok: true, jobId, status: 'started' });
});

export default router;
