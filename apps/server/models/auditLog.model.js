import { pool } from '../db/db.js';

export const AuditLogModel = {
  async record({
    userId = null,
    adminName = 'Admin',
    adminEmail = null,
    action,
    targetType = null,
    targetId = null,
    details = {},
    ipAddress = null
  }) {
    try {
      const sanitizedDetails = { ...details };
      delete sanitizedDetails.password;
      delete sanitizedDetails.password_hash;

      await pool.query(`
        INSERT INTO audit_logs (user_id, admin_name, admin_email, action, target_type, target_id, details, ip_address, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [userId, adminName, adminEmail, action, targetType, targetId, JSON.stringify(sanitizedDetails), ipAddress]);
    } catch (err) {
      console.error('Audit Log Error:', err);
    }
  },

  async recordLog(args) {
    return this.record(args);
  },

  async getLogs({ q, action = 'all', targetType = 'all', page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    let whereClauses = [];
    let params = [];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      whereClauses.push(`(admin_name ILIKE $${params.length} OR admin_email ILIKE $${params.length} OR target_id ILIKE $${params.length})`);
    }

    if (action && action.trim() && action !== 'all') {
      params.push(action.trim());
      whereClauses.push(`action = $${params.length}`);
    }

    if (targetType && targetType.trim() && targetType !== 'all') {
      params.push(targetType.trim());
      whereClauses.push(`target_type = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT count(*) FROM audit_logs ${whereSql}`, params);
    const total = parseInt(countRes.rows[0].count) || 0;

    params.push(limitNum);
    params.push(offset);
    const result = await pool.query(`
      SELECT id, user_id, admin_name, admin_email, action, target_type, target_id, details, ip_address, created_at
      FROM audit_logs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      logs: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }
};
