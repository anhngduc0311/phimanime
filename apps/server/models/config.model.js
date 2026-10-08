import { pool } from '../db/db.js';

export const ConfigModel = {
  async getHomepageConfig() {
    const res = await pool.query("SELECT * FROM homepage_config WHERE id = 'default'");
    if (res.rows.length === 0) {
      return {
        id: 'default',
        spotlight_slugs: [],
        sections_config: [
          { id: 'spotlight', name: 'Tâm điểm hôm nay', enabled: true, order: 1 },
          { id: 'continue_watching', name: 'Đã xem gần đây', enabled: true, order: 2 },
          { id: 'recent', name: 'Mới cập nhật', enabled: true, order: 3 },
          { id: 'trending', name: 'Thịnh hành', enabled: true, order: 4 },
          { id: 'action', name: 'Hành động & Phiêu lưu', enabled: true, order: 5 },
          { id: 'romance', name: 'Cảm xúc & Lãng mạn', enabled: true, order: 6 },
          { id: 'seasonal', name: 'Tâm lý & Tình cảm', enabled: true, order: 7 },
          { id: 'movies', name: 'Phim lẻ điện ảnh', enabled: true, order: 8 }
        ]
      };
    }
    return res.rows[0];
  },

  async updateHomepageConfig({ spotlight_slugs, sections_config }, updatedBy = null) {
    const res = await pool.query(`
      INSERT INTO homepage_config (id, spotlight_slugs, sections_config, updated_by, updated_at)
      VALUES ('default', $1, $2, $3, NOW())
      ON CONFLICT (id) DO UPDATE SET
        spotlight_slugs = EXCLUDED.spotlight_slugs,
        sections_config = EXCLUDED.sections_config,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [JSON.stringify(spotlight_slugs || []), JSON.stringify(sections_config || []), updatedBy]);
    return res.rows[0];
  },

  async getSystemSettings() {
    const res = await pool.query('SELECT key, value, description, updated_at FROM system_settings');
    const settings = {};
    for (const row of res.rows) {
      settings[row.key] = row.value;
    }
    return settings;
  },

  async updateSystemSetting(key, value, updatedBy = null) {
    const res = await pool.query(`
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [key, JSON.stringify(value), updatedBy]);
    return res.rows[0];
  }
};
