export function withProvenance(payload, sources = []) {
return { payload, sources, ts: Date.now() };
}
