export async function extractDeepSafety({
  homepage,
  seeds = [],
  maxPages = 40,
  maxDepth = 2,
  timeoutMs = 25000,
  allowPdf = true
} = {}) {

  // ❗ Novi fallback: koristi origin prvog seeda ako nema homepage
  const cleanSeeds = Array.isArray(seeds) ? seeds.filter(Boolean) : [];
  if (!homepage && cleanSeeds.length) {
    try {
      const u = new URL(cleanSeeds[0]);
      homepage = `${u.protocol}//${u.host}`;
    } catch {}
  }

  // Ako i dalje nemamo ni homepage ni seeds → tek tada graceful poruka
  if (!homepage && !cleanSeeds.length) {
    return {
      description: 'No homepage or seeds provided — cannot crawl legal/regulatory pages.',
      is_regulated: '',
      safety_highlights: [],
      safety_caveats: ['Homepage/seed URL is missing.'],
      legal_entities: [],
      terms_url:'', risk_disclosure_url:'', client_agreement_url:'', open_account_url:'',
      triedPaths: [], sources: [], hints: ['Pass ?homepage=<url> or seeds[].']
    };
  }

  const { pages, tried } = await crawl({
    homepage,
    seeds: cleanSeeds,
    maxPages, maxDepth, timeoutMs, allowPdf
  });

  // ... (ostatak tvoje funkcije ostaje identičan)
}
