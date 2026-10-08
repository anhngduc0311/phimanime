import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedAnime47Subtitle, anime47SubtitleUrl, serveAnime47Subtitle } from './services/anime47Subtitle.service.js';

const source = 'https://anime47.love/subtitles/462331/11322_01.vi_ai.vtt?expires=123&signature=test';
test('subtitle proxy permits signed subtitle paths and rejects arbitrary hosts and paths', () => {
  assert.equal(allowedAnime47Subtitle(source), true);
  for (const url of ['https://127.0.0.1/a.vtt', 'https://anime47.love/api/users', 'https://anime47.love.evil.test/subtitles/1/a.vtt', 'https://user:pass@anime47.love/subtitles/1/a.vtt']) {
    assert.equal(allowedAnime47Subtitle(url), false);
    assert.throws(() => anime47SubtitleUrl(url));
  }
});

test('subtitle proxy returns VTT on same origin without forwarding upstream CORS or account credentials', async t => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nXin chào\n';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, source);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    return new Response(vtt, { headers: { 'Access-Control-Allow-Origin': 'https://anime47.best' } });
  });
  const headers = {};
  const res = { setHeader(k,v) { headers[k]=v; }, type(v) { headers.type=v; return this; }, send(v) { return v; } };
  const ticket = anime47SubtitleUrl(source).split('/').pop();
  assert.equal(await serveAnime47Subtitle({ params: { ticket } }, res), vtt);
  assert.equal(headers.type, 'text/vtt');
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
});

test('unknown subtitle tickets never fetch an upstream URL', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected upstream request'));
  assert.equal(await serveAnime47Subtitle({ params: { ticket: 'unknown' } }, { sendStatus: s => s }), 404);
});
