import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Pool } = pg;

// Cấu hình kết nối PostgreSQL
export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5438'),
        user: process.env.PGUSER || 'anidoki_user',
        password: process.env.PGPASSWORD || 'anidoki_secure_pass_2026',
        database: process.env.PGDATABASE || 'anidoki_db',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      }
);

// Helper chuyển đổi row PostgreSQL sang format anime chuẩn
function mapAnimeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: {
      vietnamese: row.title_vietnamese,
      english: row.title_english,
      romaji: row.title_romaji,
      native: row.title_native
    },
    logo: row.logo,
    coverImage: `/api/anime/${row.id}/artwork`,
    bannerImage: `/api/anime/${row.id}/artwork?kind=banner`,
    score: parseFloat(row.score),
    studio: row.studio,
    genres: typeof row.genres === 'string' ? JSON.parse(row.genres) : (row.genres || []),
    format: row.format,
    duration: row.duration,
    status: row.status,
    year: row.year,
    startDate: row.start_date,
    totalEpisodes: row.total_episodes,
    currentEpisode: row.current_episode,
    nextAiring: row.next_airing_episode ? {
      episode: row.next_airing_episode,
      airingAt: row.next_airing_at ? Number(row.next_airing_at) : (Date.now() + (row.next_airing_offset || 86400) * 1000)
    } : null,
    description: row.description,
    isTrending: row.is_trending,
    isSpotlight: row.is_spotlight,
    isMovie: row.is_movie,
    season: row.season
  };
}

// Khởi tạo bảng & Nạp dữ liệu Seed ban đầu
export async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Đang kiểm tra schema PostgreSQL...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await client.query(schemaSql);
    console.log('✅ Schema PostgreSQL đã sẵn sàng.');

    // Kiểm tra xem đã có dữ liệu chưa
    const countRes = await client.query('SELECT COUNT(*) FROM animes');
    const count = parseInt(countRes.rows[0].count);

    if (count === 0) {
      console.log('🌱 Đang nạp dữ liệu khởi tạo (seed) từ db.json vào PostgreSQL...');
      const seedRaw = fs.readFileSync(path.join(__dirname, '../db.json'), 'utf-8');
      const seedData = JSON.parse(seedRaw);

      for (const anime of seedData.animes) {
        await client.query(`
          INSERT INTO animes (
            id, title_vietnamese, title_english, title_romaji, title_native,
            logo, cover_image, banner_image, score, studio, genres,
            format, duration, status, year, start_date, total_episodes, current_episode,
            next_airing_episode, next_airing_offset, description, is_trending, is_spotlight, is_movie, season
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
          ON CONFLICT (id) DO NOTHING
        `, [
          anime.id,
          anime.title.vietnamese,
          anime.title.english,
          anime.title.romaji,
          anime.title.native,
          anime.logo,
          anime.coverImage,
          anime.bannerImage,
          anime.score,
          anime.studio,
          JSON.stringify(anime.genres || []),
          anime.format,
          anime.duration,
          anime.status,
          anime.year,
          anime.startDate,
          anime.totalEpisodes,
          anime.currentEpisode,
          anime.nextAiring?.episode || null,
          anime.nextAiring?.airingOffsetSeconds || 86400,
          anime.description,
          anime.isTrending || false,
          anime.isSpotlight || false,
          anime.isMovie || false,
          anime.season
        ]);

        // Thêm các tập phim
        if (anime.episodes && anime.episodes.length > 0) {
          for (const ep of anime.episodes) {
            await client.query(`
              INSERT INTO episodes (anime_id, episode_number, title, duration, video_url)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (anime_id, episode_number) DO NOTHING
            `, [anime.id, ep.number, ep.title, ep.duration, ep.videoUrl]);
          }
        }
      }

      // Thêm watchlist mặc định
      if (seedData.watchlist) {
        for (const animeId of seedData.watchlist) {
          await client.query(`
            INSERT INTO watchlist (user_id, anime_id)
            VALUES ('usr_001', $1)
            ON CONFLICT (user_id, anime_id) DO NOTHING
          `, [animeId]);
        }
      }

      // Thêm history mặc định
      if (seedData.history) {
        for (const h of seedData.history) {
          await client.query(`
            INSERT INTO watch_history (user_id, anime_id, episode_number, progress_seconds, duration)
            VALUES ('usr_001', $1, $2, $3, $4)
            ON CONFLICT (user_id, anime_id) DO NOTHING
          `, [h.animeId, h.episodeNumber, h.currentTime, h.duration]);
        }
      }

      console.log('✅ Đã nạp dữ liệu Anime hoàn chỉnh vào PostgreSQL.');
    }
  } catch (err) {
    console.error('❌ Lỗi khởi tạo cơ sở dữ liệu PostgreSQL:', err);
  } finally {
    client.release();
  }
}

// ==========================================
// CÁC HÀM TRUY VẤN DỮ LIỆU TỪ POSTGRESQL
// ==========================================

export async function getSpotlightAnimes() {
  const res = await pool.query('SELECT * FROM animes WHERE is_spotlight = TRUE ORDER BY score DESC');
  return res.rows.map(mapAnimeRow);
}

export async function getTrendingAnimes(limit = 12) {
  const res = await pool.query('SELECT * FROM animes WHERE is_trending = TRUE ORDER BY score DESC LIMIT $1', [limit]);
  return res.rows.map(mapAnimeRow);
}

export async function getRecentlyUpdatedAnimes(limit = 12) {
  const res = await pool.query('SELECT * FROM animes ORDER BY year DESC, id DESC LIMIT $1', [limit]);
  return res.rows.map(mapAnimeRow);
}

export async function getSeasonalAnimes() {
  const res = await pool.query("SELECT * FROM animes WHERE status = 'Currently Airing' ORDER BY score DESC");
  return res.rows.map(mapAnimeRow);
}

export async function getMovieAnimes() {
  const res = await pool.query("SELECT * FROM animes WHERE format = 'MOVIE' ORDER BY score DESC");
  return res.rows.map(mapAnimeRow);
}

export async function getGenreAnimes() {
  const genres = ['Action', 'Romance', 'Fantasy', 'Drama', 'Adventure'];
  const result = {};

  for (const g of genres) {
    const res = await pool.query(
      `SELECT * FROM animes WHERE genres @> $1::jsonb ORDER BY score DESC LIMIT 8`,
      [JSON.stringify([g])]
    );
    result[g] = res.rows.map(mapAnimeRow);
  }

  return result;
}

export async function getAnimeById(id) {
  const res = await pool.query('SELECT * FROM animes WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  const anime = mapAnimeRow(res.rows[0]);
  anime.episodes = await getAnimeEpisodes(id);
  return anime;
}

export async function getAnimeEpisodes(animeId) {
  const res = await pool.query(
    'SELECT * FROM episodes WHERE anime_id = $1 ORDER BY episode_number DESC',
    [animeId]
  );
  
  return res.rows.map(ep => ({
    number: ep.episode_number,
    title: ep.title,
    duration: ep.duration
  }));
}

export async function searchAnimes(query = '', genre = '', format = '', sort = 'score') {
  let sql = 'SELECT * FROM animes WHERE 1=1';
  const params = [];

  if (query) {
    params.push(`%${query.toLowerCase()}%`);
    sql += ` AND (LOWER(title_english) LIKE $${params.length} OR LOWER(title_vietnamese) LIKE $${params.length} OR LOWER(studio) LIKE $${params.length})`;
  }

  if (genre) {
    params.push(JSON.stringify([genre]));
    sql += ` AND genres @> $${params.length}::jsonb`;
  }

  if (format) {
    params.push(format);
    sql += ` AND format = $${params.length}`;
  }

  if (sort === 'score') {
    sql += ' ORDER BY score DESC';
  } else if (sort === 'year') {
    sql += ' ORDER BY year DESC';
  }

  const res = await pool.query(sql, params);
  return res.rows.map(mapAnimeRow);
}

export async function getWatchlist(userId = 'usr_001') {
  const res = await pool.query(`
    SELECT a.* FROM animes a
    INNER JOIN watchlist w ON a.id = w.anime_id
    WHERE w.user_id = $1
    ORDER BY w.created_at DESC
  `, [userId]);
  return res.rows.map(mapAnimeRow);
}

export async function toggleWatchlist(animeId, userId = 'usr_001') {
  const check = await pool.query(
    'SELECT id FROM watchlist WHERE user_id = $1 AND anime_id = $2',
    [userId, animeId]
  );

  let saved = false;
  if (check.rows.length > 0) {
    await pool.query('DELETE FROM watchlist WHERE user_id = $1 AND anime_id = $2', [userId, animeId]);
    saved = false;
  } else {
    await pool.query('INSERT INTO watchlist (user_id, anime_id) VALUES ($1, $2)', [userId, animeId]);
    saved = true;
  }

  const listRes = await pool.query('SELECT anime_id FROM watchlist WHERE user_id = $1', [userId]);
  return {
    saved,
    watchlist: listRes.rows.map(r => r.anime_id),
    message: saved ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách'
  };
}

export async function getWatchHistory(userId = 'usr_001') {
  const res = await pool.query(`
    SELECT h.anime_id, h.episode_number, h.progress_seconds, h.duration, h.updated_at,
           a.title_english, a.title_vietnamese, a.cover_image, a.score
    FROM watch_history h
    INNER JOIN animes a ON h.anime_id = a.id
    WHERE h.user_id = $1
    ORDER BY h.updated_at DESC
    LIMIT 20
  `, [userId]);

  return res.rows.map(r => ({
    animeId: r.anime_id,
    episodeNumber: r.episode_number,
    currentTime: r.progress_seconds,
    duration: r.duration,
    updatedAt: r.updated_at,
    anime: {
      title: {
        english: r.title_english,
        vietnamese: r.title_vietnamese
      },
      coverImage: `/api/anime/${r.anime_id}/artwork`,
      score: parseFloat(r.score)
    }
  }));
}

export async function saveWatchProgress(animeId, episodeNumber, currentTime, duration, userId = 'usr_001') {
  await pool.query(`
    INSERT INTO watch_history (user_id, anime_id, episode_number, progress_seconds, duration, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, anime_id)
    DO UPDATE SET
      episode_number = EXCLUDED.episode_number,
      progress_seconds = EXCLUDED.progress_seconds,
      duration = EXCLUDED.duration,
      updated_at = CURRENT_TIMESTAMP
  `, [userId, animeId, episodeNumber, Math.floor(currentTime || 0), Math.floor(duration || 1440)]);

  return { success: true };
}
