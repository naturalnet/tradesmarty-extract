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

// ---- helpers ---------------------------------------------------------------

function normalizeHomepage(raw) {
  let hp = (raw || '').toString().trim();
  if (!hp) return '';
  // dodaj protokol ako fali
  if (!/^https?:\/\//i.test(hp)) hp = 'https://' + hp;
  try {
    const u = new URL(hp);
    // bez trailing slash-a
    u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return hp.replace(/\/+$/, '');
  }
}

function pickHomepage(payload = {}) {
  const candidates = [
    payload.homepage,
    payload.url,
    payload.website,
    payload.home,
    payload.base
  ];
  for (const c of candidates) {
    const n = normalizeHomepage(c);
    if (n) return n;
  }
  return '';
}

function parseSeeds(payload = {}) {
  let seeds = payload.seeds ?? payload.seed ?? [];
  if (typeof seeds === 'string') {
    seeds = seeds
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(seeds)) seeds = [];
  // osiguraj da su to relativne ili apsolutne putanje bez duplikata
  return Array.from(new Set(seeds));
}

// ---- job processor ---------------------------------------------------------

async function processJob(id) {
  const job = Jobs.get(id);
  if (!job) return;
  if (job.state !== 'queued') return;

  job.state = 'running';
  job.updatedAt = now();

  const { homepage, url, broker, section, seeds } = job.params;

  try {
    const ctx = {
      broker: (broker || '').toLowerCase(),
      section: section || 'safety',
      homepage: homepage || '',
      url: url || homepage || '',
      seeds: Array.isArray(seeds) ? seeds : [],
      debug: true
    };

    // debug u server logu da uvek vidimo šta je stiglo
    console.log('[RUN] ctx =', ctx);

    const out = await orchestrate(ctx);

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

// ---- routes ----------------------------------------------------------------

router.get('/__routes', (_req, res) => {
  res.json({ ok: true, routes: ['/run', '/run.js', '/run.json', '/run/deep', '/jobs/:id'] });
});

// zajednički handler za /run i /run/deep
async function handleRun(req, res) {
  const q = req.query || {};
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const payload = { ...b, ...q };

  const homepage = pickHomepage(payload); // koristi homepage/url/website/home/base
  const url      = homepage;              // eksplicitno prosleđujemo i url
  const broker   = (payload.broker || '').toString().trim();
  const section  = (payload.section || '').toString().trim() || 'safety';
  const seeds    = parseSeeds(payload);

  if (!homepage && !(broker && section)) {
    return res.status(400).json({
      ok: false,
      error: 'missing_params',
      hint: 'Provide ?homepage (or url/website) or both ?broker=&section='
    });
  }

  const jobId = makeJobId();
  Jobs.set(jobId, {
    state: 'queued',
    params: { homepage, url, broker, section, seeds },
    result: null,
    error: null,
    createdAt: now(),
    updatedAt: now()
  });

  // pokreni u pozadini (ne blokira response)
  setImmediate(() => processJob(jobId));

  return res.json({ ok: true, jobId, status: 'started' });
}

router.all(['/run', '/run.js', '/run.json', '/run/deep'], handleRun);

export default router;
