import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRelatedMovies, mergeSeasons, sameFranchise } from './services/catalogSources.service.js';

const tv = { id: 'tv', title: { english: 'Trinity Seven' }, source: 'NguonC', seasonNumber: 1 };
const movie = (id, name, year, source = 'Anime47') => ({ id, title: { english: name }, year, isMovie: true, source });
test('movies from the same franchise are separate from seasons and combine source duplicates', () => {
  const entries = [
    movie('first', 'Trinity Seven Movie: Eternity Library to Alchemic Girl', 2017),
    movie('first-copy', 'Trinity Seven Movie 1: Eternity Library to Alchemic Girl', 2017, 'NguonC'),
    movie('second', 'Trinity Seven Movie 2: Tenkuu Toshokan to Shinku no Maou', 2019),
    movie('second-copy', 'Trinity Seven Movie 2', null),
    movie('unrelated', 'Trinity Blood Movie', 2017),
    movie('ova', 'Trinity Seven OVA', 2015)
  ];
  const movies = mergeRelatedMovies(tv, entries);
  assert.equal(movies.length, 2);
  assert.deepEqual(movies.map(m=>m.year), [2017,2019]);
  assert.deepEqual(movies.map(m=>m.sources.length), [2,2]);
  assert.equal(mergeSeasons(tv, entries).length, 1);
  assert.equal(sameFranchise(tv, entries[4]), false);
  assert.equal(mergeRelatedMovies(entries[0], [tv, ...entries]).length, 2);
});
