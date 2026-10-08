import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from './services/cache.service.js';

test('concurrent misses share one load; fresh cache does not reload', async () => {
  let calls = 0;
  const remember = createCache();
  const loader = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return ['anime']; };
  const results = await Promise.all(Array.from({ length: 10 }, () => remember('catalog', loader)));
  assert.equal(calls, 1);
  assert.deepEqual(results[0], ['anime']);
  await remember('catalog', loader);
  assert.equal(calls, 1);
});

test('stale data returns immediately while refreshing, with a hard expiry', async () => {
  let time = 0;
  const remember = createCache({ now: () => time });
  const options = { freshMs: 10, staleMs: 100 };
  await remember('a', async () => 'old', options);
  time = 11;
  let resolveRefresh;
  assert.equal(await remember('a', () => new Promise(resolve => { resolveRefresh = resolve; }), options), 'old');
  resolveRefresh('new');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await remember('a', async () => 'wrong', options), 'new');
  time = 200;
  await assert.rejects(remember('a', async () => { throw new Error('offline'); }, options), /offline/);
});

test('shared store survives a new cache instance; store errors fall back to loader', async () => {
  const store = new Map();
  const adapter = { read: async key => store.get(key), write: async (key, value) => store.set(key, value) };
  await createCache(adapter)('a', async () => 42);
  assert.equal(await createCache(adapter)('a', async () => { throw new Error('should not load'); }), 42);
  const unavailable = createCache({ read: async () => { throw new Error('Redis down'); }, write: async () => { throw new Error('Redis down'); } });
  assert.equal(await unavailable('a', async () => 7), 7);
  await assert.rejects(unavailable('b', async () => { throw new Error('upstream error'); }), /upstream error/);
  assert.equal(await unavailable('b', async () => 9), 9);
});
