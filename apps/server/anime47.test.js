import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAnime47, getAnime47LatestEpisodes, anime47Detail, resolveEpisodesForAnime47 } from './services/anime47.service.js';

test('mapAnime47 correctly maps raw Anime47 items to AniDoki anime model', () => {
  const sample = {
    id: 11248,
    link: '/phim/kikansha-no-mahou-wa-tokubetsu-desu-2nd-season/m11248.html',
    title: 'Kikansha no Mahou wa Tokubetsu desu 2nd Season',
    titles: [
      { language: 'Synonyms', title: 'Kikansha no Mahou wa Tokubetsu desu 2nd Season' },
      { language: 'Japanese', title: '帰還者の魔法は特別です 2期' },
      { language: 'English', title: "A Returner's Magic Should Be Special Season 2" },
      { language: 'Tiếng Việt', title: 'Phép Thuật Của Người Trở Về Phần 2' }
    ],
    description: 'Desir Arman, một pháp sư tài năng...',
    episodes: '12',
    status: 'Ongoing',
    current_episode: '1',
    genres: ['Action', 'Fantasy'],
    image: 'https://imgs.anime47.best/imgs/post-poster/4b37a836b26c4e4c04050f3ae6c5b530.jpg',
    type: 'TV',
    slug: 'kikansha-no-mahou-wa-tokubetsu-desu-2nd-season',
    post_view: 500
  };

  const anime = mapAnime47(sample);
  assert.equal(anime.id, 'anime47-kikansha-no-mahou-wa-tokubetsu-desu-2nd-season');
  assert.equal(anime.slug, 'kikansha-no-mahou-wa-tokubetsu-desu-2nd-season');
  assert.equal(anime.title.english, "A Returner's Magic Should Be Special Season 2");
  assert.equal(anime.title.vietnamese, 'Phép Thuật Của Người Trở Về Phần 2');
  assert.equal(anime.title.romaji, '帰還者の魔法は特別です 2期');
  assert.equal(anime.currentEpisode, '1');
  assert.equal(anime.totalEpisodes, 12);
  assert.equal(anime.status, 'Currently Airing');
  assert.equal(anime.source, 'Anime47');
  assert.equal(anime.sourceId, 11248);
  assert.equal(anime.studio, 'Anime47');
  assert.equal(anime.format, 'TV');
  assert.equal(anime.isMovie, false);
  assert.equal(anime.seasonNumber, 2);
  assert.equal(anime.coverImage, 'https://imgs.anime47.best/imgs/post-poster/4b37a836b26c4e4c04050f3ae6c5b530.jpg');
});

test('mapAnime47 handles movie type properly', () => {
  const movieSample = {
    id: 10406,
    title: 'Toki wo Kakeru Shoujo',
    titles: [
      { language: 'English', title: 'The Girl Who Leapt Through Time' },
      { language: 'Tiếng Việt', title: 'Cô Gái Vượt Thời Gian' }
    ],
    episodes: '1',
    status: 'Completed',
    current_episode: '1',
    type: 'Movie',
    slug: 'toki-wo-kakeru-shoujo',
    image: 'https://imgs.anime47.best/imgs/post-poster/7eba59d2763f94de0b390b925a47030f.jpg'
  };

  const anime = mapAnime47(movieSample);
  assert.equal(anime.format, 'MOVIE');
  assert.equal(anime.isMovie, true);
  assert.equal(anime.status, 'Finished Airing');
  assert.equal(anime.currentEpisode, '1');
});

test('getAnime47LatestEpisodes returns mapped anime items from API', async () => {
  const result = await getAnime47LatestEpisodes(1, 12);
  const items = result.items;
  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);
  assert.ok(items[0].id.startsWith('anime47-'));
  assert.ok(items[0].title.english || items[0].title.vietnamese);
  assert.ok(items[0].coverImage);
});

test('anime47Detail retrieves details and resolves episode structure', async () => {
  const result = await getAnime47LatestEpisodes(1, 5);
  const items = result.items;
  assert.ok(items.length > 0);
  const first = items[0];

  const detail = await anime47Detail(first.id);
  assert.equal(detail.id, first.id);
  assert.ok(Array.isArray(detail.episodes));
  if (detail.episodes.length) {
    assert.equal(detail.episodes[0].number, 1);
    assert.ok(detail.episodes.every(ep => ep.stream || ep.embed));
  } else {
    assert.ok(detail.playbackUnavailable?.message);
    assert.equal(detail.streamType, null);
  }
});

test('unavailable Anime47 titles expose no invented episodes and report private mode', async () => {
  const anime = mapAnime47({ id: 900001, slug: 'private-mode-regression', title: 'Private Mode Regression', episodes: 12, current_episode: '1' });
  const calls = [];
  const result = await resolveEpisodesForAnime47(anime, {
    kk: async () => ({ data: { items: [] } }),
    nc: async () => ({ items: [] }),
    a47: async path => {
      calls.push(path);
      if (path.endsWith('/episodes')) throw Object.assign(new Error('Login required'), { status: 401, code: 'PRIVATE_MODE' });
      return { results: [] };
    }
  });
  assert.deepEqual(result.episodes, []);
  assert.equal(result.type, null);
  assert.equal(result.unavailable.code, 'SOURCE_LOGIN_REQUIRED');
  assert.ok(calls.includes('/anime/900001/episodes'));
});

test('missing sources return an explicit unavailable status even with a catalog episode count', async () => {
  const anime = mapAnime47({ slug: 'no-stream-regression', title: 'No Stream Regression', episodes: 24 });
  const result = await resolveEpisodesForAnime47(anime, {
    kk: async () => ({ data: { items: [] } }),
    nc: async () => ({ items: [] }),
    a47: async () => ({ results: [] })
  });
  assert.deepEqual(result.episodes, []);
  assert.equal(result.unavailable.code, 'NO_PLAYABLE_SOURCE');
});

test('a playable fallback remains available without requiring Anime47 login', async () => {
  const anime = mapAnime47({ id: 900002, slug: 'playable-regression', title: 'Playable Regression' });
  const result = await resolveEpisodesForAnime47(anime, {
    kk: async () => ({
      movie: { type: 'hoathinh' },
      episodes: [{ server_name: 'Vietsub', server_data: [{ name: '1', slug: '1', link_embed: 'https://player.phimapi.com/player/?url=test', link_m3u8: 'https://video.example/1.m3u8' }] }]
    }),
    nc: async () => { assert.fail('Fallback already resolved'); },
    a47: async () => { assert.fail('Anime47 login must not block a playable fallback'); }
  });
  assert.equal(result.provider, 'AniDoki');
  assert.equal(result.episodes[0].stream, 'https://video.example/1.m3u8');
  assert.equal(result.unavailable, undefined);
});

test('anime47Detail resolves valid video streams for matched anime', async () => {
  // Test with Toki wo Kakeru Shoujo or a known anime
  const detail = await anime47Detail('anime47-toki-wo-kakeru-shoujo');
  assert.ok(detail.episodes.length > 0);
  const ep1 = detail.episodes[0];
  assert.ok(ep1.stream || ep1.embed, 'Episode 1 should have a valid stream or embed');
});
