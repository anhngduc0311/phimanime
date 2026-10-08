import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import { createHmac } from 'node:crypto';
import { anime47MediaUrl, rewriteAnime47Playlist } from '../../apps/server/services/anime47Media.service.js';

const env = { RELAY_TOKEN: 'test-relay-secret-'.repeat(3) };
const request = url => new Request('https://relay.anidoki.com/media', {
  method: 'POST', headers: { Authorization: 'Bearer ' + env.RELAY_TOKEN }, body: JSON.stringify({ url })
});

test('relay rejects unauthorized callers and unsupported destinations before fetching', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('must reject without network'));
  assert.equal((await worker.fetch(new Request('https://relay.anidoki.com/media', { method: 'POST' }), env)).status, 401);
  for (const url of ['https://localhost/a', 'http://cdn1.nonprofit.asia/a', 'https://cdn1.nonprofit.asia.evil.example/a', 'https://user:pass@cdn1.nonprofit.asia/a']) {
    assert.equal((await worker.fetch(request(url), env)).status, 400);
  }
});

test('relay streams original segments and never forwards its authorization to the CDN', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://cdn1.nonprofit.asia/video.png');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Origin, 'https://anime47.best');
    assert.equal(options.redirect, 'manual');
    return new Response('segment', { headers: { 'Content-Type': 'image/png' } });
  });
  const response = await worker.fetch(request('https://cdn1.nonprofit.asia/video.png'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(await response.text(), 'segment');
});

test('relay does not follow redirects to private or unsupported hosts', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } });
  });
  assert.equal((await worker.fetch(request('https://cdn1.nonprofit.asia/video.png'), env)).status, 502);
  assert.equal(calls, 1);
});

test('server-signed browser links are verified, unwrap PNG segments and supply player CORS', async t => {
  const keys = ['ANIME47_MEDIA_RELAY_URL', 'ANIME47_MEDIA_RELAY_TOKEN', 'ANIME47_MEDIA_RELAY_MODE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { ANIME47_MEDIA_RELAY_URL: 'https://relay.anidoki.com/media', ANIME47_MEDIA_RELAY_TOKEN: env.RELAY_TOKEN, ANIME47_MEDIA_RELAY_MODE: 'browser' });
    const media = 'https://cdn1.nonprofit.asia/video.png';
    const signed = anime47MediaUrl(media);
    assert.equal(signed.includes(env.RELAY_TOKEN), false);
    assert.equal(rewriteAnime47Playlist('#EXTM3U\n' + media, 'https://pl.vlogphim.net/test.m3u8').includes('https://relay.anidoki.com/media?'), true);
    assert.match(anime47MediaUrl('https://pl.vlogphim.net/test.m3u8'), /^\/api\/watch\/anime47\/media\//);
    const ts = new Uint8Array(188 * 10);
    for (let i = 0; i < ts.length; i += 188) ts[i] = 0x47;
    const png = new Uint8Array(ts.length + 819);
    png.set(ts, 819);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      calls++;
      assert.equal(options.headers.Authorization, undefined);
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    });
    const response = await worker.fetch(new Request(signed, { headers: { Origin: 'https://anidoki.com' } }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://anidoki.com');
    assert.equal(response.headers.get('Content-Type'), 'video/mp2t');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), ts);
    const bad = new URL(signed);
    bad.searchParams.set('signature', '0'.repeat(64));
    assert.equal((await worker.fetch(new Request(bad), env)).status, 401);
    for (const data of [{ url: media, expires: Date.now() - 1 }, { url: 'https://localhost/private', expires: Date.now() + 60000 }]) {
      const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
      const signature = createHmac('sha256', env.RELAY_TOKEN).update(payload).digest('hex');
      assert.equal((await worker.fetch(new Request('https://relay.anidoki.com/media?' + new URLSearchParams({ payload, signature })), env)).status, 401);
    }
    assert.equal(calls, 1);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
