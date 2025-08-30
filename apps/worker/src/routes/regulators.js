// apps/worker/src/routes/regulators.js
import { Router } from 'express';

const router = Router();


router.get('/regulators', (req, res) => {
  const echo = String(req.query.echo || '');
  if (echo) {
    return res.json({ ok:true, echo, hint:'stub endpoint alive' });
  }
  res.json({
    ok: true,
    items: [],
    message: 'regulators_stub',
  });
});

export default router;
