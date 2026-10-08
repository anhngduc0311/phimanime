import {
  movieDetail,
  relatedSeasons,
  listing,
  selectSpotlights,
  trendingCatalog,
  movieCatalog,
  genreOptions,
  genreCatalog,
  browseCatalog,
  slugOK,
  kkRequest,
  mapMovie
} from '../services/kkphim.service.js';
import { getAnime47LatestEpisodes, anime47Detail, anime47EpisodeSource } from '../services/anime47.service.js';
import { anime47MediaUrl } from '../services/anime47Media.service.js';
import { allowedAnime47Subtitle, anime47SubtitleUrl } from '../services/anime47Subtitle.service.js';
import { ConfigModel } from '../models/config.model.js';
import { pool } from '../db/db.js';
import { allRelatedSeasons } from '../services/catalogSources.service.js';

const send = (res, data) => res.json({ success: true, data, total: Array.isArray(data) ? data.length : undefined });

export const CatalogController = {
  async getSpotlight(req, res) {
    try {
      let customSlugs = [];
      try {
        const cfg = await ConfigModel.getHomepageConfig();
        if (Array.isArray(cfg?.spotlight_slugs) && cfg.spotlight_slugs.length) {
          customSlugs = cfg.spotlight_slugs;
        }
      } catch {}

      if (customSlugs.length > 0) {
        const details = await Promise.allSettled(customSlugs.map(slug => movieDetail(slug)));
        const fulfilled = details.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
        if (fulfilled.length > 0) {
          return send(res, fulfilled);
        }
      }

      const { items } = await listing({ limit: '36' });
      const selected = selectSpotlights(items);
      const details = await Promise.allSettled(selected.map(m => movieDetail(m.id)));
      send(res, details.map((r, i) => r.status === 'fulfilled'
        ? { ...r.value, score: selected[i].score, updatedAt: selected[i].updatedAt }
        : selected[i]));
    } catch (err) {
      console.warn('AniDoki Spotlight Error:', err.message);
      res.status(502).json({ success: false, message: 'Không tải được danh sách tâm điểm' });
    }
  },

  async getTrending(req, res) {
    try {
      const result = await trendingCatalog(req.query.page, req.query.limit);
      res.json({ success: true, ...result, total: result.data.length });
    } catch (err) {
      console.warn('AniDoki Trending Error:', err.message);
      res.status(502).json({ success: false, message: err.message || 'Không tải được phim thịnh hành' });
    }
  },

  async getRecentlyUpdated(req, res) {
    try {
      const page = Math.min(1000, Math.max(1, parseInt(req.query.page) || 1));
      const limit = Math.min(48, Math.max(1, parseInt(req.query.limit) || 24));
      // Ưu tiên lấy danh sách phim mới cập nhật từ Anime47 API có phân trang
      try {
        const result = await getAnime47LatestEpisodes(page, limit);
        if (Array.isArray(result?.items) && result.items.length > 0) {
          return res.json({ success: true, data: result.items, pagination: result.pagination, total: result.items.length });
        }
      } catch (a47Err) {
        console.warn('Anime47 Latest Fetch Notice, falling back to PhimAPI:', a47Err.message);
      }

      // Dự phòng sang PhimAPI nếu Anime47 gặp sự cố kết nối
      const { items, pagination } = await listing({ page: String(page), limit: String(limit) });
      res.json({ success: true, data: items, pagination, total: items.length });
    } catch (err) {
      console.warn('AniDoki Recently Updated Error:', err.message);
      res.status(502).json({ success: false, message: 'Không tải được phim mới cập nhật' });
    }
  },

  async getCatalog(req, res) {
    try {
      const page = Math.min(1000, Math.max(1, parseInt(req.query.page) || 1));
      const limit = Math.min(48, Math.max(1, parseInt(req.query.limit) || 24));
      try {
        const result = await getAnime47LatestEpisodes(page, limit);
        if (Array.isArray(result?.items) && result.items.length > 0) {
          return res.json({ success: true, data: result.items, pagination: result.pagination, total: result.items.length });
        }
      } catch {}

      const result = await listing({ page: String(page) });
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      console.warn('AniDoki Catalog Error:', err.message);
      res.status(502).json({ success: false, message: 'Không tải được danh mục phim' });
    }
  },

  async getSeasonal(req, res) {
    try {
      const page = Math.min(100, Math.max(1, parseInt(req.query.page) || 1));
      const [psychological, romance] = await Promise.all([
        listing({ category: 'tam-ly', limit: '24', page: String(page) }),
        listing({ category: 'tinh-cam', limit: '24', page: String(page) })
      ]);
      const seen = new Set();
      const items = [];
      for (const item of [...psychological.items, ...romance.items]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      items.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
      const totalPages = Math.max(
        Number(psychological.pagination?.totalPages) || 1,
        Number(romance.pagination?.totalPages) || 1
      );
      res.json({
        success: true,
        data: items,
        total: items.length,
        pagination: { page, totalPages, hasMore: page < totalPages }
      });
    } catch (err) {
      console.warn('AniDoki Seasonal Error:', err.message);
      res.status(502).json({ success: false, message: 'Không tải được anime theo mùa' });
    }
  },

  async getMovies(req, res) {
    try {
      const result = await movieCatalog(req.query.page, req.query.limit);
      res.json({ success: true, ...result, total: result.data.length });
    } catch (err) {
      console.warn('AniDoki Movies Error:', err.message);
      res.status(502).json({ success: false, message: err.message || 'Không tải được phim lẻ' });
    }
  },

  async getGenres(req, res) {
    try {
      const [action, romance] = await Promise.all([
        listing({ category: 'hanh-dong', limit: '8' }),
        listing({ category: 'tinh-cam', limit: '8' })
      ]);
      send(res, { Action: action.items, Romance: romance.items });
    } catch (err) {
      console.warn('AniDoki Genres Error:', err.message);
      res.status(502).json({ success: false, message: 'Không tải được danh sách thể loại' });
    }
  },

  async getGenreOptions(req, res) {
    try {
      send(res, await genreOptions());
    } catch (err) {
      console.warn('AniDoki Genre Options Error:', err.message);
      res.status(502).json({ success: false, message: 'Không tải được tùy chọn thể loại' });
    }
  },

  async getByGenres(req, res) {
    try {
      const categories = String(req.query.categories || '').split(',').filter(Boolean);
      const result = await genreCatalog(categories, req.query.page, req.query.limit);
      res.json({ success: true, ...result });
    } catch (err) {
      console.warn('AniDoki By Genres Error:', err.message);
      const status = err.status && [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
      res.status(status).json({ success: false, message: err.message || 'Lỗi tải phim theo thể loại' });
    }
  },

  async getAnimeDetail(req, res) {
    try {
      const id = req.params.id;
      if (id.startsWith('anime47-')) {
        send(res, await anime47Detail(id));
      } else {
        send(res, await movieDetail(id));
      }
    } catch (err) {
      const status = err.status && [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
      res.status(status).json({ success: false, message: err.message || 'Không tìm thấy phim' });
    }
  },

  async getAnimeSeasons(req, res) {
    try {
      const id = req.params.id;
      const detail = id.startsWith('anime47-') ? await anime47Detail(id) : await movieDetail(id);
      send(res, await allRelatedSeasons(detail));
    } catch (err) {
      const status = err.status && [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
      res.status(status).json({ success: false, message: err.message || 'Không tải được các mùa phim' });
    }
  },

  async getAnimeEpisodes(req, res) {
    try {
      const id = req.params.id;
      const detail = id.startsWith('anime47-') ? await anime47Detail(id) : await movieDetail(id);
      send(res, detail.episodes || []);
    } catch (err) {
      const status = err.status && [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
      res.status(status).json({ success: false, message: err.message || 'Không tải được danh sách tập' });
    }
  },

  async getWatchSources(req, res) {
    try {
      const { anime_id, episode_number } = req.body;
      const cleanSlug = String(anime_id || '').replace(/^anime47-/, '');
      if (!slugOK(cleanSlug) || !Number.isInteger(Number(episode_number)) || Number(episode_number) < 1) {
        return res.status(400).json({ success: false, message: 'Phim hoặc tập không hợp lệ' });
      }

      try {
        const epOverrideRes = await pool.query(
          'SELECT * FROM episode_overrides WHERE anime_id = $1 AND episode_number = $2',
          [anime_id, Number(episode_number)]
        );
        const epOverride = epOverrideRes.rows[0];
        if (epOverride) {
          if (epOverride.is_hidden) {
            return res.status(404).json({ success: false, message: 'Tập phim này đang tạm ẩn hoặc bảo trì.' });
          }
          if (epOverride.embed_url) {
            return res.json({ success: true, type: 'embed', provider: 'AniDoki', language: 'vi', embed_url: epOverride.embed_url });
          }
        }
      } catch (err) {
        console.error('Error checking episode override:', err);
      }

      const { provider } = req.body;
      const movie = anime_id.startsWith('anime47-') ? await anime47Detail(anime_id) : await movieDetail(anime_id);
      const ep = (movie.episodes || []).find(ep => ep.number === Number(episode_number));

      if (!ep) {
        return res.status(404).json({
          success: false,
          code: movie.playbackUnavailable?.code || 'EPISODE_UNAVAILABLE',
          message: movie.playbackUnavailable?.message || 'Nguồn này chưa có tập Vietsub được yêu cầu.'
        });
      }

      if (provider === 'AniDoki' && ep.stream) {
        return res.json({ success: true, type: 'hls', provider: 'AniDoki', language: 'vi', stream_url: ep.stream });
      }
      if (provider === 'NguonC' && ep.embed) {
        return res.json({ success: true, type: 'embed', provider: 'NguonC', language: 'vi', embed_url: ep.embed });
      }

      if (ep.sourceEpisodeId && (!provider || provider === 'Anime47' || (!ep.stream && !ep.embed))) {
        try {
          const source = await anime47EpisodeSource(ep.sourceEpisodeId);
          if (source.type === 'hls') source.stream_url = anime47MediaUrl(source.stream_url);
          source.subtitles = (source.subtitles || []).filter(track => allowedAnime47Subtitle(track.file))
            .map(track => ({ ...track, file: anime47SubtitleUrl(track.file) }));
          return res.json(source);
        } catch (err) {
          console.warn('Anime47 source unavailable, falling back to partner stream if available:', err.message);
          if (ep.stream) {
            return res.json({ success: true, type: 'hls', provider: 'AniDoki', language: 'vi', stream_url: ep.stream });
          }
          if (ep.embed) {
            return res.json({ success: true, type: 'embed', provider: ep.embed.includes('streamc') ? 'NguonC' : 'AniDoki', language: 'vi', embed_url: ep.embed });
          }
        }
      }

      if (ep.stream) {
        const streamProvider = movie.streamProvider || (movie.source || 'AniDoki');
        return res.json({ success: true, type: 'hls', provider: streamProvider, language: 'vi', stream_url: ep.stream });
      }
      if (ep.embed) {
        const streamProvider = movie.streamProvider || (ep.embed.includes('streamc') ? 'NguonC' : (movie.source || 'AniDoki'));
        return res.json({ success: true, type: 'embed', provider: streamProvider, language: 'vi', embed_url: ep.embed });
      }

      return res.status(404).json({
        success: false,
        code: movie.playbackUnavailable?.code || 'EPISODE_UNAVAILABLE',
        message: movie.playbackUnavailable?.message || 'Nguồn này chưa có tập Vietsub được yêu cầu.'
      });
    } catch (err) {
      const status = err.status && [400, 401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
      res.status(status).json({ success: false, message: err.message || 'Không thể phát tập phim này' });
    }
  },

  async search(req, res) {
    try {
      const keyword = String(req.query.q || '').slice(0, 150);
      if (!keyword.trim()) return send(res, []);
      const result = await browseCatalog({ q: keyword, limit: 48 });
      send(res, result.items);
    } catch (err) {
      console.warn('AniDoki Search Error:', err.message);
      res.status(502).json({ success: false, message: 'Lỗi tìm kiếm phim' });
    }
  },

  async browse(req, res) {
    try {
      const result = await browseCatalog(req.query);
      res.json({ success: true, data: result.items, pagination: result.pagination });
    } catch (err) {
      console.warn('AniDoki Browse Error:', err.message);
      res.status(502).json({ success: false, message: 'Lỗi duyệt danh mục phim' });
    }
  }
};
