import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * GET text/HTML with browsery headers.
 */
export async function fetchText(url, opts = {}) {
  const res = await axios.get(url, {
    timeout: opts.timeout || 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent': opts.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36 TS-Extractor',
      'Accept': opts.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (res.status >= 200 && res.status < 300) return res.data;
  throw new Error(`fetchText ${res.status} for ${url}`);
}

/**
 * SOFT link check:
 * - Uses GET (many CDNs block HEAD)
 * - Browsery headers
 * - Considers 2xx/3xx as OK
 * - Returns boolean; NEVER throws
 */
export async function fetchOK(url) {
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36 TS-Extractor',
        'Accept': 'text/html,application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

export async function loadCheerio(url, opts = {}) {
  const html = await fetchText(url, opts);
  return cheerio.load(html);
}
