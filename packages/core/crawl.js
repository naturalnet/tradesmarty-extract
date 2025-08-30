// packages/core/crawl.js
import { loadCheerio, toAbs, sameSite } from './http.js';

const DENY_EXT = /\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|zip|rar|7z|mp4|mp3|wav)(\?|$)/i;

// prošireni tokeni u path-u
const PATH_TOKENS = [
  'legal','regulation','regulations','regulatory','documents','document',
  'policy','policies','risk','disclosure','terms','conditions','agreement',
  'client','complaint','complaints','privacy','cookie','kyc','aml','docs','legal-information'
];

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

export async function crawlDomainSeeds({
  origin,           // npr https://quadcodemarkets.com
  startUrls,
  keywordPatterns,
  maxPages = 60
}) {
  const seen = new Set();
  const queue = [...(startUrls || [])];
  const candidates = new Map(); // url -> score

  while (queue.length && seen.size < maxPages) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);

    // pratimo samo isti sajt (takođe i poddomene)
    if (!sameSite(u, origin)) continue;

    let $;
    try { $ = await loadCheerio(u); }
    catch { continue; }

    const bodyText = $('body').text().toLowerCase();
    const links = extractLinks($, u).filter(h => sameSite(h, origin));

    // scoring:
    let score = 0;

    // 1) path tokeni
    const path = new URL(u).pathname.toLowerCase();
    for (const t of PATH_TOKENS) if (path.includes(t)) score += 6;

    // 2) ključne reči u tekstu
    for (const re of (keywordPatterns || [])) if (re.test(bodyText)) score += 4;

    // 3) PDF linkovi (signal za pravne dokumente)
    const pdfCount = links.filter(h => /\.pdf(\?|$)/i.test(h)).length;
    score += Math.min(pdfCount * 2, 10);

    // 4) “client/terms/agreement” u anchor textu
    $('a[href]').each((_i, a) => {
      const txt = String($(a).text() || '').toLowerCase();
      if (/(client|agreement|terms|risk|privacy|policy|disclosure)/i.test(txt)) score += 1;
    });

    candidates.set(u, (candidates.get(u) || 0) + score);

    // BFS nastavi
    for (const h of links) if (!seen.has(h) && queue.length < maxPages * 3) queue.push(h);
  }

  return [...candidates.entries()]
    .sort((a,b) => b[1]-a[1])
    .map(([u]) => u)
    .slice(0, 24);
}
