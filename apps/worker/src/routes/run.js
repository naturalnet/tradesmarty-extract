// apps/worker/src/routes/run.js
import { Router } from 'express';

const router = Router();

// Plugin prvo zove ovo – reci mu šta postoji
router.get('/__routes', (_req, res) => {
  res.json({ ok: true, routes: ['/run', '/run.js', '/run.json', '/jobs/:id'], sse: true });
});

// In–memory "queue" (samo za kompatibilnost sa pluginom)
const Jobs = new Map(); // id -> { createdAt, params }

function makeJobId() {
  return `tsbar-${Date.now()}-${Math.floor(Math.random()*1e6).toString().padStart(6,'0')}`;
}

function firstNonEmpty(obj, keys = []) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

// /run i aliasi – ako plugin traži jobId → kreiramo posao i vraćamo ga
const PATHS = ['/run', '/run.js', '/run.json'];

router.all(PATHS, async (req, res) => {
  const payload = { ...(req.query || {}), ...(req.body || {}) };

  // Ako plugin traži streaming/polling (ima stream/homepage/sections/mode/seeds) → radimo job flow
  const isPluginFlow = ['stream','homepage','sections','mode','seeds','maxPages'].some(
    k => Object.prototype.hasOwnProperty.call(payload, k)
  );

  if (isPluginFlow) {
    const jobId = makeJobId();
    // Sačuvaj sve parametre (plugin šalje dosta opcija; koristićemo ih kasnije u /jobs/:id)
    Jobs.set(jobId, { createdAt: Date.now(), params: payload });
    return res.json({ ok: true, jobId, status: 'started' });
  }

  // Inače – stari "direktan" mod zahteva broker+section (zadržavamo zbog cURL testova)
  const broker  = String(firstNonEmpty(payload, ['broker','broker_slug','slug','name','brand'])).toLowerCase();
  const section = String(firstNonEmpty(payload, ['section','sec','s','section_name'])).toLowerCase();

  if (!broker || !section) {
    return res.status(400).json({
      ok: false,
      error: 'missing_params',
      hint: 'Either use plugin flow (?homepage&stream=1) or pass ?broker=<slug>&section=<name>'
    });
  }

  // Da bismo ostali lightweight, direktan mod prebacili smo u /jobs/:id (single-shot).
  // Napravi ephemeral job i uputi klijenta na /jobs/:id (nije neophodno, ali je urednije).
  const jobId = makeJobId();
  Jobs.set(jobId, { createdAt: Date.now(), params: { ...payload, broker, section, direct: true } });
  return res.json({ ok: true, jobId, status: 'started' });
});

// Exportujemo Jobs store da ga koristi /jobs/:id
export { Jobs };
export default router;
