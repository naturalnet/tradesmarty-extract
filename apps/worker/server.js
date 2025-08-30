try { await import('dotenv/config'); } catch (_) {}

import express from 'express';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import runRouter from './src/routes/run.js';
import jobsRouter from './src/routes/jobs.js';
import regulatorsRouter from './src/routes/regulators.js';

const app = express();
const srv = http.createServer(app);

const PORT = Number(process.env.PORT || 8080);
const KEY  = (process.env.TSBAR_KEY || '').trim();
const AUTH_ON = KEY.length > 0;

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: false, allowedHeaders: ['Content-Type','x-tsbar-key'] }));
app.use(express.json({ limit: '1mb' }));
app.use(compression());
app.use(morgan('tiny'));

// Health
app.get('/health', (req, res) => res.json({ ok:true, uptime: process.uptime() }));

// Debug spisak ruta
app.get('/_routes', (req, res) => {
  const stack = app._router?.stack || [];
  const routes = [];
  stack.forEach(l => {
    if (l.route && l.route.path) {
      routes.push(Object.keys(l.route.methods).map(m => m.toUpperCase()).join(',') + ' ' + l.route.path);
    } else if (l.name === 'router' && l.handle?.stack) {
      l.handle.stack.forEach(s => {
        if (s.route?.path) {
          routes.push(Object.keys(s.route.methods).map(m => m.toUpperCase()).join(',') + ' ' + s.route.path);
        }
      });
    }
  });
  res.json({ ok:true, routes });
});

// Auth guard (osim /health i /_routes)
app.use((req, res, next) => {
  if (!AUTH_ON) return next();
  if (req.path === '/health' || req.path === '/_routes') return next();
  const k = (req.headers['x-tsbar-key'] || req.query.key || '').toString().trim();
  if (k && k === KEY) return next();
  res.status(401).json({ ok:false, error:'unauthorized' });
});

// Mount
app.use('/', runRouter);
app.use('/', jobsRouter);
app.use('/', regulatorsRouter);

// Start
srv.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
});
