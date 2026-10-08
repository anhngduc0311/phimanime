import { pool } from '../db/db.js';

export const FeedbackModel = {
  async createFeedback({ userId = null, name = '', email = '', subject = '', message }) {
    const res = await pool.query(`
      INSERT INTO feedback (user_id, name, email, subject, message, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
      RETURNING id, user_id, name, email, subject, message, status, created_at
    `, [userId, name.trim(), email.trim(), subject.trim(), message.trim()]);
    return res.rows[0];
  },

  async getFeedbackList({ status = 'all', page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      whereClause = `WHERE f.status = $${params.length}`;
    }

    const countRes = await pool.query(`SELECT count(*) FROM feedback f ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count) || 0;

    params.push(limit);
    params.push(offset);
    const result = await pool.query(`
      SELECT 
        f.id, f.user_id, f.name, f.email, f.subject, f.message,
        f.status, f.admin_notes, f.created_at, f.updated_at,
        u.name as user_account_name, u.avatar as user_avatar
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      feedbacks: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  },

  async updateFeedback(id, { status, adminNotes }) {
    const res = await pool.query(`
      UPDATE feedback
      SET status = $1, admin_notes = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, adminNotes || null, id]);
    return res.rows[0] || null;
  },

  async getPendingCount() {
    const res = await pool.query("SELECT count(*) FROM feedback WHERE status = 'pending'");
    return parseInt(res.rows[0].count) || 0;
  }
};
