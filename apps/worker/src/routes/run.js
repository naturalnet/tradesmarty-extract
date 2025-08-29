// apps/worker/src/routes/run.js
import { Router } from 'express';
import { orchestrate } from '../orchestrator.js';

const router = Router();

// Podržimo sve legacy putanje
const PATHS = ['/run', '/run.js', '/run.json'];

// Helpers
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

function inferBroker(payload) {
  return firstNonEmpty(payload, [
    'broker',
    'broker_slug',
    'slug',
    'name',
    'b'
  ]).toLowerCase();
}

function inferSection(payload, path) {
  // eksplicitno polje
  let sec = firstNonEmpty(payload, ['section', 'sec', 's', 'section_name']).toLowerCase();
  if (sec) return sec;

  // iz action-a / grupe
  const action = firstNonEmpty(payload, ['action', 'ts_action', 'tsbar_action']).toLowerCase();
  if (action.includes('safety')) return 'safety';
  if (action.includes('fees')) return 'fees';
  if (action.includes('platform')) return 'trading_platforms';
  if (action.includes('deposit') || action.includes('withdraw')) return 'deposits_withdrawals';
  if (action.includes('account')) return 'account_types';
  if (action.includes('research')) return 'research_tools';
  if (action.includes('education')) return 'education';
  if (action.includes('support')) return 'customer_support';

  // iz drugih hint-ova
  const group = firstNonEmpty(payload, ['acf_group', 'tsbar_section']).toLowerCase();
  if (group) return group;

  // fallback: ako baš ništa nema, probaj safety kao default
  if (PATHS.includes(path)) return 'safety';

  return '';
}

function sanitizeDebug(obj) {
  // mask key-like fields
  const clone = JSON.parse(JSON.stringify(obj || {}));
  for (const k of Object.keys(clone)) {
    if (String(k).toLowerCase().includes('key') || String(k).toLowerCase().includes('token')) {
      clone[k] = '***';
    }
  }
  return clone;
}

// Podrži i GET i POST (plugin može slati JSON body)
router.all(PATHS, async (req, res) => {
  try {
    // payload = query + body (body ima prednost)
    const payload = { ...(req.query || {}), ...(req.body || {}) };

    const broker  = inferBroker(payload);
    const section = inferSection(payload, req.path);
    const debug   = String(payload.debug || '').trim() === '1';

    if (!broker || !section) {
      const receivedKeys = Object.keys(payload || {});
      const hint = 'Provide broker and section. e.g. ?broker=admirals&section=safety';
      const details = {
        brokerResolved: broker || null,
        sectionResolved: section || null,
        receivedKeys,
      };
      if (debug) {
        details.query = sanitizeDebug(req.query);
        details.body  = sanitizeDebug(req.body);
      }
      return res.status(400).json({ ok: false, error: 'missing_params', hint, ...details });
    }

    const result = await orchestrate({ broker, section, debug });

    if (!result || result.ok === false) {
      return res.status(404).json(result || { ok: false, error: 'not_supported' });
    }

    const out = { ok: true, broker, section, ...result };
    if (debug) {
      out._debug = {
        path: req.path,
        receivedKeys: Object.keys(payload || {}),
      };
    }
    return res.json(out);
  } catch (err) {
    console.error('run error:', err?.stack || err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// CORS preflight
router.options(PATHS, (_req, res) => res.sendStatus(204));

export default router;
