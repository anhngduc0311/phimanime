import { pool } from '../db/db.js';

export const AdminAnimeModel = {
  async getAllAnimeOverrides() {
    const res = await pool.query('SELECT * FROM anime_overrides');
    const map = new Map();
    for (const row of res.rows) {
      map.set(row.anime_id, row);
    }
    return map;
  },

  async getAnimeOverride(animeId) {
    const res = await pool.query('SELECT * FROM anime_overrides WHERE anime_id = $1', [animeId]);
    return res.rows[0] || null;
  },

  async upsertAnimeOverride(animeId, {
    title_vietnamese,
    title_english,
    description,
    cover_image,
    banner_image,
    genres,
    status,
    is_hidden = false,
    custom_seasons = [],
    notes
  }) {
    const res = await pool.query(`
      INSERT INTO anime_overrides (
        anime_id, title_vietnamese, title_english, description, cover_image, banner_image,
        genres, status, is_hidden, custom_seasons, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (anime_id) DO UPDATE SET
        title_vietnamese = EXCLUDED.title_vietnamese,
        title_english = EXCLUDED.title_english,
        description = EXCLUDED.description,
        cover_image = EXCLUDED.cover_image,
        banner_image = EXCLUDED.banner_image,
        genres = EXCLUDED.genres,
        status = EXCLUDED.status,
        is_hidden = EXCLUDED.is_hidden,
        custom_seasons = EXCLUDED.custom_seasons,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `, [
      animeId,
      title_vietnamese || null,
      title_english || null,
      description !== undefined ? description : null,
      cover_image || null,
      banner_image || null,
      JSON.stringify(Array.isArray(genres) ? genres : []),
      status || null,
      Boolean(is_hidden),
      JSON.stringify(Array.isArray(custom_seasons) ? custom_seasons : []),
      notes || null
    ]);
    return res.rows[0];
  },

  async toggleAnimeVisibility(animeId, isHidden) {
    let res;
    if (typeof isHidden === 'boolean') {
      res = await pool.query(`
        INSERT INTO anime_overrides (anime_id, is_hidden, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (anime_id) DO UPDATE SET
          is_hidden = EXCLUDED.is_hidden,
          updated_at = NOW()
        RETURNING is_hidden;
      `, [animeId, isHidden]);
    } else {
      res = await pool.query(`
        INSERT INTO anime_overrides (anime_id, is_hidden, updated_at)
        VALUES ($1, TRUE, NOW())
        ON CONFLICT (anime_id) DO UPDATE SET
          is_hidden = NOT anime_overrides.is_hidden,
          updated_at = NOW()
        RETURNING is_hidden;
      `, [animeId]);
    }
    return res.rows[0];
  },

  async getEpisodeOverrides(animeId) {
    const res = await pool.query(
      'SELECT * FROM episode_overrides WHERE anime_id = $1 ORDER BY episode_number ASC',
      [animeId]
    );
    return res.rows;
  },

  async upsertEpisodeOverride(animeId, episodeNumber, { embed_url, title, is_hidden, notes }) {
    const epNum = parseInt(episodeNumber, 10);
    const res = await pool.query(`
      INSERT INTO episode_overrides (
        anime_id, episode_number, embed_url, is_hidden, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (anime_id, episode_number) DO UPDATE SET
        embed_url = EXCLUDED.embed_url,
        is_hidden = EXCLUDED.is_hidden,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `, [
      animeId,
      epNum,
      embed_url ? embed_url.trim() : null,
      Boolean(is_hidden),
      notes || null
    ]);
    return res.rows[0];
  }
};
