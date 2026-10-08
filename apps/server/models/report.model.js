import { pool } from '../db/db.js';

export const ReportModel = {
  async createReport({ userId = null, animeSlug, animeTitle, episodeNumber, provider = 'KKPhim', issueType, description = '' }) {
    const res = await pool.query(`
      INSERT INTO reports (user_id, anime_slug, anime_title, episode_number, provider, issue_type, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
      RETURNING id, user_id, anime_slug, anime_title, episode_number, provider, issue_type, description, status, created_at
    `, [userId, animeSlug, animeTitle, episodeNumber, provider, issueType, description]);
    return res.rows[0];
  },

  async getReports({ status = 'all', page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      whereClause = `WHERE r.status = $${params.length}`;
    }

    const countRes = await pool.query(`SELECT count(*) FROM reports r ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count) || 0;

    params.push(limit);
    params.push(offset);
    const result = await pool.query(`
      SELECT 
        r.id, r.user_id, r.anime_slug, r.anime_title, r.episode_number,
        r.provider, r.issue_type, r.description, r.status, r.admin_notes,
        r.resolved_at, r.created_at, r.updated_at,
        u.name as user_name, u.email as user_email
      FROM reports r
      LEFT JOIN users u ON r.user_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      reports: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    };
  },

  async updateReport(id, { status, adminNotes }) {
    const isResolved = status === 'resolved';
    const res = await pool.query(`
      UPDATE reports
      SET status = $1, admin_notes = $2, resolved_at = ${isResolved ? 'NOW()' : 'null'}, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, adminNotes || null, id]);
    return res.rows[0] || null;
  },

  async getCountByStatus(status = 'pending') {
    const res = await pool.query('SELECT count(*) FROM reports WHERE status = $1', [status]);
    return parseInt(res.rows[0].count) || 0;
  }
};
