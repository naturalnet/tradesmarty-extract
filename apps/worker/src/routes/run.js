import { Router } from 'express';
import { orchestrate } from '../orchestrator.js';


const router = Router();


// apps/worker/src/routes/run.js
router.get('/run', async (req, res) => {
  try {
    const broker  = (req.query.broker || '').toString().toLowerCase();
    const section = (req.query.section || '').toString().toLowerCase();
    const debug   = req.query.debug === '1';

    if (!broker || !section) return res.status(400).json({ ok:false, error:'missing_params' });

    const result = await orchestrate({ broker, section, debug });
    if (!result || result.ok === false) {
      return res.status(404).json(result || { ok:false, error:'not_supported' });
    }
    res.json({ ok:true, broker, section, ...result });
  } catch (err) {
    res.status(500).json({ ok:false, error:'internal_error' });
  }
});



export default router;
