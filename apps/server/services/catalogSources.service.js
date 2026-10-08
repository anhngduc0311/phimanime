import { kkRequest, mapMovie, relatedSeasons } from './kkphim.service.js';
import { searchNguonc } from './nguonc.service.js';
import { seriesKey, seriesTitle, seasonNumber, sameSeries } from '../../../shared/series.js';
import { AdminAnimeModel } from '../models/adminAnime.model.js';

export { sameSeries } from '../../../shared/series.js';

export function mergeSeasons(anime, candidates) {
  const seasons = new Map();
  for (const item of [anime, ...candidates]) {
    if (!sameSeries(anime, item)) continue;
    const number = seasonNumber(item);
    // Identity has already been checked. Providers sometimes use the series'
    // first-air year for every season; year must not create duplicate seasons.
    const key = number;
    if (!seasons.has(key)) seasons.set(key, { ...item, sources: [] });
    const season = seasons.get(key);
    if (season.year && item.year && Number(season.year) !== Number(item.year)) season.year = null;
    if (!season.sources.some(s => s.id === item.id)) season.sources.push({ id: item.id, source: item.source });
  }
  return [...seasons.values()].sort((a, b) => seasonNumber(a) - seasonNumber(b) || a.year - b.year);
}

export async function allRelatedSeasons(anime) {
  if (anime.isMovie) return [anime];
  const keyword = anime.seriesSearch || seriesTitle(anime.title.english || anime.title.vietnamese).replace(/\s*\([^)]*\)\s*$/u, '');
  const results = await Promise.allSettled([
    relatedSeasons(anime),
    searchNguonc(keyword),
    ...(anime.seriesSearch === 'Honzuki' && anime.source === 'NguonC'
      ? [kkRequest('/phim/co-nang-mot-sach').then(d => [mapMovie(d.movie)])] : [])
  ]);
  let candidates = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  try {
    const overrides = await AdminAnimeModel.getAllAnimeOverrides();
    candidates = candidates.filter(item => !overrides.get(item.id)?.is_hidden);
  } catch {}
  return mergeSeasons(anime, candidates);
}
