import {
  getUserSessions,
  revokeOtherSessions,
  updateUserProfile
} from '../services/auth.service.js';

export const AccountController = {
  getProfile(req, res) {
    res.json({
      success: true,
      user: req.user
    });
  },

  async updateProfile(req, res) {
    try {
      const { name, avatar, player_settings } = req.body;

      if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
        return res.status(400).json({ success: false, message: 'Tên hiển thị không hợp lệ (tối đa 100 ký tự).' });
      }

      if (avatar !== undefined && avatar !== null && typeof avatar === 'string' && avatar.trim() !== '') {
        if (!avatar.startsWith('http://') && !avatar.startsWith('https://')) {
          return res.status(400).json({ success: false, message: 'URL ảnh đại diện phải bắt đầu bằng http:// hoặc https://' });
        }
      }

      const updated = await updateUserProfile(req.user.id, {
        name: name !== undefined ? name.trim() : undefined,
        avatar: avatar !== undefined ? (avatar ? avatar.trim() : null) : undefined,
        player_settings: player_settings !== undefined ? player_settings : undefined
      });

      res.json({
        success: true,
        message: 'Cập nhật thông tin tài khoản thành công',
        user: updated
      });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ success: false, message: 'Lỗi cập nhật hồ sơ người dùng' });
    }
  },

  async getSessions(req, res) {
    try {
      const sessions = await getUserSessions(req.user.id, req.token);
      res.json({
        success: true,
        sessions
      });
    } catch (err) {
      console.error('Get sessions error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải danh sách phiên đăng nhập' });
    }
  },

  async revokeOtherSessions(req, res) {
    try {
      const result = await revokeOtherSessions(req.user.id, req.token);
      res.json({
        success: true,
        message: `Đã đăng xuất thành công khỏi ${result.revokedCount} thiết bị khác.`,
        revokedCount: result.revokedCount
      });
    } catch (err) {
      console.error('Revoke sessions error:', err);
      res.status(500).json({ success: false, message: 'Lỗi thu hồi phiên đăng nhập' });
    }
  }
};
