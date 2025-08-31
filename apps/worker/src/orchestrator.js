// apps/worker/src/orchestrator.js
// ESM

export async function orchestrate(ctx = {}) {
  const section = (ctx.section || 'safety').toLowerCase();

  if (section === 'safety') {
    // putanja iz perspektive apps/worker/src/
    const mod = await import('../../../packages/sections/safety/index.js');
    // mod.extract mora da vrati { ok:true, normalized, acf }
    return await mod.extract(ctx);
  }

  return { ok: false, error: 'unknown_section', section };
}

export default { orchestrate };
