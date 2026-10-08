import { pool } from '../db/db.js';

export const UserModel = {
  async findByIdOrEmail(identifier) {
    const clean = identifier.trim().toLowerCase();
    const res = await pool.query(
      'SELECT * FROM users WHERE LOWER(id) = $1 OR (email IS NOT NULL AND LOWER(email) = $1)',
      [clean]
    );
    return res.rows[0] || null;
  },

  async findById(id) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async upsertGoogleUser({ userId, email, name, picture, provider = 'google', initialRole = 'user' }) {
    const existingRes = await pool.query(
      'SELECT * FROM users WHERE id = $1 OR (email IS NOT NULL AND email = $2)',
      [userId, email]
    );

    let user = null;
    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      const targetRole = initialRole === 'admin' ? 'admin' : (existing.role || 'user');
      const updateRes = await pool.query(`
        UPDATE users
        SET name = $1, avatar = $2, email = $3, role = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
      `, [name, picture, email, targetRole, existing.id]);
      user = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(`
        INSERT INTO users (id, name, email, avatar, provider, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
      `, [userId, name, email, picture, provider, initialRole]);
      user = insertRes.rows[0];
    }
    return user;
  },

  async upsertLocalAdmin({ id = 'admin', name = 'Quản trị viên AniDoki', email = 'admin@system.anidoki', avatar, passwordHash }) {
    const res = await pool.query(`
      INSERT INTO users (id, name, email, avatar, provider, role, password_hash, created_at, updated_at)
      VALUES (
        $1, $2, $3, $4, 'local', 'admin', $5, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = 'admin',
        email = $3,
        updated_at = NOW()
      RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
    `, [id, name, email, avatar, passwordHash]);
    return res.rows[0];
  },

  async createLocalUser({ id, name, email, avatar, passwordHash, role = 'user' }) {
    const res = await pool.query(`
      INSERT INTO users (id, name, email, avatar, provider, role, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'local', $5, $6, NOW(), NOW())
      RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
    `, [id, name, email, avatar, role, passwordHash]);
    return res.rows[0];
  },

  async createSession({ token, userId, expiresAt, userAgent = null, ipAddress = null }) {
    await pool.query(
      'INSERT INTO user_sessions (token, user_id, expires_at, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [token, userId, expiresAt, userAgent, ipAddress]
    );
  },

  async getUserBySessionToken(token) {
    if (!token || typeof token !== 'string') return null;

    const res = await pool.query(`
      SELECT 
        u.id, u.name, u.email, u.avatar, u.provider, u.role,
        u.is_banned, u.ban_reason, u.banned_at, u.player_settings,
        u.created_at, s.expires_at
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = $1 AND s.expires_at > NOW()
    `, [token]);

    return res.rows[0] || null;
  },

  async revokeSession(token) {
    if (!token) return;
    await pool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
  },

  async getUserSessions(userId) {
    if (!userId) return [];
    const res = await pool.query(`
      SELECT token, user_agent, ip_address, created_at, expires_at
      FROM user_sessions
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [userId]);
    return res.rows;
  },

  async revokeOtherSessions(userId, currentToken) {
    if (!userId || !currentToken) return 0;
    const res = await pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND token != $2 RETURNING token',
      [userId, currentToken]
    );
    return res.rowCount || 0;
  },

  async revokeAllUserSessions(userId) {
    if (!userId) return 0;
    const res = await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    return res.rowCount || 0;
  },

  async updateUserProfile(userId, { name, avatar, player_settings }) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (avatar !== undefined) {
      fields.push(`avatar = $${idx++}`);
      values.push(avatar ? avatar.trim() : null);
    }
    if (player_settings !== undefined) {
      fields.push(`player_settings = $${idx++}`);
      values.push(JSON.stringify(player_settings));
    }

    if (fields.length === 0) return await this.findById(userId);

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const res = await pool.query(`
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
    `, values);

    return res.rows[0];
  },

  async updateRole(userId, newRole) {
    const res = await pool.query(`
      UPDATE users
      SET role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, avatar, role, is_banned, updated_at
    `, [newRole, userId]);
    return res.rows[0];
  },

  async banUser(userId, banReason) {
    const res = await pool.query(`
      UPDATE users
      SET is_banned = true, ban_reason = $1, banned_at = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, avatar, role, is_banned, ban_reason, banned_at, updated_at
    `, [banReason, userId]);
    await this.revokeAllUserSessions(userId);
    return res.rows[0];
  },

  async unbanUser(userId) {
    const res = await pool.query(`
      UPDATE users
      SET is_banned = false, ban_reason = null, banned_at = null, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, email, avatar, role, is_banned, ban_reason, banned_at, updated_at
    `, [userId]);
    return res.rows[0];
  },

  async getAdminUsers({ search = '', role = 'all', status = 'all', page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    let whereClauses = [];
    let params = [];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(id) LIKE $${params.length})`);
    }

    if (role && role !== 'all') {
      params.push(role);
      whereClauses.push(`role = $${params.length}`);
    }

    if (status && status !== 'all') {
      if (status === 'banned') {
        whereClauses.push(`is_banned = true`);
      } else if (status === 'active') {
        whereClauses.push(`(is_banned IS FALSE OR is_banned IS NULL)`);
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT count(*) FROM users ${whereSql}`, params);
    const total = parseInt(countRes.rows[0].count) || 0;

    params.push(limit);
    params.push(offset);
    const result = await pool.query(`
      SELECT id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, created_at, updated_at
      FROM users
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  }
};
