import { WatchlistModel } from '../models/watchlist.model.js';
import { movieDetail, slugOK } from '../services/kkphim.service.js';

export const LibraryController = {
  async getWatchlist(req, res) {
    try {
      const items = await WatchlistModel.getWatchlist(req.user.id);
      res.json({ success: true, data: items, total: items.length });
    } catch (err) {
      console.error('Watchlist fetch error:', err);
      res.status(500).json({ success: false, message: 'Không thể tải danh sách yêu thích' });
    }
  },

  async toggleWatchlist(req, res) {
    try {
      const { animeId } = req.body;
      if (!slugOK(animeId)) {
        return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });
      }
      const anime = await movieDetail(animeId);
      const saved = await WatchlistModel.toggleWatchlist(req.user.id, animeId, anime);
      res.json({
        success: true,
        saved,
        message: saved ? 'Đã lưu phim vào danh sách yêu thích' : 'Đã bỏ lưu phim khỏi danh sách yêu thích'
      });
    } catch (err) {
      console.error('Watchlist toggle error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật danh sách yêu thích' });
    }
  },

  async getLibrary(req, res) {
    try {
      const { status = 'all', q = '' } = req.query;
      const { items, counts } = await WatchlistModel.getLibrary(req.user.id, { status, q });
      res.json({ success: true, data: items, counts });
    } catch (err) {
      console.error('Library error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải thư viện cá nhân' });
    }
  },

  async updateLibraryStatus(req, res) {
    try {
      const { animeId, status = 'plan_to_watch' } = req.body;
      if (!slugOK(animeId)) return res.status(400).json({ success: false, message: 'Mã phim không hợp lệ' });
      if (!['plan_to_watch', 'watching', 'completed'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái theo dõi không hợp lệ' });
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
          episodes: [{ number: 1, title: 'Tập 1' }]
        };
      }

      await WatchlistModel.updateLibraryStatus(req.user.id, animeId, anime, status);
      res.json({ success: true, message: 'Đã cập nhật trạng thái trong thư viện', status });
    } catch (err) {
      console.error('Library update error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái thư viện' });
    }
  },

  async deleteLibraryItem(req, res) {
    try {
      await WatchlistModel.deleteLibraryItem(req.user.id, req.params.animeId);
      res.json({ success: true, message: 'Đã xóa phim khỏi thư viện' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi xóa khỏi thư viện' });
    }
  }
};
