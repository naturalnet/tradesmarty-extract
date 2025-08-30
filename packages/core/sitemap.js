// packages/core/sitemap.js
import { fetchText, toAbs } from './http.js';

const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

export async function getRobotsTxt(origin) {
  try {
    const txt = await fetchText(new URL('/robots.txt', origin).toString());
    return txt || '';
  } catch { return ''; }
}

export function extractSitemapsFromRobots(robotsTxt, origin) {
  const maps = [];
  (robotsTxt || '').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*sitemap:\s*([^#\s]+)/i);
    if (m) {
      try { maps.push(new URL(m[1], origin).toString()); } catch {}
    }
  });
  // fallback common paths
  if (!maps.length) {
    maps.push(new URL('/sitemap.xml', origin).toString());
    maps.push(new URL('/wp-sitemap.xml', origin).toString());
  }
  return Array.from(new Set(maps));
}

export async function parseSitemapUrls(sitemapUrl, limit = 500) {
  const out = [];
  const xml = await fetchText(sitemapUrl);
  if (!xml) return out;

  // plain sitemap or sitemap index — naive parse by <loc>
  let m; let count = 0;
  while ((m = LOC_RE.exec(xml)) && count < limit) {
    out.push(m[1]);
    count++;
  }
  return out;
}

export async function autoSeedsFromSitemaps(origin, filters, maxUrls = 24) {
  const robots = await getRobotsTxt(origin);
  const maps = extractSitemapsFromRobots(robots, origin);

  const out = new Set();
  for (const m of maps) {
    const urls = await parseSitemapUrls(m, 2000);
    for (const u of urls) {
      if (!u || !u.startsWith(origin)) continue;
      const low = u.toLowerCase();
      if (filters.some(re => re.test(low))) out.add(u);
      if (out.size >= maxUrls) return Array.from(out);
    }
  }
  return Array.from(out);
}

export function mergeAbs(base, hrefs = []) {
  return Array.from(new Set(hrefs.map(h => toAbs(base, h)).filter(Boolean)));
}
