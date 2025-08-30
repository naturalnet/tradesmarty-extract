// MVP: upsert radi tvoj WP plugin bridge.
// Kasnije ovde možemo dodati direktan REST poziv na /wp-json/tsbar/v1/... sa locklist + diff.
export async function upsertToWP(acfPayloaimport axios from 'axios';

const BASE = (process.env.WP_BASE_URL || '').replace(/\/+$/,'');
const USER = process.env.WP_APP_USER || '';
const PASS = process.env.WP_APP_PASS || '';
const BASIC = Buffer.from(`${USER}:${PASS}`).toString('base64');

export async function upsertCanonical({ homepage, canonical, proofs }) {
  if (!BASE || !USER || !PASS) {
    return { ok:false, error:'wp_credentials_missing' };
  }
  const url = `${BASE}/wp-json/tsbar/v1/brokers-upsert`;
  const body = { homepage, canonical, proofs: proofs || {} };
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${BASIC}`,
    'Accept': 'application/json'
  };
  try {
    const { data } = await axios.post(url, body, { headers, timeout: 60000 });
    return data;
  } catch (e) {
    return {
      ok:false,
      error:'wp_upsert_failed',
      status: e.response?.status || 0,
      details: e.response?.data || String(e.message || e)
    };
  }
}
d, { postId, endpoint, token }) {
return { ok: true, skipped: true, note: 'Use WP plugin bridge for now.' };
}
