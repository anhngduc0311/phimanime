import { pool } from '../db/db.js';

export const HistoryModel = {
  async getHistory(userId, { page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const countRes = await pool.query('SELECT count(*) FROM kk_history WHERE user_id = $1', [userId]);
    const total = parseInt(countRes.rows[0].count) || 0;

    const result = await pool.query(
      'SELECT slug, anime, episode, progress_seconds, duration, updated_at FROM kk_history WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
      [userId, limitNum, offset]
    );

    const items = result.rows.map(r => {
      let animeObj = r.anime;
      if (typeof animeObj === 'string') {
        try { animeObj = JSON.parse(animeObj); } catch {}
      }
      return {
        animeId: r.slug,
        anime: animeObj,
        episodeNumber: r.episode,
        currentTime: r.progress_seconds || 0,
        duration: r.duration || 0,
        updatedAt: r.updated_at
      };
    });

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
        hasMore: offset + items.length < total
      }
    };
  },

  async saveProgress(userId, animeId, anime, episodeNumber, currentTime = 0, duration = 0) {
    const epNum = Number(episodeNumber);
    const progress = Math.max(0, Math.floor(Number(currentTime) || 0));
    const dur = Math.max(0, Math.floor(Number(duration) || 0));

    await pool.query(`
      INSERT INTO kk_history (user_id, slug, anime, episode, progress_seconds, duration, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, slug)
      DO UPDATE SET
        anime = EXCLUDED.anime,
        episode = EXCLUDED.episode,
        progress_seconds = EXCLUDED.progress_seconds,
        duration = EXCLUDED.duration,
        updated_at = NOW()
    `, [userId, anime.id || animeId, JSON.stringify(anime), epNum, progress, dur]);
  },

  async deleteHistory(userId, animeId) {
    await pool.query('DELETE FROM kk_history WHERE user_id = $1 AND slug = $2', [userId, animeId]);
  },

  async clearAllHistory(userId) {
    await pool.query('DELETE FROM kk_history WHERE user_id = $1', [userId]);
  }
};
