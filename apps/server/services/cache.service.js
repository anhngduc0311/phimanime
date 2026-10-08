import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

let client;
let connecting;
let retryAt = 0;
async function connection() {
  if (process.env.REDIS_DISABLED === '1' || Date.now() < retryAt) return null;
  if (client?.status === 'ready') return client;
  if (connecting) return connecting;
  connecting = (async () => {
    client?.disconnect();
    client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6380', {
      lazyConnect: true, connectTimeout: 500, commandTimeout: 700,
      maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null
    });
    client.on('error', () => {});
    try { await client.connect(); return client; }
    catch { retryAt = Date.now() + 30000; client.disconnect(); return null; }
  })();
  try { return await connecting; } finally { connecting = null; }
}

export const cacheKey = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createCache({ read = async () => null, write = async () => {}, now = Date.now, maxEntries = 20 } = {}) {
  const memory = new Map();
  const pending = new Map();
  const put = (key, entry) => {
    memory.delete(key);
    if (memory.size >= maxEntries) memory.delete(memory.keys().next().value);
    memory.set(key, entry);
  };
  return async function remember(key, loader, { freshMs = 300000, staleMs = 1800000 } = {}) {
    let entry = memory.get(key);
    const refresh = () => {
      if (pending.has(key)) return pending.get(key);
      const task = (async () => {
        const value = await loader();
        const saved = { value, freshUntil: now() + freshMs, expires: now() + staleMs };
        put(key, saved);
        try { await write(key, saved, staleMs); } catch {}
        return value;
      })();
      pending.set(key, task);
      task.then(() => pending.delete(key), () => pending.delete(key));
      return task;
    };
    if (!entry) {
      try { entry = await read(key); } catch {}
      if (entry && Number.isFinite(entry.expires) && 'value' in entry) put(key, entry);
      else entry = null;
    }
    if (entry?.expires > now()) {
      if (entry.freshUntil <= now() && (!entry.retryAt || entry.retryAt <= now())) {
        entry.retryAt = now() + 30000;
        void refresh().catch(() => {});
      }
      return entry.value;
    }
    return refresh();
  };
}

export const remember = createCache({
  read: async key => {
    const redis = await connection();
    const raw = redis && await redis.get('anidoki:catalog:v1:' + key);
    return raw ? JSON.parse(raw) : null;
  },
  write: async (key, value, ttl) => {
    const redis = await connection();
    if (redis) await redis.set('anidoki:catalog:v1:' + key, JSON.stringify(value), 'PX', ttl);
  }
});

export function closeCache() { client?.disconnect(); }
