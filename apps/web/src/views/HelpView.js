import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { showToast } from '../utils/ui.js';

export function loadHelpView() {
  // Accordion toggle
  const faqList = document.getElementById('faq-list');
  if (faqList) {
    faqList.querySelectorAll('.faq-header').forEach(header => {
      header.setAttribute('aria-expanded', String(header.closest('.faq-item').classList.contains('open')));
      header.onclick = () => {
        const item = header.closest('.faq-item');
        if (item) {
          const isOpen = item.classList.contains('open');
          faqList.querySelectorAll('.faq-item').forEach(i => {
            i.classList.remove('open');
            i.querySelector('.faq-header')?.setAttribute('aria-expanded', 'false');
          });
          if (!isOpen) item.classList.add('open');
          header.setAttribute('aria-expanded', String(!isOpen));
        }
      };
    });
  }

  // Pre-fill user information if logged in
  const nameInput = document.getElementById('feedback-name');
  const emailInput = document.getElementById('feedback-email');
  if (state.user) {
    if (nameInput && !nameInput.value) nameInput.value = state.user.name || '';
    if (emailInput && !emailInput.value) emailInput.value = state.user.email || '';
  }

  // Form submit
  const form = document.getElementById('help-feedback-form');
  const submitBtn = document.getElementById('feedback-submit-btn');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const messageInput = document.getElementById('feedback-message');
      const subjectInput = document.getElementById('feedback-subject');

      const message = messageInput?.value?.trim();
      if (!message) {
        showToast('Nội dung phản hồi không được để trống');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';
      }

      const res = await AniDokiAPI.sendFeedback({
        name: nameInput?.value?.trim() || undefined,
        email: emailInput?.value?.trim() || undefined,
        subject: subjectInput?.value || 'Góp ý chung',
        message
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi Phản Hồi';
      }

      if (res.success) {
        showToast(res.message || 'Cảm ơn bạn đã gửi phản hồi!');
        if (messageInput) messageInput.value = '';
      } else {
        showToast(res.message || 'Lỗi gửi phản hồi');
      }
    };
  }
}
