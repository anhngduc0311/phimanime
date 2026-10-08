// SPA View Switcher, Confirmation Modal, and Toast Notification Helpers

export function switchView(viewId) {
  // Đóng detail và player modal nếu đang mở
  document.getElementById('detail-view')?.classList.remove('active');
  document.getElementById('player-modal')?.classList.remove('active');
  document.body.style.overflow = '';

  // Ẩn tất cả các view trang chính
  document.querySelectorAll('.app-view').forEach(view => {
    if (view.id === 'detail-view' || view.id === 'player-modal') return;
    view.style.display = 'none';
    view.classList.remove('active');
  });

  const target = document.getElementById(viewId);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
  }
}

export function showConfirmModal({ title, message, onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const okBtn = document.getElementById('confirm-ok-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  if (titleEl) titleEl.textContent = title || 'Xác nhận';
  if (msgEl) msgEl.textContent = message || '';

  const cleanup = () => {
    modal?.classList.remove('active');
    if (okBtn) okBtn.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;
  };

  if (okBtn) {
    okBtn.onclick = () => {
      cleanup();
      if (onConfirm) onConfirm();
    };
  }

  if (cancelBtn) cancelBtn.onclick = cleanup;
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) cleanup();
    };
    modal.classList.add('active');
  }
}

export function showToast(message) {
  const toast = document.getElementById('toast-msg');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

