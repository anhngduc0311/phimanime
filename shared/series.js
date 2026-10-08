// Prefer provider series IDs; only remove explicit season markers in title fallback.
const marker = /\s*[([]?\s*(?:season|phần|mùa|ss)\s*(\d+)\s*[)\]]?/giu;
export function seriesTitle(title = '') {
  return title.replace(marker, ' ').replace(/\s+/g, ' ').trim();
}
export function seriesKey(anime) {
  if (anime.isMovie || anime.format === 'MOVIE') return `movie:${anime.id}`;
  if (anime.seriesId) {
    const id = String(anime.seriesId);
    // Some AniDoki entries append the season to the TMDB series ID.
    // Only strip a numeric suffix when it matches this entry's known season.
    const suffixed = id.match(/^(\d+)-(\d+)$/);
    const knownSeason = `${anime.title?.vietnamese || ''} ${anime.title?.english || ''}`.match(/(?:season|phần|mùa|ss)\s*(\d+)/iu)?.[1] || anime.seasonNumber;
    return `tv:${suffixed && Number(knownSeason) === Number(suffixed[2]) ? suffixed[1] : id}`;
  }
  const title = seriesTitle(anime.title?.vietnamese || anime.title?.english || '');
  return title ? `title:${title.normalize('NFKC').toLocaleLowerCase('vi')}` : `item:${anime.id}`;
}
export function groupSeries(items) {
  const groups = new Map();
  for (const item of items) {
    const key = seriesKey(item);
    if (!groups.has(key)) groups.set(key, { ...item, seasons: [] });
    const group = groups.get(key);
    if (!group.seasons.some(season => season.id === item.id)) group.seasons.push(item);
  }
  return [...groups.values()];
}
export function seasonNumber(anime) {
  const explicit = `${anime.title?.vietnamese || ''} ${anime.title?.english || ''}`.match(/(?:season|phần|mùa|ss)\s*(\d+)/iu);
  return Number(explicit?.[1] || anime.seasonNumber) || 1;
}

const cleanTitle = title => seriesTitle(title.replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, 'Season $1')).normalize('NFKC').toLocaleLowerCase('vi').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
export const seriesAliases = anime => [...Object.values(anime.title || {}), ...(anime.aliases || [])].filter(Boolean).map(cleanTitle);
export function sameSeries(a, b) {
  if (a.isMovie || b.isMovie) return a.id === b.id;
  if (a.seriesId && b.seriesId) return seriesKey(a) === seriesKey(b);
  const titles = seriesAliases(a);
  return seriesAliases(b).some(t => t.length > 3 && titles.includes(t));
}

