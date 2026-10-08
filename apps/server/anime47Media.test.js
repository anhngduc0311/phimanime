import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedAnime47Media, anime47MediaUrl, rewriteAnime47Playlist, serveAnime47Media, unwrapAnime47Segment } from './services/anime47Media.service.js';

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
