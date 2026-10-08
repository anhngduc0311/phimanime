import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAnime, getVietsub } from './vietsubService.js';

test('Vietsub matching rejects different seasons, years and live action', () => {
  const anime = { title: { english: 'The Apothecary Diaries Season 3' }, year: 2026 };
  assert.equal(matchesAnime(anime, { origin_name: 'The Apothecary Diaries (Season 2)', year: 2025, type: 'hoathinh' }), false);
  const onePiece = { title: { english: 'ONE PIECE' }, year: 1999 };
  assert.equal(matchesAnime(onePiece, { origin_name: 'One Piece', year: 1999, type: 'hoathinh' }), true);
  assert.equal(matchesAnime(onePiece, { origin_name: 'One Piece', year: 2023, type: 'series' }), false);
});

test('selects Vietsub, exact episode and trusted embed; caches requests', async t => {
  const anime = { title: { english: 'Test Anime' }, year: 2020, format: 'TV' };
  const movie = { origin_name: 'Test Anime', year: 2020, type: 'hoathinh', slug: 'test-anime' };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    return { ok: true, json: async () => url.includes('tim-kiem')
      ? { data: { items: [movie] } }
      : { status: true, movie, episodes: [
        { server_name: 'Lồng Tiếng', server_data: [] },
        { server_name: 'Vietsub', server_data: [
          { name: 'Tập 01', link_embed: 'https://player.phimapi.com/player/?url=test' },
          { name: 'Tập 02', link_embed: 'https://untrusted.example/player/' }
        ] }
      ] } };
  });
  assert.equal((await getVietsub(anime, 1)).language, 'vi');
  assert.equal(await getVietsub(anime, 2), null);
  assert.equal(await getVietsub(anime, 3), null);
  assert.equal(calls, 2);
});
