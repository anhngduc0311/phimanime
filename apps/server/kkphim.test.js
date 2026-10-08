import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMovie, extractEpisodes, kkRequest, movieCatalog, selectSpotlights, selectTrending, trendingCatalog } from './kkphim.js';

test('trending pagination skips low ratings, deduplicates seasons and reaches the final page', async () => {
  const item = (slug, score, id = slug) => ({ slug, name: slug, tmdb: { type: 'tv', id, vote_average: score } });
  const pages = [
    [item('low', 6), item('series-new', 6, 'same-series')],
    [item('a', 7), item('b', 8), item('series-old', 9, 'same-series')],
    [item('a', 7), item('c', 9), item('d', 7.5)]
  ];
  const request = async path => ({ data: { items: pages[Number(new URL(path, 'https://phimapi.com').searchParams.get('page')) - 1], params: { pagination: { totalPages: 3 } } } });
  const first = await trendingCatalog(1, 2, request);
  assert.deepEqual(first.data.map(item => item.id), ['a', 'b']);
  assert.equal(first.pagination.hasMore, true);
  const second = await trendingCatalog(2, 2, request);
  assert.deepEqual(second.data.map(item => item.id), ['c', 'd']);
  assert.equal(second.pagination.hasMore, false);
  assert.deepEqual((await trendingCatalog(3, 2, request)).data, []);
  await assert.rejects(trendingCatalog(1, 12, async () => ({ data: {} })), /không hợp lệ/);
});

test('trending includes newest series entries rated seven or higher', () => {
  const item = (id, score, seriesId = id) => ({ id, score, seriesId, title: { english: id } });
  const result = selectTrending([
    item('above', 7.1), item('exactly-seven', 7), item('below', 6.5),
    item('unknown', 0), item('invalid', NaN), item('infinite', Infinity),
    item('new-season', 6, 'same-series'), item('old-season', 9, 'same-series'),
    item('high', 9.5), item('above', 7.1)
  ]);
  assert.deepEqual(result.map(item => item.id), ['above', 'exactly-seven', 'high']);
});

test('spotlight chooses seven highest-rated recent series with update time as tie breaker', () => {
  const film = (id, score, updatedAt, seriesId = id) => ({ id, score, updatedAt, seriesId, title: { english: id }, format: 'TV' });
  const recent = [
    film('tie-older', 9, '2026-10-01'),
    film('tie-newer', 9, '2026-10-04'),
    film('new-season', 8, '2026-10-04', 'same-series'),
    film('old-season', 10, '2026-09-01', 'same-series'),
    ...[7, 6, 5, 4, 3, 2].map(score => film(`film-${score}`, score, '2026-10-02')),
    film('no-score', 0, '2026-10-04'), film('invalid', NaN, '2026-10-04')
  ];
  const result = selectSpotlights(recent);
  assert.deepEqual(result.map(m => m.id), ['tie-newer', 'tie-older', 'new-season', 'film-7', 'film-6', 'film-5', 'film-4']);
  assert.equal(selectSpotlights([]).length, 0);
  assert.deepEqual(selectSpotlights([recent[0]]).map(m => m.id), ['tie-older']);
  assert.equal(recent[0].id, 'tie-older');
});

test('movie pagination scans past TV-only pages, deduplicates and keeps page boundaries', async () => {
  const film = slug => ({ slug, name: slug, tmdb: { type: 'movie' } });
  const pages = [
    [{ slug: 'series', tmdb: { type: 'tv' } }],
    [film('film-a'), film('film-b')],
    [film('film-b'), film('film-c'), film('film-d')]
  ];
  const request = async path => {
    const url = new URL(path, 'https://phimapi.com');
    assert.equal(url.searchParams.get('country'), 'nhat-ban');
    return { data: { items: pages[Number(url.searchParams.get('page')) - 1], params: { pagination: { totalPages: 3 } } } };
  };
  const first = await movieCatalog(1, 2, request);
  assert.deepEqual(first.data.map(m => m.id), ['film-a', 'film-b']);
  assert.equal(first.pagination.hasMore, true);
  const second = await movieCatalog(2, 2, request);
  assert.deepEqual(second.data.map(m => m.id), ['film-c', 'film-d']);
  assert.equal(second.pagination.hasMore, false);
  assert.deepEqual((await movieCatalog(3, 2, request)).data, []);
});

test('movie catalog returns empty only for valid data and propagates upstream errors', async () => {
  const empty = await movieCatalog(-1, 999, async () => ({ data: { items: [] } }));
  assert.deepEqual(empty.pagination, { page: 1, limit: 24, hasMore: false });
  await assert.rejects(movieCatalog(1, 12, async () => ({ data: {} })), /không hợp lệ/);
  await assert.rejects(movieCatalog(1, 12, async () => { throw new Error('upstream offline'); }), /upstream offline/);
});

test('catalog uses native slugs and resolves relative artwork', () => {
  const movie = mapMovie({slug:'test-film',name:'Phim',origin_name:'Film',poster_url:'uploads/test.webp',tmdb:{type:'movie'}});
  assert.equal(movie.id,'test-film');
  assert.equal(movie.coverImage,'https://phimimg.com/uploads/test.webp');
  assert.equal(movie.format,'MOVIE');
  assert.equal(movie.nextAiring,null);
});
test('Vietsub episodes retain specials and exclude other servers or unsafe URLs', () => {
  const episodes=extractEpisodes({episodes:[
    {server_name:'Lồng Tiếng',server_data:[{name:'Dub',link_embed:'https://player.phimapi.com/player/?url=dub'}]},
    {server_name:'Vietsub',server_data:[
      {name:'Tập 01',slug:'tap-01',link_embed:'https://player.phimapi.com/player/?url=1'},
      {name:'Special',slug:'special',link_embed:'https://player.phimapi.com/player/?url=2'},
      {name:'Bad',slug:'bad',link_embed:'https://example.com/player/'}
    ]}
  ]});
  assert.deepEqual(episodes.map(ep=>ep.id),['tap-01','special']);
  assert.deepEqual(episodes.map(ep=>ep.number),[1,2]);
});
test('concurrent catalog requests share cached upstream work', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({status:true,data:{items:[]}})};});
  await Promise.all([kkRequest('/test-cache'),kkRequest('/test-cache')]);
  await kkRequest('/test-cache');
  assert.equal(calls,1);
});
