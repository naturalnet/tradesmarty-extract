// apps/worker/src/routes/jobs.js
import { Router } from 'express';
import { Jobs } from './run.js';
import { orchestrate } from '../orchestrator.js';

const router = Router();

function wantsSSE(req) {
  const a = String(req.headers['accept'] || '');
  const q = String((req.query?.stream ?? req.query?.sse ?? '')).toLowerCase();
  return /text\/event-stream/i.test(a) || q === '1' || q === 'true';
}
function writeSSE(res, payload, event) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function guessBrokerFromParams(p = {}) {
  const urlish = String(p.homepage || p.url || '').trim();
  if (urlish) {
    try {
      const host = new URL(urlish).hostname.toLowerCase().replace(/^www\./,'');
      const first = host.split('.')[0];
      if (['admiralmarkets','admirals','admiral'].includes(first)) return 'admirals';
      if (first.includes('icmarkets')) return 'icmarkets';
      if (first.includes('xtb')) return 'xtb';
      return first;
    } catch {}
  }
  const brand = String(p.brand || p.broker_name || p.name || '').toLowerCase();
  if (brand) {
    if (['admiral','admiralmarkets','admirals'].includes(brand)) return 'admirals';
    return brand.replace(/\s+/g,'-');
  }
  const slug = String(p.broker || p.broker_slug || p.slug || '').toLowerCase();
  return slug || '';
}

function guessSectionFromParams(p = {}) {
  const sec = String(p.section || p.sec || p.s || '').toLowerCase();
  if (sec) return sec;
  const mode = String(p.mode || p.action || '').toLowerCase();
  if (mode.includes('safety')) return 'safety';
  if (mode.includes('fees')) return 'fees';
  if (mode.includes('platform')) return 'trading_platforms';
  if (mode.includes('deposit') || mode.includes('withdraw')) return 'deposits_withdrawals';
  if (mode.includes('account')) return 'account_types';
  if (mode.includes('research')) return 'research_tools';
  if (mode.includes('education')) return 'education';
  if (mode.includes('support')) return 'customer_support';
  const sections = String(p.sections || '').toLowerCase();
  if (sections === 'all' || sections.includes('safety')) return 'safety';
  return 'safety';
}

async function runJobOnce(id, params) {
  const broker  = (params.broker && String(params.broker).toLowerCase()) || guessBrokerFromParams(params);
  const section = (params.section && String(params.section).toLowerCase()) || guessSectionFromParams(params);
  const debug   = String(params.debug || '') === '1';

  if (!broker || !section) {
    return { ok:false, error:'missing_params', hint:'Provide broker & section or homepage' };
  }

  const result = await orchestrate({ broker, section, debug });
  if (!result || result.ok === false) return { ok:false, error:'not_supported', broker, section };

  return { ok:true, broker, section, ...result };
}

router.get('/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const job = Jobs.get(id);

  if (!job) {
    if (wantsSSE(req)) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      writeSSE(res, { ok:false, error:'job_not_found', id }, 'done');
      return res.end();
    }
    return res.status(404).json({ ok:false, error:'job_not_found', id });
  }

  const params = job.params || {};

  // SSE
  if (wantsSSE(req)) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    writeSSE(res, { status:'started', id }, 'status');

    try {
      const out = await runJobOnce(id, params);
      if (!out.ok) {
        writeSSE(res, out, 'done');
        return res.end();
      }
      writeSSE(res, { level:'info', message:`Extracted ${out.broker}/${out.section}` }, 'log');
      writeSSE(res, out, 'done');
      return res.end();
    } catch (err) {
      writeSSE(res, { ok:false, error:'internal_error', message:String(err?.message || err) }, 'done');
      return res.end();
    }
  }

  // JSON polling
  try {
    const out = await runJobOnce(id, params);
    if (!out.ok) return res.status(400).json(out);
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ ok:false, error:'internal_error', message:String(err?.message || err) });
  }
});

export default router;
