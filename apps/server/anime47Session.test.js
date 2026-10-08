import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anime47Request, extractAnime47Episodes, anime47EpisodeSource, resolveEpisodesForAnime47 } from './services/anime47.service.js';

test('Anime47 sends a server-side Bearer token only to its fixed API and refreshes cache on token change', async t => {
  const previous = process.env.ANIME47_ACCESS_TOKEN;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, 'https://anime47.love/api/session-regression');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer test-token-${calls}`);
    return { ok: true, json: async () => ({ calls }) };
  });
  try {
    process.env.ANIME47_ACCESS_TOKEN = 'test-token-1';
    assert.deepEqual(await anime47Request('/session-regression'), { calls: 1 });
    assert.deepEqual(await anime47Request('/session-regression'), { calls: 1 });
    process.env.ANIME47_ACCESS_TOKEN = 'Bearer test-token-2';
    assert.deepEqual(await anime47Request('/session-regression'), { calls: 2 });
    await assert.rejects(anime47Request('//external.example/session'), /không hợp lệ/);
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.ANIME47_ACCESS_TOKEN;
    else process.env.ANIME47_ACCESS_TOKEN = previous;
  }
});

test('real episode IDs are sorted and deduplicated across teams, without synthesizing episodes', () => {
  const episodes = extractAnime47Episodes({ teams: [{ groups: [{ episodes: [
    { id: 102, number: 2 }, { id: 101, number: 1 }, { id: 104, number: 'trailer' }
  ] }, { episodes: [{ id: 103, number: 1 }] }] }] });
  assert.deepEqual(episodes.map(ep => [ep.number, ep.sourceEpisodeId]), [[1, '101'], [2, '102']]);
  assert.deepEqual(extractAnime47Episodes({}), []);
});

test('401 refreshes and retries once, with the new session used by later requests', async t => {
  const previousAccess = process.env.ANIME47_ACCESS_TOKEN;
  const previousRefresh = process.env.ANIME47_REFRESH_TOKEN;
  const previousFile = process.env.ANIME47_SESSION_FILE;
  let refreshes = 0;
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/refresh-token')) {
      refreshes++;
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'retry-refresh' });
      return { ok: true, json: async () => ({ access_token: 'retry-renewed', refresh_token: 'retry-rotated', expires_in: 3600 }) };
    }
    reads++;
    if (options.headers.Authorization === 'Bearer retry-old') return { ok: false, status: 401 };
    assert.equal(options.headers.Authorization, 'Bearer retry-renewed');
    return { ok: true, json: async () => ({ reads }) };
  });
  try {
    process.env.ANIME47_ACCESS_TOKEN = 'retry-old';
    process.env.ANIME47_REFRESH_TOKEN = 'retry-refresh';
    process.env.ANIME47_SESSION_FILE = '';
    assert.deepEqual(await anime47Request('/retry-regression'), { reads: 2 });
    assert.deepEqual(await anime47Request('/retry-regression-next'), { reads: 3 });
    assert.equal(refreshes, 1);
  } finally {
    for (const [key, value] of [['ANIME47_ACCESS_TOKEN', previousAccess], ['ANIME47_REFRESH_TOKEN', previousRefresh], ['ANIME47_SESSION_FILE', previousFile]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('authenticated metadata uses Anime47 IDs and does not run unrelated provider searches', async () => {
  const previous = process.env.ANIME47_ACCESS_TOKEN;
  try {
    process.env.ANIME47_ACCESS_TOKEN = 'native-metadata-test-token';
    const result = await resolveEpisodesForAnime47({ id: 'native-session-regression', sourceId: 100 }, {
      a47: async path => {
        assert.equal(path, '/anime/100/episodes');
        return { teams: [{ groups: [{ episodes: [{ id: 101, number: 1 }] }] }] };
      },
      kk: async () => { assert.fail('Native episodes available'); },
      nc: async () => { assert.fail('Native episodes available'); }
    });
    assert.equal(result.provider, 'Anime47');
    assert.equal(result.episodes[0].sourceEpisodeId, '101');
  } finally {
    if (previous === undefined) delete process.env.ANIME47_ACCESS_TOKEN;
    else process.env.ANIME47_ACCESS_TOKEN = previous;
  }
});

test('episode source selects supported HLS and exposes Vietnamese subtitles without credentials', async () => {
  const result = await anime47EpisodeSource('101', async path => {
    assert.equal(path, '/anime/watch/episode/101');
    return { canonical_url: '/xem/kanojo-no-tomodachi-11322/ep-1-126083', streams: [
      { player_type: 'hls', url: 'http://video.example/unsafe.m3u8' },
      { player_type: 'jwplayer', url: 'https://video.example/1.m3u8', subtitles: [
        { label: 'English', file: 'https://video.example/en.vtt' },
        { label: 'Vietnamese', file: 'https://video.example/vi.vtt' }
      ] }
    ] };
  });
  assert.equal(result.type, 'hls');
  assert.equal(result.watch_url, 'https://anime47.best/xem/kanojo-no-tomodachi-11322/ep-1-126083');
  assert.deepEqual(result.subtitles, [{ label: 'Vietnamese', file: 'https://video.example/vi.vtt' }]);
  assert.equal(result.Authorization, undefined);
});

test('missing stream permissions and unsupported embeds are explicit errors', async () => {
  await assert.rejects(anime47EpisodeSource('101', async () => ({ streams: [], access_mode: 'vip' })), { status: 404 });
  await assert.rejects(anime47EpisodeSource('101', async () => ({ streams: [{ player_type: 'iframe', url: 'https://external.example/player' }] })), { status: 404 });
});
