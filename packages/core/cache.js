import LRU from 'lru-cache';


const lru = new LRU({ max: 500, ttl: 1000 * 60 * 60 }); // 1h


export async function memo(key, fn, ttlMs = 60_000) {
const hit = lru.get(key);
if (hit) return hit;
const val = await fn();
lru.set(key, val, { ttl: ttlMs });
return val;
}
