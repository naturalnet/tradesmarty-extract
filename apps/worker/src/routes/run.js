// apps/worker/src/routes/run.js
import { Router } from 'express';

const router = Router();

// Minimalan in-memory jobs store (Dashboard flow)
const Jobs = new Map(); // id -> { createdAt, params }
function makeJobId() {
  return `tsbar-${Date.now()}-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}

router.get('/__routes', (_req, res) => {
  res.json({ ok: true, routes: ['/run', '/run.js', '/run.json', '/jobs/:id', '/regulators'], sse: true });
});

const PATHS = ['/run', '/run.js', '/run.json'];

router.all(PATHS, async (req, res) => {
  const q = req.query || {};
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const payload = { ...b, ...q };

  // Podržavamo: homepage (+ opcioni seeds[]), ili broker+section
  const homepage = (payload.homepage || '').toString().trim();
  const broker   = (payload.broker   || '').toString().trim();
  const section  = (payload.section  || '').toString().trim();
  let seeds = payload.seeds ?? [];
  if (typeof seeds === 'string') {
    // dozvoli CSV u query-u: ?seeds=url1,url2
    seeds = seeds.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(seeds)) seeds = [];

  if (!homepage && !(broker && section)) {
    return res.status(400).json({
      ok: false,
      error: 'missing_params',
      hint: 'Either use plugin flow (?homepage&stream=1) or pass ?broker=<slug>&section=<name>'
    });
  }

  const jobId = makeJobId();
  const params = homepage ? { homepage, seeds, section: section || 'safety' } : { broker, section, seeds };
  Jobs.set(jobId, { createdAt: Date.now(), params });
  return res.json({ ok: true, jobId, status: 'started' });
});

export { Jobs };
export default router;
