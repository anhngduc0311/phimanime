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
  return (await allRelatedTitles(anime)).seasons;
}

export async function allRelatedTitles(anime) {
  const searchKeywords = new Set();
  const rawKey = anime.seriesSearch || seriesTitle(anime.title?.english || anime.title?.vietnamese || '').replace(/\s*\([^)]*\)\s*$/u, '');
  if (rawKey && rawKey.length >= 3) searchKeywords.add(anime.isMovie ? franchiseTitle(rawKey) : rawKey);
  if (Array.isArray(anime.aliases)) {
    for (const a of anime.aliases) {
      const clean = seriesTitle(a).replace(/\s*\([^)]*\)\s*$/u, '').trim();
      if (clean.length >= 3) searchKeywords.add(anime.isMovie ? franchiseTitle(clean) : clean);
    }
  }

  const results = await Promise.allSettled([
    relatedSeasons(anime),
    ...[...searchKeywords].map(async kw => {
      const { searchAnime47 } = await import('./anime47.service.js');
      return searchAnime47(kw);
    }),
    ...[...searchKeywords].map(kw => searchNguonc(kw)),
    ...[...searchKeywords].map(kw => kkRequest('/v1/api/tim-kiem?keyword=' + encodeURIComponent(kw) + '&limit=64').then(res => (res.data?.items || []).map(mapMovie)).catch(() => [])),
    ...(anime.seriesSearch === 'Honzuki' && anime.source === 'NguonC'
      ? [kkRequest('/phim/co-nang-mot-sach').then(d => [mapMovie(d.movie)])] : [])
  ]);
  let candidates = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  try {
    const overrides = await AdminAnimeModel.getAllAnimeOverrides();
    candidates = candidates.filter(item => !overrides.get(item.id)?.is_hidden);
  } catch {}
  const anchor = anime.isMovie ? candidates.find(item => !isRelatedMovie(item) && sameFranchise(anime, item)) : anime;
  return {
    seasons: anchor ? mergeSeasons(anchor, candidates.filter(item => !isRelatedMovie(item))) : [],
    movies: mergeRelatedMovies(anime, candidates)
  };
}

const titleList = item => [...Object.values(item.title || {}), ...(item.aliases || [])].filter(Boolean);
const franchiseTitle = title => seriesTitle(title).split(/\s+(?:movie|film|ova|special|gekijouban)\b|[:：]|\s+[-–—]\s+/i)[0].trim();
const normalized = title => title.normalize('NFKC').toLowerCase().replace(/["'’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const franchiseKeys = item => titleList(item).map(franchiseTitle).map(normalized).filter(key => key.length > 3);
export function sameFranchise(a, b) {
  const left = franchiseKeys(a);
  return franchiseKeys(b).some(key => left.includes(key));
}
export function isRelatedMovie(item) {
  const titles = titleList(item).join(' ');
  if (/\b(?:OVA|ONA)\b/i.test(titles) || ['OVA', 'ONA', 'SPECIAL'].includes(item.format)) return false;
  return item.isMovie || item.format === 'MOVIE' || /\b(?:movie|gekijouban)\b/i.test(titles);
}
export function mergeRelatedMovies(anime, candidates) {
  const groups = [];
  for (const item of [anime, ...candidates].sort((a,b) => Number(Boolean(b.year)) - Number(Boolean(a.year)))) {
    if (!isRelatedMovie(item) || !sameFranchise(anime, item)) continue;
    const numbered = titleList(item).map(title => title.match(/\b(?:movie|film|gekijouban)\s*(\d+)\b/i)?.[1]).find(Boolean);
    const aliases = titleList(item).map(title => normalized(title.replace(/\b(?:movie|film)\s*1?\s*[:：]?/gi, ' ')));
    const existing = groups.find(group => {
      if (numbered && group.numbered) return numbered === group.numbered && sameFranchise(group.item, item);
      return group.aliases.some(alias => aliases.includes(alias));
    });
    if (existing) {
      existing.aliases.push(...aliases);
      if (!existing.sources.some(source => source.id === item.id)) existing.sources.push({ id: item.id, source: item.source });
    } else groups.push({ item: { ...item, isMovie: true, format: 'MOVIE' }, numbered, aliases, sources: [{ id: item.id, source: item.source }] });
  }
  return groups.sort((a,b) => (a.item.year || 9999) - (b.item.year || 9999) || Number(a.numbered || 1) - Number(b.numbered || 1))
    .map(group => ({ ...group.item, sources: group.sources }));
}
