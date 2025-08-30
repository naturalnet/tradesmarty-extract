// apps/worker/src/routes/jobs.js
import { Router } from 'express';
import { Jobs } from './run.js';

const router = Router();

router.all('/jobs/:id', async (req, res) => {
  const id = (req.params?.id || '').toString();
  const job = Jobs.get(id);
  if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });

  if (job.state === 'succeeded') return res.json(job.result);
  if (job.state === 'failed')    return res.status(400).json(job.error);

  // queued / running → brz status za poll
  return res.json({ ok: true, status: job.state, updatedAt: job.updatedAt });
});

export default router;
