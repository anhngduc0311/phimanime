import { validEmbed, normalizeProviderAnime } from '../../../shared/providers.js';

const cache = new Map();
const pending = new Map();
export async function nguoncRequest(path) {
  const hit = cache.get(path);
  if (hit?.until > Date.now()) return hit.data;
  if (pending.has(path)) return pending.get(path);
  const task = (async () => {
    const response = await fetch('https://phim.nguonc.com/api' + path, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('NguonC HTTP ' + response.status);
    const data = await response.json();
    if (data.status !== 'success') throw new Error('NguonC không có dữ liệu');
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(path, { data, until: Date.now() + 300000 });
    return data;
  })();
  pending.set(path, task);
  try { return await task; } finally { pending.delete(path); }
}

const categories = (movie, group) => Object.values(movie.category || {}).filter(c => c.group?.name === group).flatMap(c => c.list || []).map(c => c.name);
const safeImage = value => { try { return new URL(value).protocol === 'https:' ? value : '/poster-placeholder.svg'; } catch { return '/poster-placeholder.svg'; } };
export function mapNguonc(movie) {
  const english = movie.original_name?.split(',')[0]?.trim() || movie.name;
  const season = `${movie.name} ${english}`.match(/(?:season|phần|mùa)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*season/iu);
  const isMovie = categories(movie, 'Định dạng').includes('Phim lẻ');
  return normalizeProviderAnime({
    id: 'nguonc-' + movie.slug,
    title: { vietnamese: movie.name, english, romaji: movie.name },
    aliases: [movie.name, ...(movie.original_name || '').split(',').map(t => t.trim())],
    source: 'NguonC', studio: 'NguonC',
    seriesId: movie.tmdb?.type === 'tv' ? movie.tmdb.id : null,
    seasonNumber: Number(season?.[1] || season?.[2] || movie.tmdb?.season) || 1,
    coverImage: safeImage(movie.thumb_url || movie.poster_url),
    bannerImage: safeImage(movie.poster_url || movie.thumb_url),
    genres: categories(movie, 'Thể loại'),
    isMovie, format: isMovie ? 'MOVIE' : 'TV',
    score: 0, year: Number(movie.year || categories(movie, 'Năm')[0]) || null,
    status: /hoàn tất/i.test(movie.current_episode || '') ? 'Finished Airing' : 'Currently Airing',
    duration: movie.time || 'Đang cập nhật',
    totalEpisodes: Number(movie.total_episodes) || null,
    currentEpisode: movie.current_episode || '', language: movie.language || 'Vietsub',
    description: (movie.description || '').replace(/<[^>]*>/g, ''), updatedAt: movie.modified
  });
}

export function extractNguoncEpisodes(movie) {
  const episodes = new Map();
  for (const server of movie.episodes || []) {
    if (!/vietsub/i.test(server.server_name)) continue;
    for (const ep of server.items || []) {
      const number = Number(ep.name?.match(/^(?:tập\s*)?(\d+)$/iu)?.[1]);
      if (!number || !validEmbed(ep.embed, 'NguonC') || episodes.has(number)) continue;
      episodes.set(number, { number, id: ep.slug, title: `Tập ${ep.name}`, embed: ep.embed, duration: movie.time || '' });
    }
  }
  return [...episodes.values()].sort((a, b) => a.number - b.number);
}

export async function nguoncDetail(id, request = nguoncRequest) {
  const result = await request('/film/' + id.replace(/^nguonc-/, ''));
  if (!result.movie) throw new Error('Không tìm thấy phim NguonC');
  return { ...mapNguonc(result.movie), episodes: extractNguoncEpisodes(result.movie) };
}

export async function searchNguonc(keyword, request = nguoncRequest) {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const data = await request('/films/search?' + new URLSearchParams({ keyword, page: String(page) }));
    if (!Array.isArray(data.items)) throw new Error('Danh sách NguonC không hợp lệ');
    // Search summaries omit categories. Hydrate before accepting Japanese anime,
    // with bounded concurrency and the same cache used by detail requests.
    for (let offset = 0; offset < data.items.length; offset += 5) {
      const details = await Promise.allSettled(data.items.slice(offset, offset + 5).map(async item => {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug || '') || item.slug.length >= 192) return null;
        return item.category ? item : (await request('/film/' + item.slug)).movie;
      }));
      items.push(...details.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
        .filter(m => categories(m, 'Thể loại').includes('Hoạt hình') && categories(m, 'Quốc gia').includes('Nhật Bản')).map(mapNguonc));
    }
    if (page >= (Number(data.paginate?.total_page) || 1)) break;
  }
  return items;
}
