import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIME_GENRES, mergeGenreOptions, genreKey } from '../../shared/genres.js';
import { loadGenreEntries, genreOptions } from './services/kkphim.service.js';
import { loadAnime47GenreEntries, mapAnime47 } from './services/anime47.service.js';

test('all upstream tags are represented without duplicate translated genres', () => {
  const options = mergeGenreOptions([{ name: 'Hành Động', slug: 'hanh-dong' }, { name: 'Tình Cảm', slug: 'tinh-cam' }]);
  assert.ok(ANIME_GENRES.every(g => options.some(option => option.slug === genreKey(g.slug))));
  assert.equal(options.filter(g => g.slug === 'hanh-dong').length, 1);
  assert.deepEqual(options.find(g => g.slug === 'hanh-dong').anime47Ids, [1]);
  assert.equal(options.find(g => g.slug === 'tinh-cam').name, 'Tình Cảm');
});

test('live taxonomy admits new genres and keeps the other source when a provider fails', async () => {
  const options = await genreOptions(async () => { throw Error('offline'); }, async () => [{ id: 999, slug: 'new-theme', name: 'New Theme' }]);
  assert.equal(options[0].slug, 'new-theme');
});

test('themes are included in anime labels and omitted demographic metadata is supplemented from the selected filter', async () => {
  const item = mapAnime47({ id: 1, slug: 'test', title: 'Test', genres: [{ name: 'Fantasy' }], themes: [{ name: 'Isekai' }] });
  assert.ok(item.genres.includes('Isekai'));
  const items = await loadAnime47GenreEntries(78, async path => {
    assert.match(path, /genres=78/);
    return { data: { posts: [{ id: 2, slug: 'test-two', title: 'Test Two', genres: [] }], pagination: { last_page: 1 } } };
  });
  assert.ok(items[0].genres.includes('Shounen'));
});

test('genre filters merge both providers and intersect multiple selected genres before grouping', async () => {
  const options = mergeGenreOptions([{ name: 'Hành Động', slug: 'hanh-dong' }, { name: 'Tình Cảm', slug: 'tinh-cam' }]);
  const action = { id: 'a', genres: ['Action'] };
  const both = { id: 'b', genres: ['Action', 'Romance'] };
  const primary = { id: 'primary', genres: ['Hành Động', 'Tình Cảm'] };
  const dependencies = { options: async () => options, primary: async () => [primary, action], anime: async id => id === 1 ? [action, both] : [both] };
  assert.deepEqual((await loadGenreEntries(['hanh-dong', 'romance'], dependencies)).map(x => x.id), ['primary', 'b']);
  await assert.rejects(loadGenreEntries(['nonexistent'], dependencies), error => error.status === 400);
});
