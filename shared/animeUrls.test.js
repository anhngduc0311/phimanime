import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAnimeId, internalAnimeId, publicAnimeUrl, internalAnimeUrl } from './animeUrls.js';

test('Public URLs round trip to the existing provider identity', () => {
  assert.equal(publicAnimeId('anime47-example'), 'anido-example');
  assert.equal(internalAnimeId('anido-example'), 'anime47-example');
  for (const path of ['/anime/anime47-example', '/watch/anime47-example/12?language=vi#player']) {
    const canonical = publicAnimeUrl(path);
    assert.equal(canonical.includes('anime47-'), false);
    assert.equal(internalAnimeUrl(canonical), path);
    assert.equal(publicAnimeUrl(canonical), canonical);
  }
});

test('Other providers, query values, and upstream addresses remain intact', () => {
  for (const path of ['/anime/nguonc-example', '/watch/example/1', '/browse?q=anime47-example', 'https://anime47.best/xem/example']) {
    assert.equal(publicAnimeUrl(path), path);
    assert.equal(internalAnimeUrl(path), path);
  }
});
