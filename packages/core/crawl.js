// packages/core/crawl.js
import { loadCheerio, toAbs, sameOrigin } from './http.js';

const DENY_EXT = /\.(pdf|jpg|jpeg|png|webp|gif|svg|ico|css|js|zip|rar|7z|mp4|mp3|wav)(\?|$)/i;

export function extractLinks($, baseUrl) {
  const links = [];
  $('a[href]').each((_i, a) => {
    const href = String($(a).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    const abs = toAbs(baseUrl, href);
    if (!abs || DENY_EXT.test(abs)) return;
    links.push(abs);
  });
  return Array.from(new Set(links));
}

export async function crawlDomainSeeds({ origin, startUrls, keywordPatterns, maxPages = 30 }) {
  const seen = new Set();
  const queue = [...(startUrls || [])].filter(u => sameOrigin(u, origin));
  const candidates = new Map(); // url -> score

  while (queue.length && seen.size < maxPages) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);

    let $;
    try { $ = await loadCheerio(u); }
    catch { continue; }

    const bodyText = $('body').text().toLowerCase();
    const links = extractLinks($, u).filter(h => sameOrigin(h, origin));

    // score by path and text matches
    let score = 0;
    const path = new URL(u).pathname.toLowerCase();
    const pathTokens = ['legal','regulation','regulatory','documents','policy','policies','risk','disclosure','terms','agreement','client'];
    for (const t of pathTokens) if (path.includes(t)) score += 5;

    for (const re of (keywordPatterns || [])) if (re.test(bodyText)) score += 4;

    // bonus for many pdf/doc links
    const pdfCount = links.filter(h => /\.pdf(\?|$)/i.test(h)).length;
    score += Math.min(pdfCount, 5); // cap

    // store
    candidates.set(u, (candidates.get(u) || 0) + score);

    // continue BFS
    for (const h of links) if (!seen.has(h) && queue.length < maxPages * 2) queue.push(h);
  }

  return [...candidates.entries()]
    .sort((a,b) => b[1]-a[1])
    .map(([u]) => u)
    .slice(0, 12);
}
