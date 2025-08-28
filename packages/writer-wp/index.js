// MVP: upsert radi tvoj WP plugin bridge.
// Kasnije ovde možemo dodati direktan REST poziv na /wp-json/tsbar/v1/... sa locklist + diff.
export async function upsertToWP(acfPayload, { postId, endpoint, token }) {
return { ok: true, skipped: true, note: 'Use WP plugin bridge for now.' };
}
