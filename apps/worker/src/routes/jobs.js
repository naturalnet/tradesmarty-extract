// apps/worker/src/routes/jobs.js
import { Router } from 'express';
import { Jobs } from './run.js';
import { orchestrate } from '../orchestrator.js';

const router = Router();

async function runJobOnce(_id, params) {
  const { homepage, broker, section, seeds } = params || {};

  // Ako je dat homepage a nije sekcija, defaultuj na safety (MVP)
  const sec = section || 'safety';
  const bkr = (broker || '').toLowerCase();

  const out = await orchestrate({
    broker: bkr,
    section: sec,
    homepage,
    seeds,
    debug: true
  });

  if (!out?.ok) {
    // Ulepšaj “not_supported” poruku
    const reason  = out?.reason || 'unknown';
    const hints   = out?.hints  || [];
    const tried   = out?.triedPaths || out?.tried || [];
    return {
      ok: false,
      error: out?.error || 'not_supported',
      section: sec,
      broker: bkr,
      reason,
      tried,
      hints
    };
  }

  return {
    ok: true,
    broker: bkr,
    section: sec,
    normalized: out.normalized,
    acf: out.acf
  };
}

// GET/POST /jobs/:id — JSON polling (SSE možemo dodati kasnije)
router.all('/jobs/:id', async (req, res) => {
  const id = (req.params?.id || '').toString();
  const meta = Jobs.get(id);
  if (!meta) return res.status(404).json({ ok: false, error: 'job_not_found' });

  try {
    const result = await runJobOnce(id, meta.params);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

export default router;
