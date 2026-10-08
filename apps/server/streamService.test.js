import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Anikoto mapping, language availability, caching and AniList fallback', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    const data = url.includes('/recent-anime')
      ? [{ id: 8972, ani_id: '185874' }]
      : { anime: { ani_id: '185874' }, episodes: [
        { number: 1, episode_embed_id: '694507', embed_url: { sub: 'unused' } }
      ] };
    return { ok: true, json: async () => ({ ok: true, data }) };
  });
  const api = await import('./streamService.js?mapping-test');
  const sources = await Promise.all([
    api.getLiveSources(185874, 1, 'sub'), api.getLiveSources(185874, 1, 'sub')
  ]);
  assert.equal(sources[0].embed_url, 'https://megaplay.buzz/stream/s-2/694507/sub');
  assert.equal(calls.length, 2, 'concurrent requests share discovery and series fetches');
  assert.equal(await api.getLiveSources(185874, 1, 'dub'), null);
  assert.equal(await api.getLiveSources(185874, 2, 'sub'), null);
  assert.equal((await api.getLiveSources(21, 100, 'dub')).embed_url,
    'https://megaplay.buzz/stream/ani/21/100/dub');
  assert.equal(calls.length, 2);
  for (const args of [[0, 1, 'sub'], [21, -1, 'sub'], [21, 1, 'vi'], ['21/../../', 1, 'sub']]) {
    await assert.rejects(api.getLiveSources(...args), { status: 400 });
  }
});

test('rate limited Anikoto falls back without repeatedly hitting upstream', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return { ok: false, status: 429 };
  });
  const api = await import('./streamService.js?rate-limit-test');
  assert.equal((await api.getLiveSources(21, 1)).embed_url, 'https://megaplay.buzz/stream/ani/21/1/sub');
  await api.getLiveSources(21, 2);
  assert.equal(calls, 1);
});
