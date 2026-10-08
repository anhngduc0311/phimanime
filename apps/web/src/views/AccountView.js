import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { showToast, showConfirmModal } from '../utils/ui.js';
import { updateUserUI } from '../components/AuthModal.js';

export async function loadAccountView() {
  const unauthView = document.getElementById('account-unauth');
  const contentView = document.getElementById('account-content');

  if (!state.user) {
    if (unauthView) unauthView.style.display = 'block';
    if (contentView) contentView.style.display = 'none';
    document.getElementById('account-login-btn')?.addEventListener('click', () => {
      document.getElementById('login-modal')?.classList.add('active');
    });
    return;
  }

  if (unauthView) unauthView.style.display = 'none';
  if (contentView) contentView.style.display = 'block';

  // Tải thông tin mới nhất từ máy chủ
  const res = await AniDokiAPI.getAccountProfile();
  if (res.success && res.user) {
    state.user = res.user;
  }

  const u = state.user;
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=e50914&color=fff&bold=true`;
  const avatarSrc = u.avatar || fallbackAvatar;

  const avatarImg = document.getElementById('account-avatar-img');
  if (avatarImg) {
    avatarImg.onerror = () => { avatarImg.src = fallbackAvatar; };
    avatarImg.src = avatarSrc;
  }

  const nameEl = document.getElementById('account-profile-name');
  if (nameEl) nameEl.textContent = u.name || 'Người dùng';

  const emailEl = document.getElementById('account-profile-email');
  if (emailEl) emailEl.textContent = u.email || '—';

  const roleEl = document.getElementById('account-profile-role');
  if (roleEl) {
    roleEl.textContent = u.role === 'admin' ? 'Quản trị viên' : 'Thành viên';
    roleEl.className = u.role === 'admin' ? 'badge-role' : 'badge-role badge-report-dismissed';
  }

  const providerEl = document.getElementById('account-profile-provider');
  if (providerEl) providerEl.textContent = u.provider === 'google' ? 'Google OAuth' : 'Nội bộ';

  const createdEl = document.getElementById('account-profile-created');
  if (createdEl) createdEl.textContent = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—';

  // Form chỉnh sửa hồ sơ
  const nameInput = document.getElementById('account-input-name');
  if (nameInput) nameInput.value = u.name || '';

  const avatarInput = document.getElementById('account-input-avatar');
  if (avatarInput) avatarInput.value = u.avatar || '';

  const profileForm = document.getElementById('account-profile-form');
  if (profileForm) {
    profileForm.onsubmit = async (e) => {
      e.preventDefault();
      const newName = nameInput?.value?.trim();
      const newAvatar = avatarInput?.value?.trim() || null;
      if (!newName) {
        showToast('Tên hiển thị không được để trống');
        return;
      }

      const updateRes = await AniDokiAPI.updateAccountProfile({ name: newName, avatar: newAvatar });
      if (updateRes.success && updateRes.user) {
        state.user = updateRes.user;
        updateUserUI();
        if (nameEl) nameEl.textContent = state.user.name;
        if (avatarImg) avatarImg.src = state.user.avatar || fallbackAvatar;
        showToast('Cập nhật thông tin cá nhân thành công!');
      } else {
        showToast(updateRes.message || 'Lỗi cập nhật hồ sơ');
      }
    };
  }

  // Tùy chọn xem phim (Player Preferences)
  const ps = u.player_settings || {};
  const autoNextChk = document.getElementById('pref-auto-next');
  const autoPlayChk = document.getElementById('pref-auto-play');
  const defaultSpeedSel = document.getElementById('pref-default-speed');
  const preferredQualitySel = document.getElementById('pref-preferred-quality');

  if (autoNextChk) autoNextChk.checked = ps.autoNext !== false;
  if (autoPlayChk) autoPlayChk.checked = ps.autoPlay !== false;
  if (defaultSpeedSel) defaultSpeedSel.value = String(ps.defaultSpeed || 1);
  if (preferredQualitySel) preferredQualitySel.value = ps.preferredQuality || 'auto';

  const saveSettingsBtn = document.getElementById('save-player-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.onclick = async () => {
      const newSettings = {
        autoNext: Boolean(autoNextChk?.checked),
        autoPlay: Boolean(autoPlayChk?.checked),
        defaultSpeed: parseFloat(defaultSpeedSel?.value) || 1,
        preferredQuality: preferredQualitySel?.value || 'auto'
      };

      const updateRes = await AniDokiAPI.updateAccountProfile({ player_settings: newSettings });
      if (updateRes.success && updateRes.user) {
        state.user.player_settings = newSettings;
        showToast('Đã lưu tùy chọn xem phim vào tài khoản!');
      } else {
        showToast(updateRes.message || 'Lỗi lưu tùy chọn xem');
      }
    };
  }

  // Danh sách phiên hoạt động
  await renderAccountSessions();

  // Nút đăng xuất các thiết bị khác
  const revokeBtn = document.getElementById('revoke-others-btn');
  if (revokeBtn) {
    revokeBtn.onclick = () => {
      showConfirmModal({
        title: 'Đăng xuất khỏi thiết bị khác',
        message: 'Bạn có chắc chắn muốn thu hồi quyền truy cập của tất cả các phiên đăng nhập khác?',
        onConfirm: async () => {
          const revRes = await AniDokiAPI.revokeOtherSessions();
          if (revRes.success) {
            showToast(revRes.message || 'Đã đăng xuất các thiết bị khác');
            await renderAccountSessions();
          } else {
            showToast(revRes.message || 'Lỗi thu hồi phiên đăng nhập');
          }
        }
      });
    };
  }
}

export async function renderAccountSessions() {
  const sessionsContainer = document.getElementById('account-sessions-list');
  if (!sessionsContainer) return;

  sessionsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">Đang tải danh sách thiết bị...</div>`;

  const res = await AniDokiAPI.getAccountSessions();
  if (!res.success) {
    sessionsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #ff5252; font-size: 13px;">${res.message || 'Lỗi tải danh sách phiên'}</div>`;
    return;
  }

  const sessions = res.sessions || [];
  if (!sessions.length) {
    sessionsContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">Không tìm thấy phiên làm việc nào.</div>`;
    return;
  }

  sessionsContainer.innerHTML = '';
  sessions.forEach(sess => {
    const card = document.createElement('div');
    card.className = `session-card-item ${sess.isCurrent ? 'current' : ''}`;
    const createdStr = sess.createdAt ? new Date(sess.createdAt).toLocaleString('vi-VN') : '—';

    card.innerHTML = `
      <div style="display: flex; align-items: center;">
        <span class="session-device-icon">${sess.userAgent?.includes('Mobile') ? '📱' : '💻'}</span>
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <strong style="color: var(--text-primary); font-size: 13px;">${sess.userAgent ? sess.userAgent.split(' ')[0] : 'Trình duyệt Web'}</strong>
            ${sess.isCurrent ? '<span class="badge-user-active" style="font-size: 10.5px;">Thiết bị hiện tại</span>' : ''}
          </div>
          <div class="session-meta-sub">IP: ${sess.ipAddress || '—'} · Đăng nhập: ${createdStr}</div>
        </div>
      </div>
    `;
    sessionsContainer.appendChild(card);
  });
}
