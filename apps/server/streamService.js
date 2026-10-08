// Anikoto IDs and AniList IDs are separate namespaces.
const API = 'https://anikotoapi.site';
const cache = new Map();
const pending = new Map();
let retryAfter = 0;
async function request(path) {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (pending.has(path)) return pending.get(path);
  if (Date.now() < retryAfter) throw new Error('Anikoto tạm giới hạn yêu cầu');
  const task = (async () => {
    const res = await fetch(API + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      retryAfter = Date.now() + 120000;
      throw new Error('Anikoto HTTP ' + res.status);
    }
    const json = await res.json();
    if (!json.ok || !json.data) throw new Error('Phản hồi Anikoto không hợp lệ');
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(path, { data: json.data, expires: Date.now() + 300000 });
    return json.data;
  })();
  pending.set(path, task);
  try { return await task; } finally { pending.delete(path); }
}
export function positiveId(value) {
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export async function getLiveEpisodes(animeId) {
  if (!positiveId(animeId)) return null;
  try {
    // Bound discovery to the recent feed; older titles use MegaPlay's AniList endpoint.
    const recent = await request('/recent-anime?page=1&per_page=100');
    const match = recent.find(anime => String(anime.ani_id) === String(animeId));
    if (!match || !positiveId(match.id)) return null;
    const series = await request('/series/' + match.id);
    if (String(series.anime?.ani_id) !== String(animeId) || !Array.isArray(series.episodes)) return null;
    return {
      success: true, animeId: Number(animeId), provider: 'Anikoto',
      episodes: series.episodes.filter(ep => positiveId(ep.number)).map(ep => ({
        number: Number(ep.number), title: ep.title || 'Tập ' + ep.number,
        embedId: ep.episode_embed_id,
        languages: Object.keys(ep.embed_url || {}).filter(lang => ['sub', 'dub'].includes(lang))
      })).sort((a, b) => a.number - b.number)
    };
  } catch (err) {
    console.warn('Anikoto: dùng ánh xạ AniList của MegaPlay:', err.message);
    return null;
  }
}
export async function getLiveSources(animeId, episodeNumber = 1, language = 'sub') {
  if (!positiveId(animeId) || !positiveId(episodeNumber) || !['sub', 'dub'].includes(language)) {
    const error = new Error('Mã anime, số tập hoặc ngôn ngữ không hợp lệ');
    error.status = 400;
    throw error;
  }
  const series = await getLiveEpisodes(animeId);
  let path = 'ani/' + animeId + '/' + episodeNumber;
  if (series) {
    const episode = series.episodes.find(ep => ep.number === Number(episodeNumber));
    if (!episode || !episode.languages.includes(language)) return null;
    if (positiveId(episode.embedId)) path = 's-2/' + episode.embedId;
  }
  return { success: true, type: 'embed', provider: 'MegaPlay',
    embed_url: 'https://megaplay.buzz/stream/' + path + '/' + language };
}
