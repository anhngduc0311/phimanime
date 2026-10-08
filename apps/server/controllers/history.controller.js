import { HistoryModel } from '../models/history.model.js';
import { movieDetail, slugOK } from '../services/kkphim.service.js';

export const HistoryController = {
  async getHistory(req, res) {
    try {
      const { page, limit } = req.query;
      const { items, pagination } = await HistoryModel.getHistory(req.user.id, { page, limit });
      res.json({
        success: true,
        data: items,
        pagination
      });
    } catch (err) {
      console.error('History fetch error:', err);
      res.status(500).json({ success: false, message: 'Không thể tải lịch sử xem' });
    }
  },

  async saveProgress(req, res) {
    try {
      const { animeId, episodeNumber, currentTime = 0, duration = 0 } = req.body;
      if (!slugOK(animeId)) {
        return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });
      }
      const epNum = Number(episodeNumber);
      if (!Number.isInteger(epNum) || epNum < 1) {
        return res.status(400).json({ success: false, message: 'Tập phim không hợp lệ' });
      }

      let anime = null;
      try {
        anime = await movieDetail(animeId);
      } catch {
        anime = {
          id: animeId,
          title: { vietnamese: animeId, english: animeId },
          coverImage: '/poster-placeholder.svg',
          bannerImage: '/poster-placeholder.svg',
          episodes: [{ number: epNum, title: `Tập ${epNum}` }]
        };
      }

      await HistoryModel.saveProgress(req.user.id, animeId, anime, epNum, currentTime, duration);
      res.json({ success: true });
    } catch (err) {
      console.error('History save error:', err);
      res.status(500).json({ success: false, message: 'Lỗi lưu tiến độ xem' });
    }
  },

  async deleteHistoryItem(req, res) {
    try {
      await HistoryModel.deleteHistory(req.user.id, req.params.animeId);
      res.json({ success: true, message: 'Đã xóa anime khỏi lịch sử xem' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi xóa lịch sử xem' });
    }
  },

  async clearAllHistory(req, res) {
    try {
      await HistoryModel.clearAllHistory(req.user.id);
      res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử xem phim' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi xóa toàn bộ lịch sử' });
    }
  }
};
