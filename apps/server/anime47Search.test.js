import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAnime47 } from './services/anime47.service.js';
import { browseCatalog } from './services/kkphim.service.js';
import { AdminAnimeModel } from './models/adminAnime.model.js';

const movie = { id: 11322, slug: 'kanojo-no-tomodachi', title: 'Kanojo no Tomodachi', type: 'TV',
  genres: ['Drama'], status: 'Ongoing', current_episode: '1' };

test('Anime47 search loads remaining pages and deduplicates titles', async () => {
  const calls = [];
  const items = await searchAnime47(' Kanojo no Tomodachi ', async path => {
    calls.push(path);
    return path.endsWith('page=1') ? { total_pages: 2, results: [movie] } :
      { total_pages: 2, results: [movie, { ...movie, id: 20000, slug: 'second-title', title: 'Second Title' }] };
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /keyword=Kanojo%20no%20Tomodachi&page=1$/);
  assert.deepEqual(items.map(item => item.id), ['anime47-kanojo-no-tomodachi', 'anime47-second-title']);
  assert.deepEqual(await searchAnime47(' ', () => assert.fail('empty query must not request')), []);
});

test('browse discovers an Anime47-only title, applies hidden overrides, and tolerates provider failure', async t => {
  const keys = ['REDIS_DISABLED', 'MEILI_MASTER_KEY', 'ANIME47_ACCESS_TOKEN', 'ANIME47_REFRESH_TOKEN', 'ANIME47_SESSION_FILE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let hidden = false;
  let failed = false;
  t.mock.method(AdminAnimeModel, 'getAllAnimeOverrides', async () => hidden ? new Map([
    ['anime47-kanojo-no-tomodachi', { is_hidden: true }]
  ]) : new Map());
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.startsWith('https://anime47.love/api/search/live')) {
      if (failed) throw new Error('provider unavailable');
      return { ok: true, json: async () => ({ results: [movie], total_pages: 1 }) };
    }
    if (url.startsWith('https://phimapi.com/')) return { ok: true, json: async () => ({ data: { items: [], params: { pagination: { totalPages: 1 } } } }) };
    if (url.startsWith('https://phim.nguonc.com/')) return { ok: true, json: async () => ({ status: 'success', items: [] }) };
    assert.fail('Unexpected provider URL');
  });
  try {
    Object.assign(process.env, { REDIS_DISABLED: '1', MEILI_MASTER_KEY: '', ANIME47_ACCESS_TOKEN: '', ANIME47_REFRESH_TOKEN: '', ANIME47_SESSION_FILE: '' });
    const result = await browseCatalog({ q: 'Kanojo no Tomodachi', limit: 48 });
    assert.equal(result.items[0].id, 'anime47-kanojo-no-tomodachi');
    assert.equal(result.items[0].source, 'Anime47');
    assert.equal(result.pagination.totalItems, 1);
    hidden = true;
    assert.deepEqual((await browseCatalog({ q: 'Kanojo no Tomodachi' })).items, []);
    hidden = false;
    failed = true;
    assert.deepEqual((await browseCatalog({ q: 'unavailable-source-regression' })).items, []);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
