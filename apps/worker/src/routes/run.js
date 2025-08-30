// apps/worker/src/routes/run.js
import { Router } from 'express';
import * as crypto from 'node:crypto';
import { orchestrate } from '../orchestrator.js';

const router = Router();

// In-memory job store
// id -> { state: 'queued'|'running'|'succeeded'|'failed',
//         params, result, error, createdAt, updatedAt }
export const Jobs = new Map();

function makeJobId() {
  return `tsbar-${Date.now()}-${crypto.randomInt(1e9)}`;
}

function now() { return Date.now(); }

async function processJob(id) {
  const job = Jobs.get(id);
  if (!job) return;
  if (job.state !== 'queued') return;

  job.state = 'running';
  job.updatedAt = now();

  const { homepage, broker, section, seeds } = job.params;
  try {
    const out = await orchestrate({
      broker: (broker || '').toLowerCase(),
      section: section || 'safety',
      homepage: homepage || '',
      seeds: Array.isArray(seeds) ? seeds : (seeds ? [seeds] : []),
      debug: true
    });

    if (!out?.ok) {
      job.state  = 'failed';
      job.error  = {
        ok: false,
        error: out?.error || 'not_supported',
        reason: out?.reason || 'unknown',
        tried: out?.triedPaths || out?.tried || [],
        hints: out?.hints || []
      };
      job.updatedAt = now();
      return;
    }

    job.state  = 'succeeded';
    job.result = {
      ok: true,
      broker: (broker || '').toLowerCase(),
      section: section || 'safety',
      normalized: out.normalized,
      acf: out.acf
    };
    job.updatedAt = now();
  } catch (e) {
    job.state  = 'failed';
    job.error  = { ok: false, error: 'internal_error', message: String(e?.message || e) };
    job.updatedAt = now();
  }
}

router.get('/__routes', (_req, res) => {
  res.json({ ok: true, routes: ['/run', '/jobs/:id'] });
});

router.all(['/run', '/run.js', '/run.json'], async (req, res) => {
  const q = req.query || {};
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const payload = { ...b, ...q };

  const homepage = (payload.homepage || '').toString().trim();
  const broker   = (payload.broker   || '').toString().trim();
  const section  = (payload.section  || '').toString().trim() || 'safety';

  let seeds = payload.seeds ?? [];
  if (typeof seeds === 'string') seeds = seeds.split(',').map(s => s.trim()).filter(Boolean);
  if (!Array.isArray(seeds)) seeds = [];

  if (!homepage && !(broker && section)) {
    return res.status(400).json({
      ok: false,
      error: 'missing_params',
      hint: 'Provide ?homepage or both ?broker=&section='
    });
  }

  const jobId = makeJobId();
  Jobs.set(jobId, {
    state: 'queued',
    params: { homepage, broker, section, seeds },
    result: null,
    error: null,
    createdAt: now(),
    updatedAt: now()
  });

  // pokreni u pozadini (ne blokira response)
  setImmediate(() => processJob(jobId));

  return res.json({ ok: true, jobId, status: 'started' });
});

export default router;
