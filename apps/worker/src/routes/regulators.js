// apps/worker/src/routes/regulators.js
import { Router } from 'express';

const router = Router();

/**
 * GET /regulators
 * Minimal stub da WP UI ne dobija 404. Kasnije ovde možemo spajati
 * brokers/*/config.yaml ili izvučene regulatorne entitete iz “safety” sekcije.
 */
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
