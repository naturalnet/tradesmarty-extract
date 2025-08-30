// packages/sections/safety/generic.js
import { fetchOK, loadCheerio } from '../../core/http.js';

const CANDIDATE_PATHS = [
  '/regulation', '/regulations', '/regulatory', '/legal', '/legal-documents',
  '/documents', '/policies', '/compliance', '/risk', '/risk-disclosure',
  '/about/regulation', '/about-us/regulation', '/education/faq/regulation'
];

const REGULATOR_TOKENS = [
  { re: /\bFCA\b/i,   label: 'FCA'  },
  { re: /\bCySEC\b/i, label: 'CySEC'},
  { re: /\bASIC\b/i,  label: 'ASIC' },
  { re: /\bFSCA\b/i,  label: 'FSCA' },
  { re: /\bJSC\b/i,   label: 'JSC'  },
  { re: /\bCMA\b/i,   label: 'CMA'  },
  { re: /\bFSA\b/i,   label: 'FSA'  }
];

function abs(base, href) {
  try {
    return new URL(href, base).toString();
  } catch { return href; }
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

async function tryLoad(url) {
  try {
    const ok = await fetchOK(url);
    return !!ok;
  } catch {
    return false;
  }
}

/**
 * Generičko izvlačenje SAFETY sekcije:
 * - koristi seeds ako postoje
 * - inače proba tipične putanje od homepage-a
 * - vraća normalized + triedPaths/hints za debug/not_supported
 */
export async function extractGenericSafety({ homepage, seeds = [] }) {
  const triedPaths = [];
  const hints = [];

  const base = (() => {
    try { return new URL(homepage).origin; } catch { return ''; }
  })();

  // 1) Ako ima seeds, pokušaj njih prvo
  const seedPages = [];
  for (const s of (seeds || [])) {
    const u = abs(base || homepage, s);
    triedPaths.push(u);
    if (await tryLoad(u)) seedPages.push(u);
  }

  // 2) Ako nema seed pogodaka, probaj discovery
  const discovered = [];
  if (!seedPages.length && base) {
    for (const p of CANDIDATE_PATHS) {
      const u = abs(base, p);
      triedPaths.push(u);
      if (await tryLoad(u)) {
        discovered.push(u);
        // ne sakupljamo sve, dovoljan je prvi “legal/risk” cluster,
        // ali ostavljamo mogućnost da ih bude više
      }
    }
  }

  const pages = seedPages.length ? seedPages : discovered;
  if (!pages.length) {
    return { ok: false, error: 'not_supported', reason: 'no_documents', triedPaths, hints: ['Add a Risk/Terms seed URL'] };
  }

  // 3) Parsiraj stranice i pokupi osnovne linkove/indikacije regulatora
  const links = [];
  const regsFound = new Set();
  const texts = [];

  for (const u of pages.slice(0, 4)) {
    try {
      const $ = await loadCheerio(u);
      const text = $('body').text() || '';
      texts.push(text);
      $('a[href]').each((_i, a) => {
        const href = String($(a).attr('href') || '');
        const textA = String($(a).text() || '');
        const comboText = (textA + ' ' + href).toLowerCase();
        if (/(risk|disclosure|terms|agreement|documents|policy|client)/i.test(comboText)) {
          links.push(abs(u, href));
        }
      });
      for (const t of REGULATOR_TOKENS) {
        if (t.re.test(text)) regsFound.add(t.label);
      }
    } catch {
      // ignore pojedinačne greške
    }
  }

  const linkPick = (needle) => {
    const cand = links.filter(h => h.toLowerCase().includes(needle));
    return cand[0] || '';
  };

  const normalized = {
    description: regsFound.size
      ? `Detected regulators: ${Array.from(regsFound).join(', ')}.`
      : 'Regulatory information found on legal/risk pages.',
    is_regulated: Array.from(regsFound).join(', '),
    safety_highlights: [],
    safety_caveats: [],
    legal_entities: [], // generički extractor ih ne zna bez dubinskog parsiranja
    terms_url: linkPick('terms'),
    risk_disclosure_url: linkPick('risk'),
    client_agreement_url: linkPick('agreement'),
    open_account_url: linkPick('start-trading'),
    warnings: []
  };

  // Neki “soft” highlighti/caveats ako imamo tragove
  if (normalized.is_regulated) normalized.safety_highlights.push('Regulatory authorizations detected.');
  if (!normalized.terms_url && !normalized.risk_disclosure_url) normalized.safety_caveats.push('Key legal/risk links not clearly detected.');

  return { ...normalized, triedPaths, hints, sources: pages };
}
