import { normalizeProviderAnime } from '../../../shared/providers.js';
import { seriesKey, seriesTitle, seasonNumber } from '../../../shared/series.js';
import { kkRequest, mapMovie, extractEpisodes } from './kkphim.service.js';
import { nguoncRequest, extractNguoncEpisodes } from './nguonc.service.js';
import { createHash } from 'node:crypto';
import { validEmbed } from '../../../shared/providers.js';

const cache = new Map();
const pending = new Map();
const memoryAnime47Store = new Map();
const episodesCache = new Map();
let sessionFingerprint = '';

function sessionHeaders() {
  const token = (process.env.ANIME47_ACCESS_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  const fingerprint = createHash('sha256').update(token).digest('hex');
  if (fingerprint !== sessionFingerprint) {
    cache.clear();
    episodesCache.clear();
    sessionFingerprint = fingerprint;
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Chuẩn hóa chuỗi tìm kiếm bỏ dấu và ký tự đặc biệt
 */
function normalizeStr(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Làm sạch từ khóa tìm kiếm (bỏ season, phần, ký tự ngoặc)
 */
function cleanKeyword(str) {
  if (!str) return '';
  return str
    .replace(/[([][^)]*[)\]]/g, ' ')
    .replace(/(?:season|phần|mùa|ss)\s*\d+/gi, ' ')
    .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, ' ')
    .replace(/\b(?:ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, ' ')
    .replace(/[:\-_\/,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tính điểm tương đồng giữa hai tên phim
 */
function calculateSimilarity(str1, str2) {
  const s1 = normalizeStr(str1);
  const s2 = normalizeStr(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const w1 = new Set(s1.split(' ').filter(w => w.length > 1));
  const w2 = new Set(s2.split(' ').filter(w => w.length > 1));
  if (w1.size === 0 || w2.size === 0) return 0;

  let common = 0;
  for (const w of w1) {
    if (w2.has(w)) common++;
  }
  return (2 * common) / (w1.size + w2.size);
}

/**
 * Gửi HTTP request tới Anime47 API có cache và timeout
 */
export async function anime47Request(path) {
  const auth = sessionHeaders();
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Đường dẫn Anime47 không hợp lệ');
  const requestKey = sessionFingerprint + ':' + path;
  const hit = cache.get(path);
  if (hit?.until > Date.now()) return hit.data;
  if (pending.has(requestKey)) return pending.get(requestKey);

  const task = (async () => {
    const url = 'https://anime47.love/api' + path;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://anime47.best/',
        'Origin': 'https://anime47.best',
        'Accept': 'application/json, text/plain, */*',
        ...auth
      },
      redirect: 'error',
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.message || `Anime47 HTTP error ${response.status}`);
      error.status = response.status;
      error.code = body.code;
      throw error;
    }

    const data = await response.json();
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    if (requestKey.startsWith(sessionFingerprint + ':')) {
      cache.set(path, { data, until: Date.now() + 300000 });
    }
    return data;
  })();

  pending.set(requestKey, task);
  try {
    return await task;
  } finally {
    pending.delete(requestKey);
  }
}

/**
 * Chuyển đổi dữ liệu từ Anime47 sang chuẩn AniDoki Anime Model
 */
export function mapAnime47(item) {
  if (!item) return null;

  const isMovie = item.type?.toUpperCase() === 'MOVIE';
  const titles = Array.isArray(item.titles) ? item.titles : [];

  const engTitleObj = titles.find(t => t.language?.toLowerCase() === 'english');
  const vieTitleObj = titles.find(t =>
    t.language?.toLowerCase() === 'tiếng việt' ||
    t.language?.toLowerCase() === 'vietnamese' ||
    t.language?.toLowerCase() === 'tieng viet'
  );
  const jpTitleObj = titles.find(t => t.language?.toLowerCase() === 'japanese');

  const english = engTitleObj?.title || item.title || 'Anime';
  const vietnamese = vieTitleObj?.title || item.title || english;
  const romaji = jpTitleObj?.title || item.title || english;

  const rawEp = String(item.current_episode ?? '');
  const currentEpMatch = rawEp.match(/\d+/)?.[0];
  const currentEp = currentEpMatch || (isMovie ? 'Full' : (rawEp || '1'));
  const totalEp = Number(item.episodes) || null;
  const genres = Array.isArray(item.genres) && item.genres.length
    ? item.genres.map(g => (typeof g === 'string' ? g : g.name)).filter(Boolean)
    : ['Anime', 'Hoạt Hình'];

  const seasonMatch = `${item.title} ${english}`.match(/(?:season|phần|mùa|ss)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*season/iu);
  const seasonNum = Number(seasonMatch?.[1] || seasonMatch?.[2]) || 1;

  const image = item.poster || item.image || item.poster_url || item.thumb_url || '/poster-placeholder.svg';

  // Tính điểm đánh giá giả lập dựa trên lượt xem hoặc mặc định 8.6
  let score = 8.6;
  const views = Number(item.views || item.post_view) || 0;
  if (views > 0) {
    score = +(7.5 + Math.min(2.3, Math.log10(views + 10) * 0.65)).toFixed(1);
  }

  const slug = item.slug || String(item.id || '');
  const id = slug ? (slug.startsWith('anime47-') ? slug : `anime47-${slug}`) : `anime47-${item.id}`;

  const year = Number(item.year) || (item.aired_from ? new Date(item.aired_from).getFullYear() : new Date().getFullYear());
  const description = (item.synopsis || item.description || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  const anime = normalizeProviderAnime({
    id,
    slug: slug.replace(/^anime47-/, ''),
    title: {
      english,
      vietnamese,
      romaji
    },
    aliases: [item.title, ...titles.map(t => t.title).filter(Boolean)],
    source: 'Anime47',
    sourceId: item.id,
    studio: Array.isArray(item.studios) && item.studios.length ? item.studios[0]?.name || 'Anime47' : 'Anime47',
    seasonNumber: seasonNum,
    coverImage: image,
    bannerImage: image,
    genres,
    isMovie,
    format: isMovie ? 'MOVIE' : (item.type?.toUpperCase() || 'TV'),
    score,
    year,
    startDate: String(year),
    season: String(item.season || year),
    status: item.status?.toLowerCase() === 'completed' ? 'Finished Airing' : 'Currently Airing',
    duration: isMovie ? 'Movie' : (item.duration && item.duration !== 'Unknown' ? item.duration : '24m/tập'),
    totalEpisodes: totalEp,
    currentEpisode: currentEp,
    language: item.lang_subs ? (item.lang_subs.includes('Vi') ? 'Vietsub' : 'Sub') : 'Vietsub',
    description,
    updatedAt: item.aired_from || new Date().toISOString()
  });

  // Lưu vào bộ nhớ để phục vụ detail lookup
  memoryAnime47Store.set(id, anime);
  memoryAnime47Store.set(slug, anime);
  if (item.id) memoryAnime47Store.set(String(item.id), anime);

  return anime;
}

/**
 * Lấy danh sách Anime mới cập nhật từ Anime47 có hỗ trợ phân trang
 * @param {number} page
 * @param {number} limit
 */
export async function getAnime47LatestEpisodes(page = 1, limit = 24) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const path = `/anime/filter?sort=latest&page=${pageNum}`;
  let rawList = [];
  let pagination = { page: pageNum, totalPages: 100, hasMore: true };

  try {
    const res = await anime47Request(path);
    if (res?.data?.posts && Array.isArray(res.data.posts)) {
      rawList = res.data.posts;
      if (res.data.pagination) {
        pagination = {
          page: Number(res.data.pagination.current_page) || pageNum,
          totalPages: Number(res.data.pagination.last_page) || 100,
          hasMore: (Number(res.data.pagination.current_page) || pageNum) < (Number(res.data.pagination.last_page) || 100)
        };
      }
    } else if (Array.isArray(res?.data)) {
      rawList = res.data;
    } else if (Array.isArray(res)) {
      rawList = res;
    }
  } catch (err) {
    if (pageNum === 1) {
      const fallbackRes = await anime47Request('/home-page/latest-episode-posts');
      rawList = Array.isArray(fallbackRes?.data) ? fallbackRes.data : (Array.isArray(fallbackRes) ? fallbackRes : []);
    } else {
      throw err;
    }
  }

  const mapped = rawList.map(mapAnime47).filter(Boolean);
  return {
    items: limit ? mapped.slice(0, limit) : mapped,
    pagination
  };
}

/**
 * Lấy chi tiết Anime từ Anime47 và tìm nguồn phát / tập phim liên kết
 */
export async function anime47Detail(slugOrId) {
  const cleanId = String(slugOrId || '').replace(/^anime47-/, '');
  let anime = memoryAnime47Store.get(slugOrId) || memoryAnime47Store.get(cleanId);

  if (!anime) {
    // Thử load danh sách trang 1 và 2 để hydrate cache
    try {
      const [p1, p2] = await Promise.all([
        getAnime47LatestEpisodes(1, 48),
        getAnime47LatestEpisodes(2, 48)
      ]);
      const combined = [...(p1?.items || []), ...(p2?.items || [])];
      anime = combined.find(a => a.id === slugOrId || a.slug === cleanId || a.id === `anime47-${cleanId}`);
    } catch {}
  }

  if (!anime) {
    // Thử Live Search trên Anime47
    try {
      const searchRes = await anime47Request('/search/live?keyword=' + encodeURIComponent(cleanId));
      const results = searchRes?.results || [];
      const match = results.find(r => r.slug === cleanId || String(r.id) === cleanId) || results[0];
      if (match) {
        anime = mapAnime47(match);
      }
    } catch {}
  }

  if (!anime) {
    throw new Error('Không tìm thấy thông tin phim từ Anime47');
  }

  // Tìm tập phim và nguồn phát từ các provider có sẵn (PhimAPI, NguonC)
  const episodeResult = await resolveEpisodesForAnime47(anime);
  return {
    ...anime,
    streamProvider: episodeResult.provider || 'AniDoki',
    streamType: episodeResult.type,
    playbackUnavailable: episodeResult.unavailable || null,
    episodes: episodeResult.episodes
  };
}

function isAnimePhimAPI(movie) {
  if (!movie) return false;
  if (movie.type === 'hoathinh') return true;
  const cats = (movie.category || []).map(c => (typeof c === 'string' ? c : c.name).toLowerCase());
  return cats.some(c => c.includes('hoạt hình') || c.includes('anime'));
}

function isAnimeNguonC(movie) {
  if (!movie) return false;
  const cats = Object.values(movie.category || {}).flatMap(c => c.list || []).map(c => c.name?.toLowerCase() || '');
  return cats.some(c => c.includes('hoạt hình') || c.includes('anime')) ||
         cats.some(c => c.includes('nhật bản') || c.includes('trung quốc'));
}

/**
 * Tìm kiếm tập phim phù hợp từ các provider đối tác
 */
export async function resolveEpisodesForAnime47(anime, requests = {}) {
  sessionHeaders();
  const kk = requests.kk || kkRequest;
  const nc = requests.nc || nguoncRequest;
  const a47 = requests.a47 || anime47Request;
  const cacheKey = anime.id || anime.slug;
  const cached = episodesCache.get(cacheKey);
  if (cached && cached.until > Date.now()) {
    return cached.data;
  }

  // Resolve authenticated episode metadata; video URLs are fetched on demand.
  if (process.env.ANIME47_ACCESS_TOKEN?.trim() && anime.sourceId) {
    try {
      const data = await a47('/anime/' + encodeURIComponent(anime.sourceId) + '/episodes');
      const episodes = extractAnime47Episodes(data);
      if (episodes.length) {
        const result = { provider: 'Anime47', type: null, episodes };
        episodesCache.set(cacheKey, { data: result, until: Date.now() + 30000 });
        return result;
      }
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) console.warn('Anime47 episode list unavailable');
    }
  }

  const querySet = new Set();
  const addQuery = (q) => {
    if (!q) return;
    const str = String(q).trim();
    if (str.length >= 2) {
      querySet.add(str);
      const cleaned = cleanKeyword(str);
      if (cleaned.length >= 2) querySet.add(cleaned);
    }
  };

  addQuery(anime.slug);
  addQuery(anime.title?.english);
  addQuery(anime.title?.vietnamese);
  addQuery(anime.title?.romaji);
  if (Array.isArray(anime.aliases)) {
    for (const a of anime.aliases) addQuery(a);
  }

  const animeTitles = [anime.title?.vietnamese, anime.title?.english, anime.title?.romaji, anime.slug].filter(Boolean);

  // 1. Thử trực tiếp slug trên PhimAPI
  try {
    const directKk = await kk('/phim/' + anime.slug);
    if (directKk?.movie && isAnimePhimAPI(directKk.movie)) {
      const eps = extractEpisodes(directKk);
      if (eps.length > 0) {
        const result = { provider: 'AniDoki', type: 'hls', episodes: eps };
        episodesCache.set(cacheKey, { data: result, until: Date.now() + 600000 });
        return result;
      }
    }
  } catch {}

  // 2. Thử trực tiếp slug trên NguonC
  try {
    const directNc = await nc('/film/' + anime.slug);
    if (directNc?.movie && isAnimeNguonC(directNc.movie)) {
      const eps = extractNguoncEpisodes(directNc.movie);
      if (eps.length > 0) {
        const result = { provider: 'NguonC', type: 'embed', episodes: eps };
        episodesCache.set(cacheKey, { data: result, until: Date.now() + 600000 });
        return result;
      }
    }
  } catch {}

  const queries = [...querySet];

  // 3. Tìm kiếm theo từ khóa trên PhimAPI
  for (const q of queries) {
    try {
      const res = await kk('/v1/api/tim-kiem?keyword=' + encodeURIComponent(q) + '&limit=6');
      const items = res.data?.items || [];
      for (const it of items) {
        if (!isAnimePhimAPI(it)) continue;
        const sim = Math.max(...animeTitles.map(t => calculateSimilarity(t, it.name + ' ' + (it.origin_name || ''))));
        if (sim < 0.40) continue;

        const candidateDetail = await kk('/phim/' + it.slug);
        if (candidateDetail?.movie && isAnimePhimAPI(candidateDetail.movie)) {
          const eps = extractEpisodes(candidateDetail);
          if (eps.length > 0) {
            const result = { provider: 'AniDoki', type: 'hls', episodes: eps };
            episodesCache.set(cacheKey, { data: result, until: Date.now() + 600000 });
            return result;
          }
        }
      }
    } catch {}
  }

  // 4. Tìm kiếm theo từ khóa trên NguonC
  for (const q of queries) {
    try {
      const res = await nc('/films/search?keyword=' + encodeURIComponent(q) + '&page=1');
      const items = res.items || [];
      for (const it of items) {
        const sim = Math.max(...animeTitles.map(t => calculateSimilarity(t, it.name + ' ' + (it.original_name || ''))));
        if (sim < 0.40) continue;

        const candidateDetail = await nc('/film/' + it.slug);
        if (candidateDetail?.movie && isAnimeNguonC(candidateDetail.movie)) {
          const eps = extractNguoncEpisodes(candidateDetail.movie);
          if (eps.length > 0) {
            const result = { provider: 'NguonC', type: 'embed', episodes: eps };
            episodesCache.set(cacheKey, { data: result, until: Date.now() + 600000 });
            return result;
          }
        }
      }
    } catch {}
  }

  // 5. Thử tìm kiếm từ khóa bổ sung qua Anime47 Live Search
  try {
    const a47Search = await a47('/search/live?keyword=' + encodeURIComponent(anime.title?.vietnamese || anime.slug));
    const results = a47Search?.results || [];
    for (const r of results) {
      const extraTitles = (r.titles || []).map(t => t.title).filter(Boolean);
      for (const et of extraTitles) {
        if (querySet.has(et)) continue;
        querySet.add(et);
        const kkRes = await kk('/v1/api/tim-kiem?keyword=' + encodeURIComponent(et) + '&limit=5');
        const items = kkRes.data?.items || [];
        for (const item of items) {
          if (!isAnimePhimAPI(item)) continue;
          const sim = Math.max(
            calculateSimilarity(et, item.name + ' ' + (item.origin_name || '')),
            ...animeTitles.map(t => calculateSimilarity(t, item.name + ' ' + (item.origin_name || '')))
          );
          if (sim < 0.40) continue;

          const candidateDetail = await kk('/phim/' + item.slug);
          if (candidateDetail?.movie && isAnimePhimAPI(candidateDetail.movie)) {
            const eps = extractEpisodes(candidateDetail);
            if (eps.length > 0) {
              const result = { provider: 'AniDoki', type: 'hls', episodes: eps };
              episodesCache.set(cacheKey, { data: result, until: Date.now() + 600000 });
              return result;
            }
          }
        }
      }
    }
  } catch {}

  // Catalog episode counts are metadata, not playable episodes.
  let unavailable = {
    code: 'NO_PLAYABLE_SOURCE',
    message: 'Phim này chưa có nguồn video Vietsub khả dụng trên các nguồn được hỗ trợ.'
  };
  if (anime.sourceId) {
    try {
      await a47('/anime/' + encodeURIComponent(anime.sourceId) + '/episodes');
    } catch (error) {
      if (error.code === 'PRIVATE_MODE' || error.status === 401 || error.status === 403) {
        unavailable = {
          code: 'SOURCE_LOGIN_REQUIRED',
          message: process.env.ANIME47_ACCESS_TOKEN?.trim()
            ? 'Phiên Anime47 đã hết hạn hoặc không có quyền truy cập. Hãy cập nhật token đăng nhập trên máy chủ.'
            : 'Anime47 yêu cầu đăng nhập để truy cập tập phim. Hiện chưa có nguồn Vietsub dự phòng cho phim này.'
        };
      }
    }
  }
  const result = { provider: 'Anime47', type: null, episodes: [], unavailable };
  episodesCache.set(cacheKey, { data: result, until: Date.now() + 30000 });
  return result;
}

export function extractAnime47Episodes(payload) {
  const data = payload?.data || payload;
  const groups = Array.isArray(data?.teams)
    ? data.teams.flatMap(team => team.groups || []) : (data?.groups || []);
  const episodes = new Map();
  for (const group of groups) {
    for (const episode of group.episodes || []) {
      const number = Number(episode.number || episode.sort_number);
      if (!Number.isInteger(number) || number < 1 || !/^\d+$/.test(String(episode.id || '')) || episodes.has(number)) continue;
      episodes.set(number, { number, id: String(episode.id), sourceEpisodeId: String(episode.id), title: episode.title || `Tập ${number}` });
    }
  }
  return [...episodes.values()].sort((a, b) => a.number - b.number);
}

export async function anime47EpisodeSource(id, request = anime47Request) {
  if (!/^\d+$/.test(String(id))) throw new Error('Mã tập Anime47 không hợp lệ');
  const payload = await request('/anime/watch/episode/' + id);
  const episode = payload?.data || payload;
  const streams = [...(episode?.streams || [])].sort((a, b) => Number(b.is_default || 0) - Number(a.is_default || 0));
  for (const source of streams) {
    let url;
    try { url = new URL(source.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    if (['jwplayer', 'hls'].includes(source.player_type)) {
      // Softsub streams need a Vietnamese subtitle track for the Vietsub player.
      const subtitles = (source.subtitles || []).filter(track => /vi|viet|vietnam/i.test(track.language || track.label || ''))
        .filter(track => { try { const u = new URL(track.file); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } })
        .map(track => ({ label: track.label || 'Tiếng Việt', file: track.file }));
      if (source.subtitles?.length && !subtitles.length) continue;
      return { success: true, provider: 'Anime47', type: 'hls', language: 'vi', stream_url: url.href, subtitles };
    }
    if (validEmbed(url.href, 'Anime47')) return { success: true, provider: 'Anime47', type: 'embed', language: 'vi', embed_url: url.href };
  }
  throw Object.assign(new Error('Tập Anime47 chưa có nguồn Vietsub tương thích hoặc tài khoản chưa có quyền xem.'), { status: 404 });
}
