import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { showToast } from '../utils/ui.js';

const GOOGLE_CLIENT_ID = '680572592219-jovd5g5n9p9k5r1ok4p81cpu5sr4hiu9.apps.googleusercontent.com';
let googleTokenClient = null;

export function updateUserUI() {
  const openLoginBtn = document.getElementById('open-login-btn');
  const userDisplayName = document.getElementById('user-display-name');
  const userDropdown = document.getElementById('user-dropdown');
  const userAvatarImg = document.getElementById('user-avatar-img');
  const userDropdownName = document.getElementById('user-dropdown-name');
  const userDropdownEmail = document.getElementById('user-dropdown-email');
  const loginIcon = document.getElementById('login-btn-icon');
  const roleBadge = document.getElementById('user-dropdown-role-badge');
  const adminMenuSection = document.getElementById('admin-menu-section');

  if (state.user) {
    const firstName = state.user.name ? state.user.name.split(' ').slice(-1)[0] : 'Tài khoản';
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.name || 'User')}&background=e50914&color=fff&bold=true`;
    const avatarSrc = state.user.avatar || fallbackAvatar;

    if (userDisplayName) userDisplayName.textContent = firstName;
    if (userDropdownName) userDropdownName.textContent = state.user.name || 'Người dùng AniDoki';
    if (userDropdownEmail) userDropdownEmail.textContent = state.user.email || '';
    
    if (userAvatarImg) {
      userAvatarImg.setAttribute('referrerpolicy', 'no-referrer');
      userAvatarImg.setAttribute('crossorigin', 'anonymous');
      userAvatarImg.onerror = () => { userAvatarImg.src = fallbackAvatar; };
      userAvatarImg.src = avatarSrc;
    }

    // Cập nhật huy hiệu Admin & nút mở trang quản trị
    const isAdmin = state.user.role === 'admin';
    if (roleBadge) roleBadge.style.display = isAdmin ? 'inline-block' : 'none';
    if (adminMenuSection) adminMenuSection.style.display = isAdmin ? 'block' : 'none';

    // Hiển thị avatar tròn nhỏ trong nút đăng nhập
    let thumb = openLoginBtn?.querySelector('.user-avatar-thumb');
    if (!thumb && openLoginBtn) {
      thumb = document.createElement('img');
      thumb.className = 'user-avatar-thumb';
      thumb.setAttribute('referrerpolicy', 'no-referrer');
      thumb.setAttribute('crossorigin', 'anonymous');
      thumb.onerror = () => { thumb.src = fallbackAvatar; };
      thumb.src = avatarSrc;
      thumb.alt = state.user.name || 'Avatar';
      openLoginBtn.prepend(thumb);
    } else if (thumb) {
      thumb.setAttribute('referrerpolicy', 'no-referrer');
      thumb.setAttribute('crossorigin', 'anonymous');
      thumb.onerror = () => { thumb.src = fallbackAvatar; };
      thumb.src = avatarSrc;
    }
    if (loginIcon) loginIcon.style.display = 'none';
  } else {
    if (userDisplayName) userDisplayName.textContent = 'Đăng nhập';
    const thumb = openLoginBtn?.querySelector('.user-avatar-thumb');
    if (thumb) thumb.remove();
    if (loginIcon) loginIcon.style.display = 'inline-block';
    if (userDropdown) userDropdown.hidden = true;
    if (roleBadge) roleBadge.style.display = 'none';
    if (adminMenuSection) adminMenuSection.style.display = 'none';
  }
}

export function initGoogleServices(onSuccess) {
  const resetGoogleBtn = () => {
    const btn = document.getElementById('google-login-btn');
    if (btn) {
      const span = btn.querySelector('span');
      if (span) span.textContent = 'Tiếp tục với Google';
    }
  };

  if (window.google?.accounts?.oauth2) {
    try {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: async (tokenResponse) => {
          try {
            if (tokenResponse && tokenResponse.access_token) {
              const res = await AniDokiAPI.googleLogin({ access_token: tokenResponse.access_token });
              if (res.success && res.user) {
                await onSuccess(res.user);
              } else {
                showToast(res.message || 'Đăng nhập Google thất bại');
              }
            }
          } finally {
            resetGoogleBtn();
          }
        }
      });
    } catch (err) {
      console.warn('Google Token Client init error:', err);
      resetGoogleBtn();
    }
  }

  if (window.google?.accounts?.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            if (response && response.credential) {
              const res = await AniDokiAPI.googleLogin({ credential: response.credential });
              if (res.success && res.user) {
                await onSuccess(res.user);
              } else {
                showToast(res.message || 'Đăng nhập Google thất bại');
              }
            }
          } finally {
            resetGoogleBtn();
          }
        },
        auto_select: false
      });
    } catch (err) {
      console.warn('Google GSI init error:', err);
      resetGoogleBtn();
    }
  }
}

export async function restoreUserSession() {
  const token = AniDokiAPI.getToken();
  if (!token) {
    state.user = null;
    updateUserUI();
    return;
  }

  try {
    const res = await AniDokiAPI.getMe();
    if (res.success && res.user) {
      state.user = res.user;
      localStorage.setItem('anidoki_user', JSON.stringify(res.user));
    } else {
      state.user = null;
      state.watchlistIds = [];
      AniDokiAPI.clearToken();
      localStorage.removeItem('anidoki_user');
      if (res.code === 'SESSION_EXPIRED') {
        showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      } else if (res.code === 'ACCOUNT_BANNED') {
        showToast(res.message || 'Tài khoản của bạn đã bị khóa.');
      }
    }
  } catch {
    state.user = null;
  }
  updateUserUI();
}

export function initLoginModal(callbacks = {}) {
  const { onLoginSuccess, onLogout } = callbacks;
  const modal = document.getElementById('login-modal');
  const openLoginBtn = document.getElementById('open-login-btn');
  const userDropdown = document.getElementById('user-dropdown');
  const logoutBtn = document.getElementById('logout-btn');
  const googleBtn = document.getElementById('google-login-btn');

  // Đóng dropdown khi bấm vào các mục bên trong
  userDropdown?.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('click', () => {
      userDropdown.hidden = true;
    });
  });

  const handleLoginSuccess = async (user) => {
    state.user = user;
    localStorage.setItem('anidoki_user', JSON.stringify(user));
    updateUserUI();
    modal?.classList.remove('active');
    showToast(`Đăng nhập thành công! Chào mừng ${user.name}`);
    if (googleBtn) {
      googleBtn.disabled = false;
      const span = googleBtn.querySelector('span');
      if (span) span.textContent = 'Tiếp tục với Google';
    }
    if (onLoginSuccess) await onLoginSuccess(user);
  };

  // Khởi tạo Google SDK khi script đã tải
  if (window.google) {
    initGoogleServices(handleLoginSuccess);
  } else {
    window.addEventListener('load', () => initGoogleServices(handleLoginSuccess));
  }

  // Click nút User / Đăng nhập
  openLoginBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.user) {
      userDropdown.hidden = !userDropdown.hidden;
    } else {
      modal?.classList.add('active');
    }
  });

  // Đóng dropdown khi click bên ngoài
  document.addEventListener('click', (e) => {
    if (userDropdown && !userDropdown.hidden && !userDropdown.contains(e.target) && e.target !== openLoginBtn) {
      userDropdown.hidden = true;
    }
  });

  // Nút Đăng xuất
  logoutBtn?.addEventListener('click', async () => {
    await AniDokiAPI.logout();
    state.user = null;
    state.watchlistIds = [];
    localStorage.removeItem('anidoki_user');
    updateUserUI();
    if (onLogout) await onLogout();
    showToast('Đã đăng xuất tài khoản.');
  });

  document.getElementById('close-login-btn')?.addEventListener('click', () => {
    modal?.classList.remove('active');
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('active')) {
      modal.classList.remove('active');
      openLoginBtn?.focus();
    }
  });

  // Bấm Đăng nhập bằng Google
  googleBtn?.addEventListener('click', async () => {
    if (!googleTokenClient && window.google?.accounts?.oauth2) {
      initGoogleServices(handleLoginSuccess);
    }

    if (googleTokenClient) {
      const span = googleBtn.querySelector('span');
      if (span) span.textContent = 'Đang mở cửa sổ Google...';
      googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    } else if (window.google?.accounts?.id) {
      google.accounts.id.prompt();
    } else {
      showToast('Không thể kết nối đến Google Identity Services. Vui lòng kiểm tra chặn quảng cáo/kết nối mạng và thử lại.');
      if (googleBtn) {
        const span = googleBtn.querySelector('span');
        if (span) span.textContent = 'Tiếp tục với Google';
      }
    }
  });

  // Chuyển đổi tab Đăng nhập / Đăng ký
  const tabBtnLogin = document.getElementById('tab-btn-login');
  const tabBtnRegister = document.getElementById('tab-btn-register');
  const tabContentLogin = document.getElementById('auth-tab-login');
  const tabContentRegister = document.getElementById('auth-tab-register');
  const switchToRegister = document.getElementById('switch-to-register');
  const switchToLogin = document.getElementById('switch-to-login');

  const switchAuthTab = (tab) => {
    if (tab === 'register') {
      tabBtnLogin?.classList.remove('active');
      tabBtnRegister?.classList.add('active');
      if (tabContentLogin) tabContentLogin.style.display = 'none';
      if (tabContentRegister) tabContentRegister.style.display = 'block';
    } else {
      tabBtnRegister?.classList.remove('active');
      tabBtnLogin?.classList.add('active');
      if (tabContentRegister) tabContentRegister.style.display = 'none';
      if (tabContentLogin) tabContentLogin.style.display = 'block';
    }
    const loginErr = document.getElementById('admin-login-error');
    const regErr = document.getElementById('auth-register-error');
    if (loginErr) loginErr.style.display = 'none';
    if (regErr) regErr.style.display = 'none';
  };

  tabBtnLogin?.addEventListener('click', () => switchAuthTab('login'));
  tabBtnRegister?.addEventListener('click', () => switchAuthTab('register'));
  switchToRegister?.addEventListener('click', (e) => {
    e.preventDefault();
    switchAuthTab('register');
  });
  switchToLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    switchAuthTab('login');
  });

  // Nút ẩn / hiện mật khẩu
  modal?.querySelectorAll('.auth-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? '🙈' : '👁';
      }
    });
  });

  // Xử lý đăng nhập tài khoản Thành viên / Quản trị
  const adminForm = document.getElementById('admin-login-form');
  const adminError = document.getElementById('admin-login-error');
  const adminSubmitBtn = document.getElementById('admin-login-submit');

  adminForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('admin-login-username');
    const passwordInput = document.getElementById('admin-login-password');
    const username = usernameInput?.value.trim();
    const password = passwordInput?.value;

    if (!username || !password) return;

    if (adminError) adminError.style.display = 'none';
    if (adminSubmitBtn) {
      adminSubmitBtn.disabled = true;
      adminSubmitBtn.textContent = 'Đang đăng nhập...';
    }

    try {
      const res = await AniDokiAPI.loginWithCredentials(username, password);
      if (res.success && res.user) {
        await handleLoginSuccess(res.user);
        if (adminForm) adminForm.reset();
      } else {
        if (adminError) {
          adminError.textContent = res.message || 'Tài khoản hoặc mật khẩu không chính xác.';
          adminError.style.display = 'block';
        } else {
          showToast(res.message || 'Đăng nhập thất bại');
        }
      }
    } catch {
      if (adminError) {
        adminError.textContent = 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.';
        adminError.style.display = 'block';
      }
    } finally {
      if (adminSubmitBtn) {
        adminSubmitBtn.disabled = false;
        adminSubmitBtn.textContent = 'Đăng nhập';
      }
    }
  });

  // Xử lý tạo tài khoản mới (Đăng ký)
  const registerForm = document.getElementById('auth-register-form');
  const registerError = document.getElementById('auth-register-error');
  const registerSubmitBtn = document.getElementById('auth-register-submit');

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-fullname')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const username = document.getElementById('reg-username')?.value.trim();
    const password = document.getElementById('reg-password')?.value;

    if (!name || !email || !username || !password) return;

    if (registerError) registerError.style.display = 'none';
    if (registerSubmitBtn) {
      registerSubmitBtn.disabled = true;
      registerSubmitBtn.textContent = 'Đang tạo tài khoản...';
    }

    try {
      const res = await AniDokiAPI.registerWithCredentials({ name, email, username, password });
      if (res.success && res.user) {
        if (registerForm) registerForm.reset();
        await handleLoginSuccess(res.user);
        showToast(`Đăng ký thành công! Chào mừng ${res.user.name}`);
      } else {
        if (registerError) {
          registerError.textContent = res.message || 'Đăng ký không thành công. Vui lòng thử lại.';
          registerError.style.display = 'block';
        } else {
          showToast(res.message || 'Đăng ký thất bại');
        }
      }
    } catch {
      if (registerError) {
        registerError.textContent = 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.';
        registerError.style.display = 'block';
      }
    } finally {
      if (registerSubmitBtn) {
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.textContent = 'Tạo tài khoản';
      }
    }
  });
}
