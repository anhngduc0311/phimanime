import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSeries, seriesKey, seriesTitle, seasonNumber } from '../../shared/series.js';
import { mapMovie, relatedSeasons } from './kkphim.js';

const raw = (slug, season, id = '134667') => ({ slug, name: `Chuyển Sinh Thành Kiếm (Phần ${season})`, origin_name: `Reincarnated As A Sword (Season ${season})`, type: 'hoathinh', tmdb: { id, type: 'tv', season } });
test('ordinal season names use the base search title and keep their season number', () => {
  const base = 'Kikansha no Mahou wa Tokubetsu desu';
  assert.equal(seriesTitle(base + ' 2nd Season'), base);
  assert.equal(seasonNumber({ title: { english: base + ' 2nd Season' }, seasonNumber: 1 }), 2);
  assert.equal(groupSeries([
    { id: 'first', title: { english: base } },
    { id: 'second', title: { english: base + ' 2nd Season' } }
  ]).length, 1);
  assert.equal(seriesTitle('Mobile Suit Gundam 00'), 'Mobile Suit Gundam 00');
});
test('home collapses seasons using series identity while retaining representative and all slugs', () => {
  const second = mapMovie(raw('sword-two', 2));
  const first = mapMovie(raw('sword-one', 1));
  const unrelated = mapMovie(raw('remake', 1, 'different-id'));
  const movie = { ...first, id: 'movie', isMovie: true, format: 'MOVIE' };
  const groups = groupSeries([second, first, first, unrelated, movie]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].id, 'sword-two');
  assert.deepEqual(groups[0].seasons.map(s => s.id), ['sword-two', 'sword-one']);
});
test('fallback only strips explicit season markers, preserving significant title numbers', () => {
  assert.equal(seriesTitle('86 Eighty Six (Season 2)'), '86 Eighty Six');
  assert.equal(seriesTitle('7 Viên Ngọc Rồng (Phần 2)'), '7 Viên Ngọc Rồng');
  assert.equal(seriesTitle('Mobile Suit Gundam 00'), 'Mobile Suit Gundam 00');
  assert.equal(seasonNumber({ title: { english: 'Example (Season 2)' }, seasonNumber: 1 }), 2);
  assert.equal(groupSeries([1, 2].map(n => ({ id: `test-${n}`, title: { vietnamese: `Phim (Phần ${n})` } }))).length, 1);
});
test('related seasons discovers other result pages, excludes remakes and movies, sorts by season', async () => {
  const anime = mapMovie(raw('sword-two', 2));
  const result = await relatedSeasons(anime, async path => {
    const url = new URL(path, 'https://phimapi.com');
    assert.equal(url.searchParams.get('keyword'), 'Chuyển Sinh Thành Kiếm');
    const items = url.searchParams.get('page') === '1'
      ? [raw('sword-two', 2), raw('other', 1, 'other')]
      : [raw('sword-one', 1), { ...raw('movie', 1), type: 'single' }];
    return { data: { items, params: { pagination: { totalPages: 2 } } } };
  });
  assert.deepEqual(result.map(s => s.id), ['sword-one', 'sword-two']);
});

test('season-suffixed provider IDs resolve all four Classroom seasons from any season', async () => {
  const entries = [1, 2, 3, 4].map(n => ({
    slug: `classroom-season-${n}`, type: 'hoathinh',
    name: `Chào Mừng Đến Với Lớp Học Đề Cao Thực Lực (Phần ${n})`,
    origin_name: `Classroom Of The Elite (Season ${n})`,
    tmdb: { type: 'tv', id: n <= 2 ? `72517-${n}` : '72517', season: n }
  }));
  const mapped = entries.map(mapMovie);
  assert.equal(groupSeries(mapped).length, 1);
  for (const current of mapped) {
    const seasons = await relatedSeasons(current, async () => ({ data: { items: entries } }));
    assert.deepEqual(seasons.map(seasonNumber), [1, 2, 3, 4]);
  }
  assert.equal(seriesKey({ ...mapped[0], seriesId: '72517-9' }), 'tv:72517-9');
  assert.equal(seriesKey({ seriesId: '72517-1', title: {} }), 'tv:72517-1');
  assert.notEqual(seriesKey({ ...mapped[0], seriesId: '99999-1' }), seriesKey(mapped[0]));
});
