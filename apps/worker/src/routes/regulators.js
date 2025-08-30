import { Router } from 'express';

const router = Router();

// Za sada samo “not implemented”, ali HTTP 200 da UI ne baca 404 HTML.
router.get('/regulators', (req, res) => {
  res.json({
    ok: true,
    items: [],
    note: 'Regulators endpoint placeholder — implementira se kada dodamo sections/regulators extractor.'
  });
});

export default router;
