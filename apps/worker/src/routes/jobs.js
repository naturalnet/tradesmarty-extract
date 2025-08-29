// apps/worker/src/routes/jobs.js
import { Router } from 'express';
import { Jobs } from './run.js';
import { orchestrate } from '../orchestrator.js';

const router = Router();

function writeSSE(res, dataObj, eventName) {
  if (eventName) res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
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
    } catch (_) {}
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
  // dashboard "all" – za MVP krećemo od safety
  const sections = String(p.sections || '').toLowerCase();
  if (sections === 'all' || sections.includes('safety')) return 'safety';
  return 'safety';
}

router.get('/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const job = Jobs.get(id);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (!job) {
    writeSSE(res, { ok:false, error:'job_not_found', id });
    return res.end();
  }

  const params = job.params || {};
  const broker  = (params.broker && String(params.broker).toLowerCase()) || guessBrokerFromParams(params);
  const section = (params.section && String(params.section).toLowerCase()) || guessSectionFromParams(params);
  const debug   = String(params.debug || '') === '1';

  writeSSE(res, { status:'started', id, broker, section }, 'status');

  if (!broker || !section) {
    writeSSE(res, { ok:false, error:'missing_params', hint:'Provide broker & section or homepage' }, 'done');
    return res.end();
  }

  try {
    const result = await orchestrate({ broker, section, debug });

    if (!result || result.ok === false) {
      writeSSE(res, { ok:false, error:'not_supported', broker, section }, 'done');
      return res.end();
    }

    // Informacije tokom rada (po želji)
    writeSSE(res, { level:'info', message:`Extracted ${broker}/${section}` }, 'log');

    // Finalni rezultat
    writeSSE(res, { ok:true, broker, section, ...result }, 'done');
    return res.end();
  } catch (err) {
    writeSSE(res, { ok:false, error:'internal_error', message:String(err?.message || err) }, 'done');
    return res.end();
  }
});

export default router;
