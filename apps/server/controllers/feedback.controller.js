import { FeedbackModel } from '../models/feedback.model.js';
import { checkFeedbackRateLimit } from '../middlewares/rateLimit.middleware.js';

export const FeedbackController = {
  async submitFeedback(req, res) {
    try {
      const identifier = req.user ? req.user.id : (req.ip || req.socket.remoteAddress || 'guest');
      if (!checkFeedbackRateLimit(identifier)) {
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Bạn gửi phản hồi quá nhanh. Vui lòng thử lại sau 1 phút.'
        });
      }

      const { name, email, subject, message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được để trống.' });
      }

      const feedback = await FeedbackModel.createFeedback({
        userId: req.user ? req.user.id : null,
        name: (name && typeof name === 'string') ? name : (req.user?.name || ''),
        email: (email && typeof email === 'string') ? email : (req.user?.email || ''),
        subject: (subject && typeof subject === 'string') ? subject : '',
        message: message.slice(0, 2000)
      });

      res.json({
        success: true,
        message: 'Cảm ơn bạn đã gửi ý kiến đóng góp cho AniDoki!',
        feedbackId: feedback.id
      });
    } catch (err) {
      console.error('Feedback submit error:', err);
      res.status(500).json({ success: false, message: 'Lỗi gửi phản hồi góp ý' });
    }
  }
};
