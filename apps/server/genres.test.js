import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genreCatalog, genreOptions } from './kkphim.js';

test('multi-genre catalog requires every category, deduplicates seasons and paginates matches', async () => {
  const options = [{ name: 'Hành Động', slug: 'hanh-dong' }, { name: 'Hài Hước', slug: 'hai-huoc' }];
  const item = (slug, genres, series = slug) => ({ slug, name: slug, tmdb: { type: 'tv', id: series }, category: genres.map(slug => ({ slug, name: slug })) });
  const both = options.map(option => option.slug);
  const pages = [
    [item('action-only', ['hanh-dong']), item('first', both, 'same-series')],
    [item('older-season', both, 'same-series'), item('second', both), item('third', both)]
  ];
  const request = async path => {
    if (path === '/the-loai') return { data: { items: options } };
    const url = new URL(path, 'https://phimapi.com');
    assert.equal(url.searchParams.get('category'), 'hanh-dong');
    assert.equal(url.searchParams.get('country'), 'nhat-ban');
    return { data: { items: pages[Number(url.searchParams.get('page')) - 1], params: { pagination: { totalPages: 2 } } } };
  };
  const first = await genreCatalog(both, 1, 2, request);
  assert.deepEqual(first.data.map(item => item.id), ['first', 'second']);
  assert.equal(first.pagination.hasMore, true);
  const last = await genreCatalog(both, 2, 2, request);
  assert.deepEqual(last.data.map(item => item.id), ['third']);
  assert.equal(last.pagination.hasMore, false);
  await assert.rejects(genreCatalog(['unknown'], 1, 12, request), error => error.status === 400);
  await assert.rejects(genreCatalog([], 1, 12, request), error => error.status === 400);
  await assert.rejects(genreOptions(async () => ({ data: {} })), /không hợp lệ/);
});
