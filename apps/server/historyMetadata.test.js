import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairHistoryMetadata, needsHistoryMetadata } from './services/historyMetadata.service.js';

test('repairs old ID placeholders while keeping resume progress and history ordering', async () => {
  const old = { animeId: 'anime47-kikansha-no-mahou', anime: { title: { english: 'anime47-kikansha-no-mahou' } }, currentTime: 98, episodeNumber: 1, updatedAt: 'yesterday' };
  const valid = { animeId: 'valid', anime: { title: { english: 'Valid title' } } };
  let persisted;
  const repaired = await repairHistoryMetadata([old, valid], async id => ({ id, title: { english: 'Kikansha no Mahou' }, coverImage: 'https://example.test/poster.jpg' }), async (id, anime) => { persisted = { id, anime }; });
  assert.equal(repaired[0].anime.title.english, 'Kikansha no Mahou');
  assert.equal(repaired[0].currentTime, 98);
  assert.equal(repaired[0].updatedAt, old.updatedAt);
  assert.equal(repaired[1], valid);
  assert.equal(persisted.id, old.animeId);
});

test('unavailable titles never display provider IDs and remain eligible for retry', async () => {
  const repaired = await repairHistoryMetadata([{ animeId: 'anime47-example-title' }], async () => { throw Error('offline'); }, async () => assert.fail('Cannot persist failed metadata'));
  assert.equal(repaired[0].anime.title.english, 'example title');
  assert.ok(needsHistoryMetadata(repaired[0]));
});
