// apps/worker/src/routes/regulators.js
import { Router } from 'express';
const router = Router();

// Minimal stub da WP "Regulators → Load from worker" ne puca 404
router.get('/regulators', (_req, res) => {
  res.json({
    ok: true,
    items: [],
    note: 'not_implemented_yet'
  });
});

export default router;
