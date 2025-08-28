export function validateSafety(normalized) {
const errs = [];
if (!normalized?.legal_entities?.length) errs.push('legal_entities missing');
return { ok: errs.length === 0, errs };
}
