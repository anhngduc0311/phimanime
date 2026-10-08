import { pool } from '../db/db.js';
import { kkRequest, slugOK, mapMovie, extractEpisodes, applyAnimeOverride } from '../services/kkphim.service.js';
import { AdminAnimeModel } from '../models/adminAnime.model.js';
import { UserModel } from '../models/user.model.js';
import { ReportModel } from '../models/report.model.js';
import { FeedbackModel } from '../models/feedback.model.js';
import { ConfigModel } from '../models/config.model.js';
import { AuditLogModel } from '../models/auditLog.model.js';

let activeSyncTask = null;

export const AdminController = {
  getMe(req, res) {
    res.json({
      success: true,
      user: req.user
    });
  },

  async getDashboard(req, res) {
    try {
      const [reportsRes, overridesRes, hiddenRes, usersRes, lastSyncRes] = await Promise.all([
        pool.query(`
          SELECT 
            COUNT(*) as total_reports,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_reports,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_reports,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_reports
          FROM reports
        `),
        pool.query('SELECT COUNT(*) as total_overrides FROM anime_overrides'),
        pool.query('SELECT COUNT(*) as total_hidden FROM anime_overrides WHERE is_hidden = true'),
        pool.query('SELECT COUNT(*) as total_users FROM users'),
        pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1')
      ]);

      const reportCounts = reportsRes.rows[0] || {};
      const totalOverrides = parseInt(overridesRes.rows[0]?.total_overrides, 10) || 0;
      const totalHidden = parseInt(hiddenRes.rows[0]?.total_hidden, 10) || 0;
      const totalUsers = parseInt(usersRes.rows[0]?.total_users, 10) || 0;
      const lastSync = lastSyncRes.rows[0] || null;

      const recentReports = await pool.query(`
        SELECT r.*, u.name as user_name, u.email as user_email
        FROM reports r
        LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.created_at DESC
        LIMIT 6
      `);

      const recentOverrides = await pool.query(`
        SELECT anime_id, title_vietnamese, title_english, is_hidden, updated_at
        FROM anime_overrides
        ORDER BY updated_at DESC
        LIMIT 6
      `);

      res.json({
        success: true,
        stats: {
          total_reports: parseInt(reportCounts.total_reports, 10) || 0,
          pending_reports: parseInt(reportCounts.pending_reports, 10) || 0,
          in_progress_reports: parseInt(reportCounts.in_progress_reports, 10) || 0,
          resolved_reports: parseInt(reportCounts.resolved_reports, 10) || 0,
          total_overrides: totalOverrides,
          total_hidden: totalHidden,
          total_users: totalUsers,
          source_status: 'online',
          upstream_provider: 'AniDoki / PhimAPI'
        },
        last_sync: lastSync,
        recent_reports: recentReports.rows,
        recent_overrides: recentOverrides.rows
      });
    } catch (err) {
      console.error('Admin dashboard stats error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải số liệu tổng quan' });
    }
  },

  async getAnime(req, res) {
    try {
      const { q = '', category = '', hidden = 'all', page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

      const overridesRes = await pool.query('SELECT * FROM anime_overrides');
      const overridesMap = new Map(overridesRes.rows.map(row => [row.anime_id, row]));

      let items = [];
      let totalItems = 0;

      if (q && q.trim()) {
        const keyword = q.trim().slice(0, 100);
        const upstream = await kkRequest('/v1/api/tim-kiem?' + new URLSearchParams({
          keyword,
          limit: '64',
          country: 'nhat-ban'
        }));
        items = (upstream.data?.items || []).filter(m => m.type === 'hoathinh').map(mapMovie);
      } else {
        const queryObj = { country: 'nhat-ban', limit: String(limitNum), page: String(pageNum) };
        if (category) queryObj.category = category;
        const upstream = await kkRequest('/v1/api/danh-sach/hoat-hinh?' + new URLSearchParams(queryObj));
        items = (upstream.data?.items || []).map(mapMovie);
        totalItems = Number(upstream.data?.params?.pagination?.totalItems) || items.length;
      }

      items = items.map(anime => {
        const override = overridesMap.get(anime.id);
        return applyAnimeOverride(anime, override);
      });

      if (hidden === 'hidden') {
        items = items.filter(a => a.is_hidden === true);
      } else if (hidden === 'visible') {
        items = items.filter(a => a.is_hidden !== true);
      }

      if (q && q.trim()) {
        totalItems = items.length;
        items = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);
      }
      const totalPages = Math.ceil(totalItems / limitNum) || 1;

      res.json({
        success: true,
        data: items,
        pagination: {
          page: pageNum,
          totalPages,
          totalItems,
          limit: limitNum,
          hasMore: pageNum < totalPages
        }
      });
    } catch (err) {
      console.error('Admin list anime error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải danh sách phim quản trị' });
    }
  },

  async getAnimeDetail(req, res) {
    const animeId = req.params.id;
    if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

    try {
      const [override, detailRes] = await Promise.all([
        AdminAnimeModel.getAnimeOverride(animeId),
        kkRequest('/phim/' + animeId).catch(() => null)
      ]);

      let anime = detailRes?.movie ? { ...mapMovie(detailRes.movie), episodes: extractEpisodes(detailRes) } : null;

      if (!anime) {
        if (!override) {
          return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin phim' });
        }
        anime = {
          id: animeId,
          title: { vietnamese: override.title_vietnamese || animeId, english: override.title_english || animeId },
          description: override.description || '',
          coverImage: override.cover_image || '/poster-placeholder.svg',
          bannerImage: override.banner_image || '',
          genres: override.genres || [],
          status: override.status || 'Ongoing',
          seasons: override.custom_seasons || [],
          episodes: []
        };
      }

      anime = applyAnimeOverride(anime, override);

      res.json({
        success: true,
        data: anime,
        override: override || null
      });
    } catch (err) {
      console.error('Admin get anime detail error:', err);
      res.status(500).json({ success: false, message: 'Lỗi lấy chi tiết phim' });
    }
  },

  async updateAnime(req, res) {
    const animeId = req.params.id;
    if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

    const {
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
    } = req.body;

    try {
      const result = await AdminAnimeModel.upsertAnimeOverride(animeId, {
        title_vietnamese,
        title_english,
        description,
        cover_image,
        banner_image,
        genres,
        status,
        is_hidden,
        custom_seasons,
        notes
      });

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'UPDATE_ANIME_OVERRIDE',
        targetType: 'anime',
        targetId: animeId,
        details: { title_vietnamese, title_english, status, is_hidden, notes },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Đã lưu chỉnh sửa phim thành công',
        data: result
      });
    } catch (err) {
      console.error('Admin update anime override error:', err);
      res.status(500).json({ success: false, message: 'Lỗi lưu thông tin chỉnh sửa phim' });
    }
  },

  async toggleAnimeVisibility(req, res) {
    const animeId = req.params.id;
    if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

    try {
      const result = await AdminAnimeModel.toggleAnimeVisibility(animeId, req.body?.is_hidden);
      const isHidden = result.is_hidden;

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'TOGGLE_ANIME_VISIBILITY',
        targetType: 'anime',
        targetId: animeId,
        details: { is_hidden: isHidden },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: isHidden ? 'Đã ẩn anime này khỏi trang web' : 'Đã mở hiển thị lại anime',
        is_hidden: isHidden,
        data: { anime_id: animeId, is_hidden: isHidden }
      });
    } catch (err) {
      console.error('Admin toggle anime visibility error:', err);
      res.status(500).json({ success: false, message: 'Lỗi chuyển đổi trạng thái ẩn/hiện phim' });
    }
  },

  async getEpisodes(req, res) {
    const animeId = req.params.id || req.params.slug;
    if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });

    try {
      const [detailRes, epOverridesRes] = await Promise.all([
        kkRequest('/phim/' + animeId).catch(() => null),
        pool.query('SELECT * FROM episode_overrides WHERE anime_id = $1 ORDER BY episode_number ASC', [animeId])
      ]);

      const overridesMap = new Map(epOverridesRes.rows.map(row => [row.episode_number, row]));
      let episodes = detailRes ? extractEpisodes(detailRes) : [];

      if (!episodes.length && epOverridesRes.rows.length) {
        episodes = epOverridesRes.rows.map(o => ({
          number: o.episode_number,
          title: `Tập ${o.episode_number}`,
          embed: o.embed_url || ''
        }));
      }

      const mergedEpisodes = episodes.map(ep => {
        const o = overridesMap.get(ep.number);
        return {
          number: ep.number,
          title: ep.title,
          original_embed: ep.embed,
          embed_url: o?.embed_url || ep.embed,
          is_hidden: Boolean(o?.is_hidden),
          last_checked_at: o?.last_checked_at || null,
          last_check_status: o?.last_check_status || null,
          notes: o?.notes || null
        };
      });

      res.json({
        success: true,
        anime_id: animeId,
        episodes: mergedEpisodes,
        data: mergedEpisodes
      });
    } catch (err) {
      console.error('Admin get episodes error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải danh sách tập phim' });
    }
  },

  async updateEpisode(req, res) {
    const animeId = req.params.id || req.params.slug;
    const episodeNumber = parseInt(req.params.episodeNumber || req.params.epNum, 10);
    if (!slugOK(animeId) || isNaN(episodeNumber) || episodeNumber < 1) {
      return res.status(400).json({ success: false, message: 'Mã phim hoặc số tập không hợp lệ' });
    }

    const { embed_url, is_hidden = false, notes } = req.body;

    if (embed_url && embed_url.trim()) {
      try {
        new URL(embed_url.trim());
      } catch {
        return res.status(400).json({ success: false, message: 'Đường dẫn video / embed không hợp lệ' });
      }
    }

    try {
      const result = await pool.query(`
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
        episodeNumber,
        embed_url ? embed_url.trim() : null,
        Boolean(is_hidden),
        notes || null
      ]);

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'UPDATE_EPISODE_OVERRIDE',
        targetType: 'episode',
        targetId: `${animeId}:${episodeNumber}`,
        details: { has_embed: Boolean(embed_url), is_hidden, notes },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: `Đã lưu cấu hình Tập ${episodeNumber}`,
        data: result.rows[0]
      });
    } catch (err) {
      console.error('Admin update episode override error:', err);
      res.status(500).json({ success: false, message: 'Lỗi lưu thông tin tập phim' });
    }
  },

  async checkEpisode(req, res) {
    const animeId = req.params.id || req.params.slug;
    const episodeNumber = parseInt(req.params.episodeNumber || req.params.epNum, 10);
    if (!slugOK(animeId) || isNaN(episodeNumber) || episodeNumber < 1) {
      return res.status(400).json({ success: false, message: 'Mã phim hoặc số tập không hợp lệ' });
    }

    try {
      const overrideRes = await pool.query(
        'SELECT * FROM episode_overrides WHERE anime_id = $1 AND episode_number = $2',
        [animeId, episodeNumber]
      );
      let targetUrl = overrideRes.rows[0]?.embed_url;

      if (!targetUrl) {
        const detail = await kkRequest('/phim/' + animeId).catch(() => null);
        const ep = detail ? extractEpisodes(detail).find(e => e.number === episodeNumber) : null;
        targetUrl = ep?.embed;
      }

      if (!targetUrl) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn nguồn phát của tập này' });
      }

      let isOk = false;
      let statusCode = 0;
      try {
        const checkRes = await fetch(targetUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        statusCode = checkRes.status;
        isOk = checkRes.ok || checkRes.status === 403 || checkRes.status === 405;
      } catch {
        try {
          const getRes = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-100' },
            signal: AbortSignal.timeout(5000)
          });
          statusCode = getRes.status;
          isOk = getRes.ok || getRes.status === 206;
        } catch {
          isOk = false;
        }
      }

      const checkStatus = isOk ? 'ok' : 'error';

      await pool.query(`
        INSERT INTO episode_overrides (anime_id, episode_number, last_checked_at, last_check_status, updated_at)
        VALUES ($1, $2, NOW(), $3, NOW())
        ON CONFLICT (anime_id, episode_number) DO UPDATE SET
          last_checked_at = NOW(),
          last_check_status = $3,
          updated_at = NOW()
      `, [animeId, episodeNumber, checkStatus]);

      res.json({
        success: true,
        status: checkStatus,
        http_code: statusCode,
        checked_at: new Date().toISOString(),
        message: isOk ? 'Nguồn phát hoạt động bình thường' : 'Nguồn phát có dấu hiệu lỗi hoặc không phản hồi'
      });
    } catch (err) {
      console.error('Check episode stream error:', err);
      res.status(500).json({ success: false, message: 'Lỗi kiểm tra nguồn phát tập phim' });
    }
  },

  async getReports(req, res) {
    try {
      const { status = 'all', page = 1, limit = 20 } = req.query;
      const data = await ReportModel.getReports({ status, page, limit });
      res.json({
        success: true,
        data: data.reports,
        pagination: data.pagination
      });
    } catch (err) {
      console.error('Admin get reports error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải danh sách báo lỗi' });
    }
  },

  async updateReport(req, res) {
    try {
      const reportId = req.params.id;
      const { status, admin_notes } = req.body;

      if (!['pending', 'in_progress', 'resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái xử lý không hợp lệ' });
      }

      const report = await ReportModel.updateReport(reportId, { status, adminNotes: admin_notes });
      if (!report) return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' });

      await AuditLogModel.record({
        userId: req.user?.id,
        adminName: req.user?.name,
        adminEmail: req.user?.email,
        action: 'UPDATE_REPORT',
        targetType: 'report',
        targetId: reportId,
        details: { status, admin_notes },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Đã cập nhật trạng thái báo cáo',
        data: report
      });
    } catch (err) {
      console.error('Admin update report error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật báo cáo' });
    }
  },

  async getUsers(req, res) {
    try {
      const { q, search = '', role = 'all', status = 'all', page = 1, limit = 20 } = req.query;
      const searchTerm = q !== undefined ? q : search;
      const data = await UserModel.getAdminUsers({ search: searchTerm, role, status, page, limit });
      res.json({
        success: true,
        users: data.users,
        pagination: data.pagination
      });
    } catch (err) {
      console.error('Admin get users error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải danh sách người dùng' });
    }
  },

  async updateUserRole(req, res) {
    const userId = req.params.id;
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Vai trò người dùng không hợp lệ' });
    }

    // Quy tắc 1: Ngăn admin tự gỡ quyền admin của chính mình
    if (req.user?.id === userId && role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự hạ quyền quản trị của chính mình.' });
    }

    try {
      // Quy tắc 2: Ngăn hạ quyền nếu là Admin hoạt động duy nhất còn lại
      if (role !== 'admin') {
        const activeAdminCountRes = await pool.query(
          "SELECT COUNT(*) FROM users WHERE role = 'admin' AND (is_banned IS FALSE OR is_banned IS NULL)"
        );
        const activeAdminCount = parseInt(activeAdminCountRes.rows[0].count, 10) || 0;
        const targetUserRes = await pool.query('SELECT role, is_banned FROM users WHERE id = $1', [userId]);

        if (targetUserRes.rows[0]?.role === 'admin' && activeAdminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Không thể hạ quyền Admin đang hoạt động duy nhất trong hệ thống.'
          });
        }
      }

      const result = await pool.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, updated_at',
        [role, userId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
      }

      await AuditLogModel.recordLog({
        userId: req.user?.id,
        adminName: req.user?.name,
        adminEmail: req.user?.email,
        action: 'UPDATE_USER_ROLE',
        targetType: 'user',
        targetId: userId,
        details: { role },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: `Đã cập nhật vai trò người dùng thành "${role}"`,
        user: result.rows[0]
      });
    } catch (err) {
      console.error('Admin update user role error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật vai trò tài khoản' });
    }
  },

  async banUser(req, res) {
    const userId = req.params.id;
    const { is_banned, ban_reason } = req.body;

    if (typeof is_banned !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Thiếu trạng thái khóa tài khoản (is_banned: boolean)' });
    }

    // Quy tắc 1: Ngăn admin tự khóa tài khoản của chính mình
    if (req.user?.id === userId) {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự khóa tài khoản của chính mình.' });
    }

    try {
      const targetUserRes = await pool.query('SELECT role, is_banned, email, name FROM users WHERE id = $1', [userId]);
      if (!targetUserRes.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
      }
      const target = targetUserRes.rows[0];

      // Quy tắc 2: Ngăn khóa nếu đây là Admin hoạt động duy nhất
      if (is_banned && target.role === 'admin') {
        const activeAdminCountRes = await pool.query(
          "SELECT COUNT(*) FROM users WHERE role = 'admin' AND (is_banned IS FALSE OR is_banned IS NULL)"
        );
        const activeAdminCount = parseInt(activeAdminCountRes.rows[0].count, 10) || 0;
        if (activeAdminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Không thể khóa Admin đang hoạt động duy nhất trong hệ thống.'
          });
        }
      }

      const updatedRes = await pool.query(`
        UPDATE users
        SET 
          is_banned = $1,
          ban_reason = CASE WHEN $1 = TRUE THEN $2 ELSE NULL END,
          banned_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
          updated_at = NOW()
        WHERE id = $3
        RETURNING id, name, email, role, is_banned, ban_reason, banned_at, updated_at
      `, [is_banned, ban_reason || null, userId]);

      // Nếu khóa tài khoản, lập tức hủy toàn bộ phiên làm việc của user đó
      if (is_banned) {
        await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      }

      await AuditLogModel.recordLog({
        userId: req.user?.id,
        adminName: req.user?.name,
        adminEmail: req.user?.email,
        action: is_banned ? 'BAN_USER' : 'UNBAN_USER',
        targetType: 'user',
        targetId: userId,
        details: { is_banned, ban_reason, target_email: target.email },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: is_banned ? 'Đã khóa tài khoản thành công' : 'Đã mở khóa tài khoản thành công',
        user: updatedRes.rows[0]
      });
    } catch (err) {
      console.error('Admin ban user error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái khóa tài khoản' });
    }
  },

  async getHomepageConfig(req, res) {
    try {
      const config = await ConfigModel.getHomepageConfig();
      res.json({
        success: true,
        data: config
      });
    } catch (err) {
      console.error('Admin get homepage config error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải cấu hình trang chủ' });
    }
  },

  async updateHomepageConfig(req, res) {
    const { spotlight_slugs, sections_config } = req.body;

    try {
      const result = await pool.query(`
        INSERT INTO homepage_config (id, spotlight_slugs, sections_config, updated_at, updated_by)
        VALUES (
          'default',
          COALESCE($1::jsonb, '[]'::jsonb),
          COALESCE($2::jsonb, '[]'::jsonb),
          NOW(),
          $3
        )
        ON CONFLICT (id) DO UPDATE SET
          spotlight_slugs = COALESCE(EXCLUDED.spotlight_slugs, homepage_config.spotlight_slugs),
          sections_config = COALESCE(EXCLUDED.sections_config, homepage_config.sections_config),
          updated_at = NOW(),
          updated_by = EXCLUDED.updated_by
        RETURNING *;
      `, [
        spotlight_slugs ? JSON.stringify(spotlight_slugs) : null,
        sections_config ? JSON.stringify(sections_config) : null,
        req.user?.id || 'admin'
      ]);

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'UPDATE_HOMEPAGE_CONFIG',
        targetType: 'homepage',
        targetId: 'default',
        details: { spotlight_slugs, sections_config },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Đã cập nhật cấu hình trang chủ thành công',
        config: result.rows[0],
        data: result.rows[0]
      });
    } catch (err) {
      console.error('Admin update homepage config error:', err);
      res.status(500).json({ success: false, message: 'Lỗi lưu cấu hình trang chủ' });
    }
  },

  async getSettings(req, res) {
    try {
      const settings = await ConfigModel.getSystemSettings();
      res.json({
        success: true,
        settings
      });
    } catch (err) {
      console.error('Admin get settings error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải cài đặt hệ thống' });
    }
  },

  async updateSettings(req, res) {
    const allowedKeys = ['site_name', 'site_logo', 'contact_email', 'site_announcement', 'maintenance_mode'];
    const updates = req.body.settings || req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, message: 'Dữ liệu cài đặt không hợp lệ' });
    }

    try {
      for (const [key, val] of Object.entries(updates)) {
        if (allowedKeys.includes(key)) {
          await pool.query(`
            INSERT INTO system_settings (key, value, updated_at, updated_by)
            VALUES ($1, $2::jsonb, NOW(), $3)
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = NOW(),
              updated_by = EXCLUDED.updated_by;
          `, [key, JSON.stringify(val), req.user?.id || 'admin']);
        }
      }

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'UPDATE_SYSTEM_SETTINGS',
        targetType: 'settings',
        targetId: 'site_settings',
        details: updates,
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Đã lưu cài đặt hệ thống thành công'
      });
    } catch (err) {
      console.error('Admin update settings error:', err);
      res.status(500).json({ success: false, message: 'Lỗi lưu cài đặt hệ thống' });
    }
  },

  async getFeedback(req, res) {
    try {
      const { status = 'all', page = 1, limit = 20 } = req.query;
      const data = await FeedbackModel.getFeedbackList({ status, page, limit });
      res.json({
        success: true,
        data: data.feedbacks,
        feedback: data.feedbacks,
        pagination: data.pagination
      });
    } catch (err) {
      console.error('Admin get feedback error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải danh sách phản hồi góp ý' });
    }
  },

  async updateFeedback(req, res) {
    try {
      const feedbackId = req.params.id;
      const { status, admin_notes } = req.body;

      if (status && !['pending', 'reviewed', 'resolved', 'ignored', 'dismissed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái phản hồi không hợp lệ' });
      }

      const feedback = await FeedbackModel.updateFeedback(feedbackId, { status, adminNotes: admin_notes });
      if (!feedback) return res.status(404).json({ success: false, message: 'Không tìm thấy phản hồi' });

      await AuditLogModel.recordLog({
        userId: req.user?.id,
        adminName: req.user?.name,
        adminEmail: req.user?.email,
        action: 'PROCESS_FEEDBACK',
        targetType: 'feedback',
        targetId: feedbackId,
        details: { status, admin_notes },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Đã cập nhật trạng thái phản hồi',
        data: feedback,
        feedback: feedback
      });
    } catch (err) {
      console.error('Admin update feedback error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật phản hồi góp ý' });
    }
  },

  async getUserById(req, res) {
    const userId = req.params.id;
    try {
      const userRes = await pool.query(`
        SELECT id, name, email, avatar, provider, role, is_banned, ban_reason, banned_at, player_settings, created_at, updated_at
        FROM users
        WHERE id = $1
      `, [userId]);

      if (!userRes.rows.length) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
      }

      const [sessionsRes, watchlistRes, historyRes] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND expires_at > NOW()', [userId]),
        pool.query('SELECT COUNT(*) FROM kk_watchlist WHERE user_id = $1', [userId]),
        pool.query('SELECT COUNT(*) FROM kk_history WHERE user_id = $1', [userId])
      ]);

      res.json({
        success: true,
        user: userRes.rows[0],
        stats: {
          activeSessions: parseInt(sessionsRes.rows[0]?.count, 10) || 0,
          watchlistCount: parseInt(watchlistRes.rows[0]?.count, 10) || 0,
          historyCount: parseInt(historyRes.rows[0]?.count, 10) || 0
        }
      });
    } catch (err) {
      console.error('Admin user detail error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải thông tin chi tiết người dùng' });
    }
  },

  async getSyncLogs(req, res) {
    try {
      const result = await pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 50');
      res.json({
        success: true,
        data: result.rows,
        is_syncing: Boolean(activeSyncTask)
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi tải nhật ký đồng bộ' });
    }
  },

  async syncAnime(req, res) {
    const { slug } = req.body;
    if (!slugOK(slug)) return res.status(400).json({ success: false, message: 'Mã phim cần đồng bộ không hợp lệ' });

    if (activeSyncTask) {
      return res.status(409).json({ success: false, message: 'Hiện đang có tác vụ đồng bộ đang chạy. Vui lòng chờ hoàn tất.' });
    }

    activeSyncTask = `anime:${slug}`;
    let logId = null;

    try {
      const logRes = await pool.query(`
        INSERT INTO sync_logs (sync_type, target_slug, status, started_at)
        VALUES ('manual_anime', $1, 'running', NOW())
        RETURNING id;
      `, [slug]);
      logId = logRes.rows[0].id;

      const detail = await kkRequest('/phim/' + slug);
      if (!detail.movie) throw new Error('Upstream không trả về dữ liệu phim');

      const epCount = extractEpisodes(detail).length;

      await pool.query(`
        UPDATE sync_logs
        SET status = 'success', items_synced = 1, details = $1, finished_at = NOW()
        WHERE id = $2
      `, [JSON.stringify({ title: detail.movie.name, episodes_count: epCount }), logId]);

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'SYNC_ANIME',
        targetType: 'anime',
        targetId: slug,
        details: { title: detail.movie.name, episodes_count: epCount },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: `Đã đồng bộ thành công anime "${detail.movie.name}" (${epCount} tập).`,
        episodes_count: epCount
      });
    } catch (err) {
      if (logId) {
        await pool.query(`
          UPDATE sync_logs
          SET status = 'failed', error_message = $1, finished_at = NOW()
          WHERE id = $2
        `, [err.message || 'Lỗi không xác định', logId]);
      }
      res.status(500).json({ success: false, message: `Lỗi đồng bộ: ${err.message}` });
    } finally {
      activeSyncTask = null;
    }
  },

  async syncRecentCatalog(req, res) {
    const limit = Math.min(48, Math.max(12, parseInt(req.body.limit, 10) || 24));

    if (activeSyncTask) {
      return res.status(409).json({ success: false, message: 'Hiện đang có tác vụ đồng bộ đang chạy. Vui lòng chờ hoàn tất.' });
    }

    activeSyncTask = `catalog_recent:${limit}`;
    let logId = null;

    try {
      const logRes = await pool.query(`
        INSERT INTO sync_logs (sync_type, status, started_at)
        VALUES ('catalog_recent', 'running', NOW())
        RETURNING id;
      `);
      logId = logRes.rows[0].id;

      const data = await kkRequest(`/v1/api/danh-sach/hoat-hinh?country=nhat-ban&limit=${limit}&page=1`);
      const items = data.data?.items || [];

      await pool.query(`
        UPDATE sync_logs
        SET status = 'success', items_synced = $1, details = $2, finished_at = NOW()
        WHERE id = $3
      `, [items.length, JSON.stringify({ count: items.length }), logId]);

      await AuditLogModel.recordLog({
        userId: req.user?.id || 'system',
        adminName: req.user?.name || 'Admin',
        adminEmail: req.user?.email || null,
        action: 'SYNC_RECENT_CATALOG',
        targetType: 'catalog',
        targetId: `recent_${limit}`,
        details: { items_synced: items.length },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: `Đã hoàn tất đồng bộ danh mục ${items.length} phim mới cập nhật từ AniDoki.`,
        items_synced: items.length
      });
    } catch (err) {
      if (logId) {
        await pool.query(`
          UPDATE sync_logs
          SET status = 'failed', error_message = $1, finished_at = NOW()
          WHERE id = $2
        `, [err.message || 'Lỗi không xác định', logId]);
      }
      res.status(500).json({ success: false, message: `Lỗi đồng bộ danh mục: ${err.message}` });
    } finally {
      activeSyncTask = null;
    }
  },

  async getAuditLogs(req, res) {
    try {
      const { q, action = 'all', target_type = 'all', page = 1, limit = 25 } = req.query;
      const data = await AuditLogModel.getLogs({ q, action, targetType: target_type, page, limit });
      res.json({
        success: true,
        logs: data.logs,
        data: data.logs,
        pagination: data.pagination
      });
    } catch (err) {
      console.error('Admin get audit logs error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải nhật ký kiểm toán' });
    }
  }
};
