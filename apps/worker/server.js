// apps/worker/server.js
try { await import('dotenv/config'); } catch (_) {}

import express from 'express';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import runRouter from './src/routes/run.js';

const app = express();
const srv = http.createServer(app);

const PORT = Number(process.env.PORT || 8080);
const KEY  = (process.env.TSBAR_KEY || '').trim();
const AUTH_ON = KEY.length > 0;

app.disable('x-powered-by');
app.use(cors({
  origin: true,
  credentials: false,
  allowedHeaders: ['Content-Type','x-tsbar-key','x-api-key','authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(compression());
app.use(morgan('tiny'));

// Health bez auth-a
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Helper: izvuči ključ iz headera ili query parametara (case-insensitive)
function getKeyFromReq(req) {
  const h = req.headers || {};
  const headerKey =
    (h['x-tsbar-key'] && String(h['x-tsbar-key']).trim()) ||
    (h['x-api-key']  && String(h['x-api-key']).trim()) ||
    (() => {
      const v = h['authorization'] && String(h['authorization']).trim();
      if (!v) return '';
      if (/^bearer\s+/i.test(v)) return v.replace(/^bearer\s+/i, '').trim();
      return v;
    })();

  if (headerKey) return headerKey;

  let queryKey = '';
  for (const k of Object.keys(req.query || {})) {
    const low = k.toLowerCase();
    if (low === 'key' || low === 'tsbar_key' || low === 'api_key') {
      queryKey = String(req.query[k] ?? '').trim();
      if (queryKey) break;
    }
  }
  return queryKey;
}

// Auth (dozvoli OPTIONS i /health)
app.use((req, res, next) => {
  if (!AUTH_ON) return next();
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/health') return next();

  const provided = getKeyFromReq(req);
  if (provided && provided === KEY) return next();

  return res.status(401).json({ ok:false, error:'unauthorized' });
});

// Rute
app.use('/', runRouter);

// Start
srv.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
});
