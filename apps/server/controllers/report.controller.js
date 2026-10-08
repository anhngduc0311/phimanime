import { ReportModel } from '../models/report.model.js';
import { checkReportRateLimit } from '../middlewares/rateLimit.middleware.js';
import { slugOK } from '../services/kkphim.service.js';

export const ReportController = {
  async submitReport(req, res) {
    try {
      const identifier = req.user ? req.user.id : (req.ip || req.socket.remoteAddress || 'guest');
      if (!checkReportRateLimit(identifier)) {
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Bạn gửi quá nhiều báo lỗi. Vui lòng thử lại sau 1 phút.'
        });
      }

      const animeSlug = req.body.anime_slug || req.body.anime_id;
      const { anime_title, episode_number, provider = 'KKPhim', issue_type, description = '' } = req.body;
      const title = anime_title || animeSlug;

      if (!slugOK(animeSlug) || !title || !Number.isInteger(Number(episode_number)) || !issue_type) {
        return res.status(400).json({ success: false, message: 'Dữ liệu báo cáo sự cố không hợp lệ' });
      }

      const report = await ReportModel.createReport({
        userId: req.user ? req.user.id : null,
        animeSlug: animeSlug,
        animeTitle: String(title).slice(0, 200),
        episodeNumber: Number(episode_number),
        provider: String(provider).slice(0, 50),
        issueType: String(issue_type).slice(0, 50),
        description: String(description).slice(0, 1000)
      });

      res.status(201).json({
        success: true,
        message: 'Cảm ơn bạn đã phản hồi sự cố! Đội ngũ AniDoki sẽ kiểm tra và khắc phục sớm nhất.',
        reportId: report.id,
        report: report,
        data: report
      });
    } catch (err) {
      console.error('Report submission error:', err);
      res.status(500).json({ success: false, message: 'Lỗi gửi báo cáo sự cố' });
    }
  }
};
