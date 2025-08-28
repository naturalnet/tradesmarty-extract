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
const KEY = (process.env.TSBAR_KEY || '').trim();
const AUTH_ON = KEY.length > 0;


app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: false, allowedHeaders: ['Content-Type','x-tsbar-key'] }));
app.use(express.json({ limit: '1mb' }));
app.use(compression());
app.use(morgan('tiny'));


// simple auth
app.use((req, res, next) => {
if (!AUTH_ON) return next();
const k = (req.headers['x-tsbar-key'] || '').toString().trim();
if (k && k === KEY) return next();
res.status(401).json({ ok:false, error:'unauthorized' });
});


app.get('/health', (req,res)=> res.json({ ok:true, uptime:process.uptime() }));
app.use('/', runRouter);


srv.listen(PORT, () => {
console.log(`[worker] listening on :${PORT}`);
});
