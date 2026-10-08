import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedAnime47Media, anime47MediaUrl, rewriteAnime47Playlist, serveAnime47Media, unwrapAnime47Segment, fetchAnime47Media, anime47MediaHeaders } from './services/anime47Media.service.js';

test('media requests supply player headers and range without forwarding account credentials', () => {
  const headers = anime47MediaHeaders('bytes=0-1023');
  assert.equal(headers.Origin, 'https://anime47.best');
  assert.match(headers['User-Agent'], /Mozilla/);
  assert.equal(headers.Range, 'bytes=0-1023');
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers.Cookie, undefined);
});

test('media tickets only accept HTTPS on observed Anime47 media hosts', () => {
  for (const url of ['http://pl.vlogphim.net/a.ts', 'https://127.0.0.1/a.ts', 'https://pl.vlogphim.net.evil.example/a.ts', 'https://user:pass@pl.vlogphim.net/a.ts', 'https://pl.vlogphim.net:8443/a.ts']) {
    assert.equal(allowedAnime47Media(url), false);
    assert.throws(() => anime47MediaUrl(url));
  }
  const url = 'https://pl.vlogphim.net/test/master.m3u8?secret=test';
  assert.match(anime47MediaUrl(url), /^\/api\/watch\/anime47\/media\/[a-f0-9]{48}$/);
  assert.equal(anime47MediaUrl(url), anime47MediaUrl(url));
});

test('HLS variants, audio, encryption keys and segments all use opaque local tickets', () => {
  const input = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nvariant.m3u8\nhttps://cdn1.nonprofit.asia/video/1.ts\n';
  const result = rewriteAnime47Playlist(input, 'https://pl.vlogphim.net/test/master.m3u8');
  assert.ok(result.startsWith('#EXTM3U'));
  assert.equal((result.match(/\/api\/watch\/anime47\/media\//g) || []).length, 4);
  assert.equal(result.includes('nonprofit.asia'), false);
  assert.throws(() => rewriteAnime47Playlist('#EXTM3U\nhttps://localhost/secret', 'https://pl.vlogphim.net/a.m3u8'));
});

test('unknown media ticket is rejected without fetching', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Invalid tickets must not fetch'); });
  let status;
  const res = { status(value) { status = value; return this; }, json(value) { return value; } };
  const result = await serveAnime47Media({ params: { ticket: 'invalid' } }, res);
  assert.equal(status, 404);
  assert.equal(result.success, false);
});

test('PNG covers of different sizes are removed only when MPEG-TS packet alignment is verified', () => {
  const ts = Buffer.alloc(188 * 10);
  for (let offset = 0; offset < ts.length; offset += 188) ts[offset] = 0x47;
  for (const length of [0, 436, 819, 1219]) {
    assert.deepEqual(unwrapAnime47Segment(Buffer.concat([Buffer.alloc(length, 0x89), ts])), ts);
  }
  assert.throws(() => unwrapAnime47Segment(Buffer.from('not a video segment')));
  const falseSync = Buffer.alloc(188 * 10);
  falseSync[5] = 0x47;
  assert.throws(() => unwrapAnime47Segment(falseSync));
});

test('a blocked CDN falls back to another verified mirror and avoids the blocked host for subsequent segments', async () => {
  const blocked = new Map();
  const hosts = [];
  const request = async (value, options) => {
    const url = new URL(value);
    hosts.push(url.hostname);
    assert.equal(url.pathname, '/movie/segment.png');
    assert.equal(options.headers.Authorization, undefined);
    return { status: url.hostname === 'cdn1.nonprofit.asia' ? 403 : 200, body: { cancel: async () => {} } };
  };
  const options = { headers: { Origin: 'https://anime47.best' } };
  const result = await fetchAnime47Media('https://cdn1.nonprofit.asia/movie/segment.png', options, request, blocked);
  assert.equal(result.response.status, 200);
  assert.equal(new URL(result.target).hostname, 'cdn2.nonprofit.asia');
  await fetchAnime47Media('https://cdn1.nonprofit.asia/movie/segment.png', options, request, blocked);
  assert.deepEqual(hosts, ['cdn1.nonprofit.asia', 'cdn2.nonprofit.asia', 'cdn2.nonprofit.asia']);
});

test('all mirrors denying access produces an explicit error without repeated denied requests', async () => {
  const blocked = new Map();
  let calls = 0;
  const request = async () => { calls++; return { status: 403, body: { cancel: async () => {} } }; };
  await assert.rejects(fetchAnime47Media('https://cdn1.nonprofit.asia/video.png', {}, request, blocked), { code: 'CDN_ACCESS_DENIED' });
  assert.equal(calls, 7);
  await assert.rejects(fetchAnime47Media('https://cdn1.nonprofit.asia/video.png', {}, request, blocked), { code: 'CDN_ACCESS_DENIED' });
  assert.equal(calls, 7);
});

test('configured relay receives only its secret and preserves the upstream URL for media decoding', async () => {
  const previousUrl = process.env.ANIME47_MEDIA_RELAY_URL;
  const previousToken = process.env.ANIME47_MEDIA_RELAY_TOKEN;
  try {
    process.env.ANIME47_MEDIA_RELAY_URL = 'https://relay.anidoki.com/media';
    process.env.ANIME47_MEDIA_RELAY_TOKEN = 'test-relay-key-'.repeat(3);
    const target = 'https://cdn1.nonprofit.asia/video.png';
    const result = await fetchAnime47Media(target, { headers: { Range: 'bytes=0-100' } }, async (url, options) => {
      assert.equal(url, 'https://relay.anidoki.com/media');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer ' + process.env.ANIME47_MEDIA_RELAY_TOKEN);
      assert.equal(options.headers.Range, 'bytes=0-100');
      assert.deepEqual(JSON.parse(options.body), { url: target });
      return { status: 200 };
    });
    assert.equal(result.target, target);
    process.env.ANIME47_MEDIA_RELAY_URL = 'https://untrusted.example/media';
    await assert.rejects(fetchAnime47Media(target, {}, () => assert.fail('invalid relay must not receive the secret')), { code: 'RELAY_CONFIG_INVALID' });
  } finally {
    for (const [key, value] of [['ANIME47_MEDIA_RELAY_URL', previousUrl], ['ANIME47_MEDIA_RELAY_TOKEN', previousToken]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
