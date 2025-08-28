import axios from 'axios';
import * as cheerio from 'cheerio';


export async function fetchText(url, opts = {}) {
const res = await axios.get(url, {
timeout: opts.timeout || 20000,
maxRedirects: 5,
headers: {
'User-Agent': opts.ua || 'Mozilla/5.0 (TS-Extractor) https://tradesmarty.com',
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}
});
return res.data;
}


export async function fetchOK(url) {
try { await axios.head(url, { timeout: 12000 }); return true; }
catch { try { await axios.get(url, { timeout: 12000 }); return true; } catch { return false; } }
}


export async function loadCheerio(url, opts = {}) {
const html = await fetchText(url, opts);
return cheerio.load(html);
}
