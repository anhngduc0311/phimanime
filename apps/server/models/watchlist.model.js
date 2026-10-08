import { pool } from '../db/db.js';

export const WatchlistModel = {
  async getWatchlist(userId) {
    const result = await pool.query(
      'SELECT anime FROM kk_watchlist WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map(r => {
      let a = r.anime;
      if (typeof a === 'string') {
        try { a = JSON.parse(a); } catch {}
      }
      return a;
    });
  },

  async toggleWatchlist(userId, animeId, anime) {
    const deleted = await pool.query(
      'DELETE FROM kk_watchlist WHERE user_id = $1 AND slug = $2 RETURNING slug',
      [userId, anime.id || animeId]
    );
    const saved = !deleted.rowCount;
    if (saved) {
      await pool.query(
        'INSERT INTO kk_watchlist (user_id, slug, anime, status) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, slug) DO NOTHING',
        [userId, anime.id || animeId, JSON.stringify(anime), 'plan_to_watch']
      );
    }
    return saved;
  },

  async getLibrary(userId, { status = 'all', q = '' } = {}) {
    let sql = 'SELECT slug, anime, status, created_at, updated_at FROM kk_watchlist WHERE user_id = $1';
    const params = [userId];

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY updated_at DESC';
    const result = await pool.query(sql, params);

    let items = result.rows.map(r => {
      let animeObj = r.anime;
      if (typeof animeObj === 'string') {
        try { animeObj = JSON.parse(animeObj); } catch {}
      }
      animeObj = animeObj || {};
      const libStatus = r.status || 'plan_to_watch';
      return {
        ...animeObj,
        anime: animeObj,
        animeId: r.slug || animeObj.id,
        id: animeObj.id || r.slug,
        libraryStatus: libStatus,
        status: libStatus,
        airingStatus: animeObj.status || '',
        savedAt: r.created_at,
        updatedAt: r.updated_at
      };
    });

    if (q && q.trim()) {
      const keyword = q.trim().toLowerCase();
      items = items.filter(a => {
        const eng = (a.title?.english || '').toLowerCase();
        const vie = (a.title?.vietnamese || '').toLowerCase();
        return eng.includes(keyword) || vie.includes(keyword);
      });
    }

    const countRes = await pool.query(
      'SELECT status, count(*) FROM kk_watchlist WHERE user_id = $1 GROUP BY status',
      [userId]
    );
    const counts = { all: 0, plan_to_watch: 0, watching: 0, completed: 0 };
    for (const row of countRes.rows) {
      const s = row.status || 'plan_to_watch';
      const count = parseInt(row.count) || 0;
      counts[s] = (counts[s] || 0) + count;
      counts.all += count;
    }

    return { items, counts };
  },

  async updateLibraryStatus(userId, animeId, anime, status = 'plan_to_watch') {
    await pool.query(`
      INSERT INTO kk_watchlist (user_id, slug, anime, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, slug)
      DO UPDATE SET status = EXCLUDED.status, anime = EXCLUDED.anime, updated_at = NOW()
    `, [userId, anime.id || animeId, JSON.stringify(anime), status]);
  },

  async deleteLibraryItem(userId, animeId) {
    await pool.query('DELETE FROM kk_watchlist WHERE user_id = $1 AND slug = $2', [userId, animeId]);
  }
};
