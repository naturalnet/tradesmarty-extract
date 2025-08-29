// apps/worker/src/routes/run.js
import { Router } from 'express';
import { orchestrate } from '../orchestrator.js';

const router = Router();

// Support legacy callers that hit /run.js or /run.json (in addition to /run)
const PATHS = ['/run', '/run.js', '/run.json'];

router.get(PATHS, async (req, res) => {
  try {
    const broker  = (req.query.broker || '').toString().trim().toLowerCase();
    const section = (req.query.section || '').toString().trim().toLowerCase();
    const debug   = String(req.query.debug || '').trim() === '1';

    if (!broker || !section) {
      return res
        .status(400)
        .json({ ok: false, error: 'missing_params', hint: 'use ?broker=<slug>&section=<name>' });
    }

    const result = await orchestrate({ broker, section, debug });

    if (!result || result.ok === false) {
      return res.status(404).json(result || { ok: false, error: 'not_supported' });
    }

    return res.json({ ok: true, broker, section, ...result });
  } catch (err) {
    console.error('run error:', err?.stack || err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// Allow CORS preflight if someone OPTIONS this path
router.options(PATHS, (_req, res) => res.sendStatus(204));

export default router;
