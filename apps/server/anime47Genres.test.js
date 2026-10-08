import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAnime47FantasyEntries } from './services/anime47.service.js';
import { genreOptions } from './services/kkphim.service.js';

test('genre menu includes Fantasy even when the primary provider omits it', async () => {
  const options = await genreOptions(async () => ({ data: { items: [{ name: 'Hành Động', slug: 'hanh-dong' }] } }));
  assert.ok(options.some(g => g.slug === 'fantasy' && g.name === 'Fantasy'));
});

test('Fantasy catalog uses the upstream genre ID, reads all pages, and preserves the selected genre', async () => {
  const calls = [];
  const request = async path => {
    const url = new URL(path, 'https://example.test');
    assert.equal(url.searchParams.get('genres'), '8');
    const page = Number(url.searchParams.get('page'));
    calls.push(page);
    return { data: { pagination: { last_page: 2 }, posts: [
      { id: page, slug: 'fantasy-' + page, title: 'Fantasy ' + page, genres: [{ slug: 'fantasy', name: 'Fantasy' }] }
    ] } };
  };
  const items = await loadAnime47FantasyEntries(request);
  assert.deepEqual(calls, [1,2]);
  assert.equal(items.length, 2);
  assert.ok(items.every(item => item.genres.includes('Fantasy')));
});
