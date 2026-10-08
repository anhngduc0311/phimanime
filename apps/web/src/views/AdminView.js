import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { switchView, showToast, showConfirmModal } from '../utils/ui.js';
import { router } from '../router.js';
import { updateUserUI } from '../components/AuthModal.js';
import { POSTER_PLACEHOLDER } from '../utils/assets.js';

// ==========================================
let currentAdminTab = 'dashboard';
let currentAdminAnimePage = 1;
let currentAdminEpisodeSlug = '';
let currentAdminReportFilter = { status: 'all', issue_type: '' };

export async function loadAdminView(subTab = 'dashboard', param = null) {
  switchView('view-admin');

  const isAdmin = state.user && state.user.role === 'admin';
  const unauthView = document.getElementById('admin-unauth-view');
  const workspaceView = document.getElementById('admin-workspace');

  if (!isAdmin) {
    if (unauthView) unauthView.style.display = 'block';
    if (workspaceView) workspaceView.style.display = 'none';
    document.title = 'Yêu Cầu Quyền Quản Trị | anidoki';
    return;
  }

  if (unauthView) unauthView.style.display = 'none';
  if (workspaceView) workspaceView.style.display = 'block';

  const userTag = document.getElementById('admin-user-tag');
  if (userTag) userTag.textContent = state.user.email || state.user.name || 'Admin';

  currentAdminTab = subTab;

  // Cập nhật tab sidebar
  document.querySelectorAll('#admin-nav-group .admin-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-admin-tab') === subTab);
  });

  // Cập nhật breadcrumbs & tiêu đề trang
  const sectionTitles = {
    dashboard: 'Bảng Tổng Quan',
    anime: 'Quản Lý Anime',
    episodes: `Quản Lý Tập Phim (${param || ''})`,
    homepage: 'Cấu Hình Trang Chủ',
    sync: 'Đồng Bộ Dữ Liệu',
    reports: 'Báo Cáo Sự Cố',
    feedback: 'Phản Hồi & Góp Ý',
    users: 'Người Dùng & Phân Quyền',
    'audit-logs': 'Nhật Ký Kiểm Toán',
    settings: 'Cài Đặt Hệ Thống'
  };
  const title = sectionTitles[subTab] || 'Quản Trị';
  const breadcrumbEl = document.getElementById('admin-current-section-title');
  if (breadcrumbEl) breadcrumbEl.textContent = title;
  document.title = `${title} - Admin | anidoki`;

  // Ẩn tất cả panel, hiển thị panel mục tiêu
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.style.display = 'none';
    panel.classList.remove('active');
  });

  const targetPanel = document.getElementById(`admin-panel-${subTab}`);
  if (targetPanel) {
    targetPanel.style.display = 'block';
    targetPanel.classList.add('active');
  }

  // Tải dữ liệu tương ứng
  if (subTab === 'dashboard') {
    await loadAdminDashboard();
  } else if (subTab === 'anime') {
    await loadAdminAnimeList(currentAdminAnimePage);
  } else if (subTab === 'episodes') {
    if (param) await loadAdminEpisodes(param);
  } else if (subTab === 'homepage') {
    await loadAdminHomepage();
  } else if (subTab === 'sync') {
    await loadAdminSync();
  } else if (subTab === 'reports') {
    await loadAdminReports();
  } else if (subTab === 'feedback') {
    await loadAdminFeedback();
  } else if (subTab === 'users') {
    await loadAdminUsers();
  } else if (subTab === 'audit-logs') {
    await loadAdminAuditLogs();
  } else if (subTab === 'settings') {
    await loadAdminSettings();
  }
}

async function loadAdminDashboard() {
  const res = await AniDokiAPI.getAdminDashboard();
  if (!res.success) {
    showToast(res.message || 'Lỗi tải dữ liệu tổng quan admin');
    return;
  }

  const { stats, lastSync } = res;
  if (stats) {
    const totalAnimeEl = document.getElementById('stat-total-anime');
    const overridesEl = document.getElementById('stat-total-overrides');
    const hiddenEl = document.getElementById('stat-hidden-anime');
    const reportsEl = document.getElementById('stat-pending-reports');
    const usersEl = document.getElementById('stat-total-users');
    const badgeEl = document.getElementById('admin-pending-reports-badge');

    if (totalAnimeEl) totalAnimeEl.textContent = stats.totalAnime?.toLocaleString('vi-VN') || '0';
    if (overridesEl) overridesEl.textContent = stats.overridesCount?.toLocaleString('vi-VN') || '0';
    if (hiddenEl) hiddenEl.textContent = stats.hiddenAnimeCount?.toLocaleString('vi-VN') || '0';
    if (reportsEl) reportsEl.textContent = stats.pendingReportsCount?.toLocaleString('vi-VN') || '0';
    if (usersEl) usersEl.textContent = stats.totalUsers?.toLocaleString('vi-VN') || '0';

    if (badgeEl) {
      if (stats.pendingReportsCount > 0) {
        badgeEl.textContent = stats.pendingReportsCount;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }
  }

  const lastSyncStatusEl = document.getElementById('stat-last-sync-status');
  const lastSyncTimeEl = document.getElementById('stat-last-sync-time');
  if (lastSync) {
    if (lastSyncStatusEl) {
      const statusMap = { success: 'THÀNH CÔNG', failed: 'THẤT BẠI', running: 'ĐANG CHẠY' };
      lastSyncStatusEl.textContent = statusMap[lastSync.status] || lastSync.status.toUpperCase();
      lastSyncStatusEl.style.color = lastSync.status === 'success' ? '#2ecc71' : (lastSync.status === 'failed' ? '#ff334b' : '#ff9800');
    }
    if (lastSyncTimeEl) {
      lastSyncTimeEl.textContent = new Date(lastSync.started_at).toLocaleString('vi-VN');
    }
  } else {
    if (lastSyncStatusEl) lastSyncStatusEl.textContent = 'CHƯA CÓ';
    if (lastSyncTimeEl) lastSyncTimeEl.textContent = 'Chưa có tác vụ đồng bộ nào';
  }
}

async function loadAdminAnimeList(page = 1) {
  currentAdminAnimePage = page;
  const tbody = document.getElementById('admin-anime-tbody');
  const searchInput = document.getElementById('admin-anime-search');
  const visibilitySelect = document.getElementById('admin-anime-visibility-filter');
  const pageInfo = document.getElementById('admin-anime-count-info');
  const prevBtn = document.getElementById('admin-anime-prev-btn');
  const nextBtn = document.getElementById('admin-anime-next-btn');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải danh sách phim...</td></tr>`;
  }

  const params = {
    page,
    limit: 12,
    search: searchInput?.value.trim() || '',
    visibility: visibilitySelect?.value || 'all'
  };

  const res = await AniDokiAPI.getAdminAnime(params);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách anime'}</td></tr>`;
    return;
  }

  const { items, pagination } = res;
  if (!items || items.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Không tìm thấy anime nào phù hợp.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Không có kết quả';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  if (pageInfo) {
    pageInfo.textContent = `Trang ${pagination.page} / ${pagination.totalPages || 1} (Tổng: ${pagination.total} phim)`;
  }
  if (prevBtn) prevBtn.disabled = pagination.page <= 1;
  if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;

  if (tbody) {
    tbody.innerHTML = '';
    items.forEach(anime => {
      const tr = document.createElement('tr');
      const isHidden = Boolean(anime.is_hidden);
      const titleVi = anime.title?.vietnamese ? `<span style="font-weight: 500;">${anime.title.vietnamese}</span>` : `<span style="color: var(--text-muted);">—</span>`;
      const titleEn = anime.title?.english || anime.name || anime.id;
      const statusText = anime.status === 'completed' ? 'Trọn bộ' : 'Đang phát sóng';

      tr.innerHTML = `
        <td>
          <img class="admin-table-thumb" src="${anime.coverImage || POSTER_PLACEHOLDER}" alt="${titleEn}" onerror="this.onerror=null;this.src='${POSTER_PLACEHOLDER}'">
        </td>
        <td>
          <div style="font-weight: 600; font-size: 13.5px; color: var(--text-primary);">${titleEn}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${anime.id}</div>
        </td>
        <td>${titleVi}</td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${statusText}</span></td>
        <td>
          ${isHidden
            ? `<span class="badge-status-hidden">Đang ẩn</span>`
            : `<span class="badge-status-visible">Hiển thị</span>`}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button type="button" class="table-btn btn-edit-anime" title="Chỉnh sửa thông tin phim">✏️ Sửa</button>
            <a href="/admin/anime/${encodeURIComponent(anime.id)}/episodes" class="table-btn" title="Quản lý tập phim">🎞️ Tập</a>
            <button type="button" class="table-btn ${isHidden ? 'table-btn-success' : 'table-btn-danger'} btn-toggle-vis" title="${isHidden ? 'Mở lại phim' : 'Ẩn phim khỏi trang người dùng'}">
              ${isHidden ? '👁️ Mở lại' : '🚫 Ẩn'}
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit-anime')?.addEventListener('click', () => {
        openAdminAnimeEditModal(anime.id);
      });

      tr.querySelector('.btn-toggle-vis')?.addEventListener('click', async () => {
        const nextHidden = !isHidden;
        const confirmMsg = nextHidden
          ? `Bạn có chắc muốn ẨN bộ phim "${titleEn}" khỏi toàn bộ giao diện người xem?`
          : `Bạn có chắc muốn MỞ LẠI bộ phim "${titleEn}" cho người xem truy cập?`;

        showConfirmModal({
          title: nextHidden ? 'Xác nhận ẩn phim' : 'Xác nhận mở lại phim',
          message: confirmMsg,
          onConfirm: async () => {
            const toggleRes = await AniDokiAPI.toggleAdminAnimeVisibility(anime.id, nextHidden);
            if (toggleRes.success) {
              showToast(toggleRes.message || 'Cập nhật trạng thái thành công');
              await loadAdminAnimeList(currentAdminAnimePage);
            } else {
              showToast(toggleRes.message || 'Lỗi cập nhật trạng thái');
            }
          }
        });
      });

      tbody.appendChild(tr);
    });
  }
}

async function openAdminAnimeEditModal(animeId) {
  const modal = document.getElementById('admin-anime-edit-modal');
  if (!modal) return;

  const idInput = document.getElementById('admin-edit-anime-id');
  const titleViInput = document.getElementById('admin-edit-title-vi');
  const titleEnInput = document.getElementById('admin-edit-title-en');
  const descInput = document.getElementById('admin-edit-desc');
  const posterInput = document.getElementById('admin-edit-poster');
  const bannerInput = document.getElementById('admin-edit-banner');
  const genresInput = document.getElementById('admin-edit-genres');
  const statusSelect = document.getElementById('admin-edit-status');
  const notesInput = document.getElementById('admin-edit-notes');
  const hiddenCheckbox = document.getElementById('admin-edit-hidden');

  // Reset values
  if (idInput) idInput.value = animeId;
  if (titleViInput) titleViInput.value = 'Đang tải...';

  modal.classList.add('active');

  const res = await AniDokiAPI.getAdminAnimeDetail(animeId);
  if (!res.success) {
    showToast(res.message || 'Lỗi tải chi tiết anime');
    modal.classList.remove('active');
    return;
  }

  const { anime, override } = res;
  if (idInput) idInput.value = anime.id;
  if (titleViInput) titleViInput.value = override?.title_vietnamese || anime.title?.vietnamese || '';
  if (titleEnInput) titleEnInput.value = override?.title_english || anime.title?.english || anime.name || '';
  if (descInput) descInput.value = override?.description || anime.description || '';
  if (posterInput) posterInput.value = override?.cover_image || anime.coverImage || '';
  if (bannerInput) bannerInput.value = override?.banner_image || anime.bannerImage || '';
  if (genresInput) {
    const genres = override?.genres || anime.genres || [];
    genresInput.value = Array.isArray(genres) ? genres.join(', ') : genres;
  }
  if (statusSelect) statusSelect.value = override?.status || anime.status || '';
  if (notesInput) notesInput.value = override?.notes || '';
  if (hiddenCheckbox) hiddenCheckbox.checked = Boolean(override?.is_hidden);
}

async function loadAdminEpisodes(animeSlug) {
  currentAdminEpisodeSlug = animeSlug;
  const tbody = document.getElementById('admin-episodes-tbody');
  const titleEl = document.getElementById('admin-episodes-anime-title');
  const subEl = document.getElementById('admin-episodes-anime-sub');

  if (titleEl) titleEl.textContent = `Quản lý Tập phim: ${animeSlug}`;
  if (subEl) subEl.textContent = `Kiểm tra nguồn phát, chỉnh sửa link nhúng hoặc ẩn tập phim hỏng cho "${animeSlug}".`;

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải danh sách tập...</td></tr>`;
  }

  const res = await AniDokiAPI.getAdminEpisodes(animeSlug);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách tập'}</td></tr>`;
    return;
  }

  const { anime, episodes } = res;
  if (anime && titleEl) {
    titleEl.textContent = `Quản lý Tập: ${anime.title?.english || anime.name || animeSlug}`;
  }

  if (!episodes || episodes.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Phim này chưa có danh sách tập nào.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    episodes.forEach(ep => {
      const tr = document.createElement('tr');
      const isHidden = Boolean(ep.is_hidden);
      const isOverridden = Boolean(ep.is_overridden);
      const embedUrl = ep.embedUrl || '';

      let healthBadge = `<span class="badge-health-unchecked">Chưa kiểm tra</span>`;
      if (ep.last_check_status === 'healthy') {
        healthBadge = `<span class="badge-health-ok">✓ Hoạt động</span>`;
      } else if (ep.last_check_status === 'broken') {
        healthBadge = `<span class="badge-health-broken">⚠️ Lỗi link</span>`;
      }

      tr.innerHTML = `
        <td><strong style="color: var(--text-primary); font-size: 13.5px;">Tập ${ep.episodeNumber}</strong></td>
        <td>${ep.title || 'Tập ' + ep.episodeNumber}</td>
        <td>
          <div style="font-size: 11.5px; font-family: monospace; color: ${isOverridden ? '#f4d07a' : 'var(--text-muted)'}; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${isOverridden ? '⚡ (Custom) ' : ''}${embedUrl || '—'}
          </div>
        </td>
        <td class="col-health-status">${healthBadge}</td>
        <td>
          ${isHidden
            ? `<span class="badge-status-hidden">Đang ẩn</span>`
            : `<span class="badge-status-visible">Hiển thị</span>`}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button type="button" class="table-btn btn-check-ep" title="Kiểm tra trực tiếp kết nối nguồn">🔍 Check</button>
            <button type="button" class="table-btn btn-edit-ep" title="Sửa link embed hoặc ghi chú">✏️ Sửa</button>
            <button type="button" class="table-btn ${isHidden ? 'table-btn-success' : 'table-btn-danger'} btn-toggle-ep-vis" title="${isHidden ? 'Bật lại tập này' : 'Ẩn tập này'}">
              ${isHidden ? '👁️ Hiện' : '🚫 Ẩn'}
            </button>
          </div>
        </td>
      `;

      // Check button
      tr.querySelector('.btn-check-ep')?.addEventListener('click', async () => {
        const healthCol = tr.querySelector('.col-health-status');
        if (healthCol) healthCol.innerHTML = `<span style="font-size: 11px; color: var(--text-muted);">Đang check...</span>`;
        const checkRes = await AniDokiAPI.checkAdminEpisode(animeSlug, ep.episodeNumber, embedUrl);
        if (checkRes.success) {
          if (healthCol) {
            healthCol.innerHTML = checkRes.status === 'healthy'
              ? `<span class="badge-health-ok">✓ Hoạt động (${checkRes.httpStatus || 200})</span>`
              : `<span class="badge-health-broken">⚠️ Lỗi (${checkRes.httpStatus || 'N/A'})</span>`;
          }
          showToast(`Tập ${ep.episodeNumber}: ${checkRes.status === 'healthy' ? 'Nguồn hoạt động tốt' : 'Nguồn phản hồi lỗi'}`);
        } else {
          if (healthCol) healthCol.innerHTML = `<span class="badge-health-broken">⚠️ Lỗi check</span>`;
          showToast(checkRes.message || 'Lỗi kiểm tra nguồn phát');
        }
      });

      // Edit button
      tr.querySelector('.btn-edit-ep')?.addEventListener('click', () => {
        openAdminEpisodeEditModal(animeSlug, ep);
      });

      // Toggle visibility
      tr.querySelector('.btn-toggle-ep-vis')?.addEventListener('click', async () => {
        const nextHidden = !isHidden;
        const updateRes = await AniDokiAPI.updateAdminEpisode(animeSlug, ep.episodeNumber, { is_hidden: nextHidden });
        if (updateRes.success) {
          showToast(`Tập ${ep.episodeNumber}: Đã ${nextHidden ? 'ẩn' : 'mở lại'}`);
          await loadAdminEpisodes(animeSlug);
        } else {
          showToast(updateRes.message || 'Lỗi cập nhật tập phim');
        }
      });

      tbody.appendChild(tr);
    });
  }
}

function openAdminEpisodeEditModal(animeSlug, ep) {
  const modal = document.getElementById('admin-ep-edit-modal');
  if (!modal) return;

  const animeIdInput = document.getElementById('admin-ep-edit-anime-id');
  const epNumInput = document.getElementById('admin-ep-edit-num');
  const subtitleEl = document.getElementById('admin-ep-modal-subtitle');
  const embedInput = document.getElementById('admin-ep-edit-embed');
  const notesInput = document.getElementById('admin-ep-edit-notes');
  const hiddenCheckbox = document.getElementById('admin-ep-edit-hidden');
  const checkResultDiv = document.getElementById('admin-ep-check-result');

  if (animeIdInput) animeIdInput.value = animeSlug;
  if (epNumInput) epNumInput.value = ep.episodeNumber;
  if (subtitleEl) subtitleEl.textContent = `Tập ${ep.episodeNumber} · ${animeSlug}`;
  if (embedInput) embedInput.value = ep.embedUrl || '';
  if (notesInput) notesInput.value = ep.notes || '';
  if (hiddenCheckbox) hiddenCheckbox.checked = Boolean(ep.is_hidden);
  if (checkResultDiv) {
    checkResultDiv.style.display = 'none';
    checkResultDiv.textContent = '';
  }

  modal.classList.add('active');
}

async function loadAdminSync() {
  const tbody = document.getElementById('admin-sync-logs-tbody');
  const runningBanner = document.getElementById('admin-sync-running-banner');
  const singleBtn = document.getElementById('admin-sync-single-btn');
  const recentBtn = document.getElementById('admin-sync-recent-btn');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Đang tải nhật ký...</td></tr>`;
  }

  const res = await AniDokiAPI.getAdminSyncLogs(20);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #ff5252;">${res.message || 'Lỗi tải nhật ký đồng bộ'}</td></tr>`;
    return;
  }

  const logs = res.logs || [];
  const hasRunning = logs.some(l => l.status === 'running');
  if (runningBanner) runningBanner.style.display = hasRunning ? 'flex' : 'none';
  if (singleBtn) singleBtn.disabled = hasRunning;
  if (recentBtn) recentBtn.disabled = hasRunning;

  if (logs.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Chưa có nhật ký đồng bộ nào trong hệ thống.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      const isRunning = log.status === 'running';
      const statusHtml = isRunning
        ? `<span class="badge-report-in_progress">⏳ Đang chạy</span>`
        : (log.status === 'success'
          ? `<span class="badge-report-resolved">✓ Thành công</span>`
          : `<span class="badge-report-dismissed" style="background: rgba(255,51,75,0.15); color: #ff5c72;">⚠️ Thất bại</span>`);

      let durationStr = '—';
      if (log.started_at && log.finished_at) {
        const ms = new Date(log.finished_at).getTime() - new Date(log.started_at).getTime();
        durationStr = `${(ms / 1000).toFixed(1)}s`;
      } else if (isRunning) {
        durationStr = 'Đang tiến hành...';
      }

      const startedStr = log.started_at ? new Date(log.started_at).toLocaleString('vi-VN') : '—';
      const detailStr = log.error_message
        ? `<span style="color: #ff5c72;">${log.error_message}</span>`
        : (log.details ? `<span style="font-size: 11px; font-family: monospace;">${typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}</span>` : '—');

      tr.innerHTML = `
        <td><strong style="color: var(--text-primary);">${log.sync_type === 'single' ? 'Anime đơn lẻ' : 'Catalog mới'}</strong></td>
        <td><code>${log.target_slug || 'catalog'}</code></td>
        <td>${statusHtml}</td>
        <td>${log.items_synced || 0}</td>
        <td>${durationStr}</td>
        <td>${startedStr}</td>
        <td>${detailStr}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

async function loadAdminReports() {
  const tbody = document.getElementById('admin-reports-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải phản ánh...</td></tr>`;
  }

  const res = await AniDokiAPI.getAdminReports(currentAdminReportFilter);
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách phản ánh'}</td></tr>`;
    return;
  }

  const reports = res.reports || [];
  if (reports.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Không có báo cáo sự cố nào theo bộ lọc này.</td></tr>`;
    return;
  }

  const typeLabels = {
    video_error: 'Lỗi video / Link hỏng',
    audio_error: 'Lỗi âm thanh',
    subtitle_error: 'Lỗi phụ đề',
    buffering: 'Giật lag / Buffer',
    other: 'Khác'
  };

  if (tbody) {
    tbody.innerHTML = '';
    reports.forEach(rep => {
      const tr = document.createElement('tr');
      const statusBadge = `<span class="badge-report-${rep.status}">${rep.status}</span>`;
      const createdStr = rep.created_at ? new Date(rep.created_at).toLocaleString('vi-VN') : '—';

      tr.innerHTML = `
        <td>
          <strong style="color: var(--text-primary);">${rep.anime_title || rep.anime_id}</strong>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${rep.anime_id}</div>
        </td>
        <td>Tập ${rep.episode_number}</td>
        <td><span style="font-size: 12px; font-weight: 500;">${typeLabels[rep.issue_type] || rep.issue_type}</span></td>
        <td>
          <div style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-size: 12.5px;">
            ${rep.description ? `"${rep.description}"` : '<span style="color: var(--text-muted);">Không có mô tả</span>'}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${createdStr}</span></td>
        <td style="text-align: right;">
          <button type="button" class="table-btn table-btn-primary btn-process-report">🛠️ Xử lý</button>
        </td>
      `;

      tr.querySelector('.btn-process-report')?.addEventListener('click', () => {
        openAdminReportProcessModal(rep);
      });

      tbody.appendChild(tr);
    });
  }
}

function openAdminReportProcessModal(rep) {
  const modal = document.getElementById('admin-report-process-modal');
  if (!modal) return;

  const idInput = document.getElementById('admin-report-process-id');
  const subEl = document.getElementById('admin-report-modal-sub');
  const animeEl = document.getElementById('admin-report-detail-anime');
  const typeEl = document.getElementById('admin-report-detail-type');
  const epEl = document.getElementById('admin-report-detail-ep');
  const descEl = document.getElementById('admin-report-detail-desc');
  const statusSelect = document.getElementById('admin-report-process-status');
  const notesText = document.getElementById('admin-report-process-notes');

  const typeLabels = {
    video_error: 'Lỗi video',
    audio_error: 'Lỗi âm thanh',
    subtitle_error: 'Lỗi phụ đề',
    buffering: 'Giật lag',
    other: 'Khác'
  };

  if (idInput) idInput.value = rep.id;
  if (subEl) subEl.textContent = `Báo lỗi #${rep.id} · ${new Date(rep.created_at).toLocaleString('vi-VN')}`;
  if (animeEl) animeEl.textContent = rep.anime_title || rep.anime_id;
  if (typeEl) typeEl.textContent = typeLabels[rep.issue_type] || rep.issue_type;
  if (epEl) epEl.textContent = `Tập ${rep.episode_number} · Người gửi: ${rep.user_id ? 'User' : 'Khách'}${rep.reporter_ip ? ` (${rep.reporter_ip})` : ''}`;
  if (descEl) descEl.textContent = rep.description ? `"${rep.description}"` : 'Người dùng không để lại mô tả bổ sung.';
  if (statusSelect) statusSelect.value = rep.status || 'pending';
  if (notesText) notesText.value = rep.admin_notes || '';

  modal.classList.add('active');
}

// ==========================================
// 6. USERS MANAGEMENT (ENHANCED PHASE 4)
// ==========================================
let currentAdminUserStatus = 'all';
let currentAdminUserSearch = '';

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải danh sách tài khoản...</td></tr>`;
  }

  const res = await AniDokiAPI.getAdminUsers({
    q: currentAdminUserSearch,
    status: currentAdminUserStatus === 'all' ? '' : currentAdminUserStatus
  });

  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải danh sách người dùng'}</td></tr>`;
    return;
  }

  const users = res.users || [];
  if (users.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Không tìm thấy người dùng nào phù hợp.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=e50914&color=fff&bold=true`;
      const avatarSrc = u.avatar || fallbackAvatar;
      const isAdmin = u.role === 'admin';
      const isSelf = state.user && state.user.id === u.id;
      const createdStr = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—';

      tr.innerHTML = `
        <td>
          <img src="${avatarSrc}" alt="${u.name || 'Avatar'}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; display: block;" onerror="this.src='${fallbackAvatar}'">
        </td>
        <td><strong style="color: var(--text-primary);">${u.name || '—'}</strong></td>
        <td><span style="font-size: 12.5px; color: var(--text-muted);">${u.email || '—'}</span></td>
        <td>
          ${isAdmin
            ? `<span class="badge-role" style="font-size: 11px;">Admin</span>`
            : `<span style="font-size: 12px; color: var(--text-muted);">Người dùng</span>`}
        </td>
        <td>
          ${u.is_banned
            ? `<span class="badge-user-banned" title="${u.ban_reason ? 'Lý do: ' + u.ban_reason : 'Đã bị khóa'}">Bị khóa</span>`
            : `<span class="badge-user-active">Hoạt động</span>`}
        </td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${createdStr}</span></td>
        <td style="text-align: right;">
          ${isSelf
            ? `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">(Tài khoản của bạn)</span>`
            : `<div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button type="button" class="table-btn ${isAdmin ? 'table-btn-danger' : 'table-btn-primary'} btn-change-role">
                  ${isAdmin ? 'Hạ User' : 'Lên Admin'}
                </button>
                ${u.is_banned
                  ? `<button type="button" class="table-btn table-btn-primary btn-unban-user" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71;">Mở khóa</button>`
                  : `<button type="button" class="table-btn table-btn-danger btn-ban-user">Khóa</button>`}
              </div>`}
        </td>
      `;

      tr.querySelector('.btn-change-role')?.addEventListener('click', () => {
        const targetRole = isAdmin ? 'user' : 'admin';
        const actionText = isAdmin ? 'hạ quyền xuống Người dùng (User)' : 'nâng quyền lên Quản trị viên (Admin)';

        showConfirmModal({
          title: 'Xác nhận thay đổi vai trò',
          message: `Bạn có chắc muốn ${actionText} cho tài khoản "${u.name || u.email}"?`,
          onConfirm: async () => {
            const updateRes = await AniDokiAPI.updateAdminUserRole(u.id, targetRole);
            if (updateRes.success) {
              showToast(updateRes.message || 'Cập nhật quyền thành công');
              await loadAdminUsers();
            } else {
              showToast(updateRes.message || 'Lỗi cập nhật quyền');
            }
          }
        });
      });

      tr.querySelector('.btn-unban-user')?.addEventListener('click', () => {
        showConfirmModal({
          title: 'Mở khóa tài khoản',
          message: `Bạn có chắc muốn mở khóa cho tài khoản "${u.name || u.email}"?`,
          onConfirm: async () => {
            const banRes = await AniDokiAPI.banAdminUser(u.id, { is_banned: false });
            if (banRes.success) {
              showToast(banRes.message || 'Đã mở khóa tài khoản');
              await loadAdminUsers();
            } else {
              showToast(banRes.message || 'Lỗi mở khóa');
            }
          }
        });
      });

      tr.querySelector('.btn-ban-user')?.addEventListener('click', () => {
        openBanUserModal(u);
      });

      tbody.appendChild(tr);
    });
  }
}

function openBanUserModal(user) {
  const modal = document.getElementById('admin-user-ban-modal');
  const userIdInput = document.getElementById('admin-ban-user-id');
  const userNameInput = document.getElementById('admin-ban-user-name');
  const reasonInput = document.getElementById('admin-ban-reason-input');

  if (userIdInput) userIdInput.value = user.id;
  if (userNameInput) userNameInput.value = `${user.name || 'Người dùng'} (${user.email || user.id})`;
  if (reasonInput) reasonInput.value = '';

  modal?.classList.add('active');
}

// ==========================================
// 7. HOMEPAGE CONFIG PANEL (PHASE 4)
// ==========================================
async function loadAdminHomepage() {
  const spotlightInput = document.getElementById('admin-homepage-spotlight-input');
  const sectionsList = document.getElementById('admin-homepage-sections-list');

  const res = await AniDokiAPI.getAdminHomepageConfig();
  if (!res.success) {
    showToast(res.message || 'Lỗi tải cấu hình trang chủ');
    return;
  }

  const { spotlight_slugs = [], sections_config = [] } = res.data || {};

  if (spotlightInput) {
    spotlightInput.value = spotlight_slugs.join(', ');
  }

  if (sectionsList) {
    sectionsList.innerHTML = '';
    const defaultSections = [
      { id: 'latest', title: 'Mới Cập Nhật', enabled: true, order: 1 },
      { id: 'trending', title: 'Xu Hướng & Nổi Bật', enabled: true, order: 2 },
      { id: 'seasonal', title: 'Anime Theo Mùa', enabled: true, order: 3 },
      { id: 'single', title: 'Anime Lẻ Đặc Sắc', enabled: true, order: 4 },
      { id: 'series', title: 'Anime Bộ Nổi Bật', enabled: true, order: 5 }
    ];

    const currentSections = sections_config.length ? sections_config : defaultSections;
    currentSections.sort((a, b) => (a.order || 0) - (b.order || 0));

    currentSections.forEach((sec, idx) => {
      const item = document.createElement('div');
      item.className = 'admin-section-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-weight: 700; color: var(--text-muted); font-size: 13px; width: 24px;">#${idx + 1}</span>
          <input type="number" class="sec-order-input" value="${sec.order || idx + 1}" min="1" max="20" style="width: 50px; padding: 4px 6px; background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: 6px; color: var(--text-primary); font-size: 12px; text-align: center;">
          <strong style="color: var(--text-primary); font-size: 13.5px;">${sec.title || sec.id}</strong>
          <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">(${sec.id})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">Hiển thị:</span>
          <label class="switch-toggle">
            <input type="checkbox" class="sec-enable-chk" ${sec.enabled !== false ? 'checked' : ''} data-sec-id="${sec.id}" data-sec-title="${sec.title || sec.id}">
            <span class="slider-round"></span>
          </label>
        </div>
      `;
      sectionsList.appendChild(item);
    });
  }

  // Nút Lưu cấu hình
  const saveBtn = document.getElementById('admin-save-homepage-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';

      const slugs = (spotlightInput?.value || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const items = sectionsList ? Array.from(sectionsList.querySelectorAll('.admin-section-item')) : [];
      const newSections = items.map((item, idx) => {
        const orderInput = item.querySelector('.sec-order-input');
        const chk = item.querySelector('.sec-enable-chk');
        return {
          id: chk?.getAttribute('data-sec-id') || `sec_${idx}`,
          title: chk?.getAttribute('data-sec-title') || 'Danh mục',
          enabled: Boolean(chk?.checked),
          order: parseInt(orderInput?.value, 10) || idx + 1
        };
      });

      const updateRes = await AniDokiAPI.updateAdminHomepageConfig({
        spotlight_slugs: slugs,
        sections_config: newSections
      });

      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu cấu hình';

      if (updateRes.success) {
        showToast(updateRes.message || 'Đã lưu cấu hình trang chủ thành công');
      } else {
        showToast(updateRes.message || 'Lỗi lưu cấu hình');
      }
    };
  }
}

// ==========================================
// 8. FEEDBACK MANAGEMENT PANEL (PHASE 4)
// ==========================================
let currentFeedbackStatus = 'all';

async function loadAdminFeedback(status = currentFeedbackStatus) {
  currentFeedbackStatus = status;
  const tbody = document.getElementById('admin-feedback-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải phản hồi...</td></tr>`;
  }

  const res = await AniDokiAPI.getAdminFeedback({ status: status === 'all' ? '' : status });
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải phản hồi'}</td></tr>`;
    return;
  }

  const feedbackList = res.feedback || [];
  if (!feedbackList.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Không có phản hồi nào trong mục này.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    feedbackList.forEach(fb => {
      const tr = document.createElement('tr');
      const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleString('vi-VN') : '—';
      let statusBadge = '<span class="badge-role" style="font-size: 11px;">Chờ xem</span>';
      if (fb.status === 'reviewed') statusBadge = '<span class="badge-report-in_progress">Đã đọc</span>';
      if (fb.status === 'resolved') statusBadge = '<span class="badge-report-resolved">Đã xử lý</span>';

      tr.innerHTML = `
        <td><strong style="color: var(--text-primary);">${fb.name || 'Khách'}</strong></td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${fb.email || '—'}</span></td>
        <td><span style="font-size: 12.5px; color: var(--text-primary);">${fb.subject || 'Góp ý'}</span></td>
        <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fb.message || ''}">
          <span style="font-size: 12.5px; color: var(--text-muted);">${fb.message || ''}</span>
        </td>
        <td>${statusBadge}</td>
        <td><span style="font-size: 11.5px; color: var(--text-muted);">${dateStr}</span></td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            ${fb.status === 'pending'
              ? `<button type="button" class="table-btn table-btn-primary btn-mark-reviewed" title="Đánh dấu đã đọc">Đã đọc</button>`
              : ''}
            ${fb.status !== 'resolved'
              ? `<button type="button" class="table-btn table-btn-primary btn-mark-resolved" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71;" title="Đánh dấu đã giải quyết/xử lý">Xử lý</button>`
              : '<span style="font-size: 11px; color: #2ecc71;">✓ Xong</span>'}
          </div>
        </td>
      `;

      tr.querySelector('.btn-mark-reviewed')?.addEventListener('click', async () => {
        const uRes = await AniDokiAPI.updateAdminFeedback(fb.id, { status: 'reviewed' });
        if (uRes.success) {
          showToast('Đã đánh dấu là đã đọc');
          await loadAdminFeedback(currentFeedbackStatus);
        } else {
          showToast(uRes.message || 'Lỗi cập nhật');
        }
      });

      tr.querySelector('.btn-mark-resolved')?.addEventListener('click', async () => {
        const uRes = await AniDokiAPI.updateAdminFeedback(fb.id, { status: 'resolved' });
        if (uRes.success) {
          showToast('Đã đánh dấu là đã giải quyết');
          await loadAdminFeedback(currentFeedbackStatus);
        } else {
          showToast(uRes.message || 'Lỗi cập nhật');
        }
      });

      tbody.appendChild(tr);
    });
  }
}

// ==========================================
// 9. AUDIT LOGS PANEL (PHASE 4)
// ==========================================
let currentAuditPage = 1;

async function loadAdminAuditLogs(page = 1) {
  currentAuditPage = page;
  const tbody = document.getElementById('admin-audit-tbody');
  const searchInput = document.getElementById('admin-audit-search');
  const actionFilter = document.getElementById('admin-audit-action-filter');
  const paginationRow = document.getElementById('admin-audit-pagination');
  const pageInfo = document.getElementById('admin-audit-page-info');

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Đang tải nhật ký kiểm toán...</td></tr>`;
  }

  const q = searchInput?.value || '';
  const action = actionFilter?.value || '';

  const res = await AniDokiAPI.getAdminAuditLogs({ q, action, page, limit: 25 });
  if (!res.success) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #ff5252;">${res.message || 'Lỗi tải nhật ký'}</td></tr>`;
    return;
  }

  const logs = res.logs || [];
  if (!logs.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">Chưa có nhật ký nào được ghi lại.</td></tr>`;
    if (paginationRow) paginationRow.style.display = 'none';
    return;
  }

  if (tbody) {
    tbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '—';
      let actionClass = 'audit-badge-other';
      if (log.action.includes('CREATE') || log.action.includes('RESOLVE')) actionClass = 'audit-badge-create';
      else if (log.action.includes('UPDATE')) actionClass = 'audit-badge-update';
      else if (log.action.includes('BAN') || log.action.includes('DELETE')) actionClass = 'audit-badge-ban';

      let detailsStr = '';
      if (log.details) {
        try {
          const parsed = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
          detailsStr = JSON.stringify(parsed);
        } catch {
          detailsStr = String(log.details);
        }
      }

      tr.innerHTML = `
        <td><span style="font-size: 11.5px; color: var(--text-muted);">${dateStr}</span></td>
        <td>
          <strong style="color: var(--text-primary); font-size: 13px;">${log.admin_name || 'Admin'}</strong>
          ${log.admin_email ? `<div style="font-size: 11px; color: var(--text-muted);">${log.admin_email}</div>` : ''}
        </td>
        <td><span class="audit-badge ${actionClass}">${log.action}</span></td>
        <td>
          <span style="font-size: 12px; color: var(--text-primary);">${log.target_type || '—'}</span>
          ${log.target_id ? `<span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">#${log.target_id}</span>` : ''}
        </td>
        <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${detailsStr}">
          <code style="font-size: 11px; color: var(--text-muted);">${detailsStr}</code>
        </td>
        <td><span style="font-size: 11.5px; color: var(--text-muted); font-family: monospace;">${log.ip_address || '—'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (paginationRow && res.pagination) {
    paginationRow.style.display = 'flex';
    if (pageInfo) pageInfo.textContent = `Trang ${res.pagination.page} / ${res.pagination.totalPages} (${res.pagination.totalItems} nhật ký)`;
    const prevBtn = document.getElementById('admin-audit-prev-btn');
    const nextBtn = document.getElementById('admin-audit-next-btn');
    if (prevBtn) prevBtn.disabled = res.pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = res.pagination.page >= res.pagination.totalPages;
  }
}

// ==========================================
// 10. SYSTEM SETTINGS PANEL (PHASE 4)
// ==========================================
async function loadAdminSettings() {
  const nameInput = document.getElementById('admin-setting-sitename');
  const logoInput = document.getElementById('admin-setting-logo');
  const emailInput = document.getElementById('admin-setting-email');
  const announcementInput = document.getElementById('admin-setting-announcement');
  const maintenanceChk = document.getElementById('admin-setting-maintenance');
  const saveBtn = document.getElementById('admin-save-settings-btn');

  const res = await AniDokiAPI.getAdminSettings();
  if (res.success && res.settings) {
    const s = res.settings;
    if (nameInput) nameInput.value = s.site_name || '';
    if (logoInput) logoInput.value = s.site_logo || '';
    if (emailInput) emailInput.value = s.contact_email || '';
    if (announcementInput) announcementInput.value = s.site_announcement || '';
    if (maintenanceChk) maintenanceChk.checked = Boolean(s.maintenance_mode);
  }

  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';

      const payload = {
        site_name: nameInput?.value?.trim() || 'AniDoki',
        site_logo: logoInput?.value?.trim() || '',
        contact_email: emailInput?.value?.trim() || '',
        site_announcement: announcementInput?.value?.trim() || '',
        maintenance_mode: Boolean(maintenanceChk?.checked)
      };

      const updateRes = await AniDokiAPI.updateAdminSettings(payload);
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu cấu hình';

      if (updateRes.success) {
        showToast(updateRes.message || 'Đã lưu cài đặt hệ thống thành công');
      } else {
        showToast(updateRes.message || 'Lỗi lưu cài đặt');
      }
    };
  }
}



export function initAdminView() {
  // Navigation sidebar clicks
  document.querySelectorAll('#admin-nav-group .admin-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-admin-tab');
      if (tab) {
        router.navigate(`/admin/${tab}`);
      }
    });
  });

  // Open Admin button in user dropdown
  document.getElementById('open-admin-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.hidden = true;
    router.navigate('/admin/dashboard');
  });

  // Guard login button
  document.getElementById('admin-guard-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('active');
  });

  // Dashboard refresh
  document.getElementById('admin-dashboard-refresh-btn')?.addEventListener('click', loadAdminDashboard);

  // Anime Management filters
  const animeSearchInput = document.getElementById('admin-anime-search');
  const animeVisSelect = document.getElementById('admin-anime-visibility-filter');
  const animeResetBtn = document.getElementById('admin-anime-filter-reset');
  const animePrevBtn = document.getElementById('admin-anime-prev-btn');
  const animeNextBtn = document.getElementById('admin-anime-next-btn');

  let animeSearchTimeout;
  animeSearchInput?.addEventListener('input', () => {
    clearTimeout(animeSearchTimeout);
    animeSearchTimeout = setTimeout(() => {
      loadAdminAnimeList(1);
    }, 350);
  });

  animeVisSelect?.addEventListener('change', () => {
    loadAdminAnimeList(1);
  });

  animeResetBtn?.addEventListener('click', () => {
    if (animeSearchInput) animeSearchInput.value = '';
    if (animeVisSelect) animeVisSelect.value = 'all';
    loadAdminAnimeList(1);
  });

  animePrevBtn?.addEventListener('click', () => {
    if (currentAdminAnimePage > 1) {
      loadAdminAnimeList(currentAdminAnimePage - 1);
    }
  });

  animeNextBtn?.addEventListener('click', () => {
    loadAdminAnimeList(currentAdminAnimePage + 1);
  });

  // Anime Edit Modal Events
  const animeEditModal = document.getElementById('admin-anime-edit-modal');
  const closeAnimeEditBtn = document.getElementById('close-admin-anime-modal-btn');
  const cancelAnimeEditBtn = document.getElementById('admin-anime-edit-cancel');
  const animeEditForm = document.getElementById('admin-anime-edit-form');

  const closeAnimeModal = () => animeEditModal?.classList.remove('active');
  closeAnimeEditBtn?.addEventListener('click', closeAnimeModal);
  cancelAnimeEditBtn?.addEventListener('click', closeAnimeModal);
  animeEditModal?.addEventListener('click', (e) => {
    if (e.target === animeEditModal) closeAnimeModal();
  });

  animeEditForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const animeId = document.getElementById('admin-edit-anime-id')?.value;
    if (!animeId) return;

    const payload = {
      title_vietnamese: document.getElementById('admin-edit-title-vi')?.value.trim(),
      title_english: document.getElementById('admin-edit-title-en')?.value.trim(),
      description: document.getElementById('admin-edit-desc')?.value.trim(),
      cover_image: document.getElementById('admin-edit-poster')?.value.trim(),
      banner_image: document.getElementById('admin-edit-banner')?.value.trim(),
      genres: document.getElementById('admin-edit-genres')?.value.split(',').map(s => s.trim()).filter(Boolean),
      status: document.getElementById('admin-edit-status')?.value || undefined,
      notes: document.getElementById('admin-edit-notes')?.value.trim(),
      is_hidden: Boolean(document.getElementById('admin-edit-hidden')?.checked)
    };

    const saveBtn = document.getElementById('admin-anime-edit-save');
    if (saveBtn) saveBtn.textContent = 'Đang lưu...';

    const res = await AniDokiAPI.updateAdminAnime(animeId, payload);
    if (saveBtn) saveBtn.textContent = 'Lưu thay đổi';

    if (res.success) {
      showToast('Cập nhật thông tin anime thành công!');
      closeAnimeModal();
      await loadAdminAnimeList(currentAdminAnimePage);
    } else {
      showToast(res.message || 'Lỗi lưu thông tin anime');
    }
  });

  // Episode Edit Modal Events
  const epEditModal = document.getElementById('admin-ep-edit-modal');
  const closeEpEditBtn = document.getElementById('close-admin-ep-modal-btn');
  const cancelEpEditBtn = document.getElementById('admin-ep-edit-cancel');
  const epEditForm = document.getElementById('admin-ep-edit-form');
  const epTestLinkBtn = document.getElementById('admin-ep-test-link-btn');

  const closeEpModal = () => epEditModal?.classList.remove('active');
  closeEpEditBtn?.addEventListener('click', closeEpModal);
  cancelEpEditBtn?.addEventListener('click', closeEpModal);
  epEditModal?.addEventListener('click', (e) => {
    if (e.target === epEditModal) closeEpModal();
  });

  epTestLinkBtn?.addEventListener('click', async () => {
    const animeSlug = document.getElementById('admin-ep-edit-anime-id')?.value;
    const epNum = document.getElementById('admin-ep-edit-num')?.value;
    const embedUrl = document.getElementById('admin-ep-edit-embed')?.value.trim();
    const resultDiv = document.getElementById('admin-ep-check-result');

    if (!embedUrl) {
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.color = '#ff9800';
        resultDiv.textContent = 'Vui lòng nhập đường dẫn nhúng trước khi kiểm tra.';
      }
      return;
    }

    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.style.color = 'var(--text-muted)';
      resultDiv.textContent = 'Đang kiểm tra kết nối nguồn...';
    }

    const res = await AniDokiAPI.checkAdminEpisode(animeSlug, epNum, embedUrl);
    if (resultDiv) {
      if (res.status === 'healthy') {
        resultDiv.style.color = '#2ecc71';
        resultDiv.textContent = `✓ Nguồn phát hoạt động tốt (HTTP ${res.httpStatus || 200})`;
      } else {
        resultDiv.style.color = '#ff5c72';
        resultDiv.textContent = `⚠️ Link không phản hồi bình thường: ${res.message || 'Mã HTTP ' + (res.httpStatus || 'lỗi')}`;
      }
    }
  });

  epEditForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const animeSlug = document.getElementById('admin-ep-edit-anime-id')?.value;
    const epNum = document.getElementById('admin-ep-edit-num')?.value;
    if (!animeSlug || !epNum) return;

    const payload = {
      embed_url: document.getElementById('admin-ep-edit-embed')?.value.trim() || null,
      notes: document.getElementById('admin-ep-edit-notes')?.value.trim(),
      is_hidden: Boolean(document.getElementById('admin-ep-edit-hidden')?.checked)
    };

    const saveBtn = document.getElementById('admin-ep-edit-save');
    if (saveBtn) saveBtn.textContent = 'Đang lưu...';

    const res = await AniDokiAPI.updateAdminEpisode(animeSlug, epNum, payload);
    if (saveBtn) saveBtn.textContent = 'Lưu tập phim';

    if (res.success) {
      showToast(`Đã lưu cấu hình Tập ${epNum}!`);
      closeEpModal();
      await loadAdminEpisodes(animeSlug);
    } else {
      showToast(res.message || 'Lỗi lưu cấu hình tập phim');
    }
  });

  // Data Sync Panel Events
  document.getElementById('admin-sync-refresh-btn')?.addEventListener('click', loadAdminSync);

  // Single Anime Sync
  document.getElementById('admin-sync-single-btn')?.addEventListener('click', async () => {
    const slugInput = document.getElementById('admin-sync-single-slug');
    const statusDiv = document.getElementById('admin-sync-single-status');
    const slug = slugInput?.value.trim();

    if (!slug) {
      showToast('Vui lòng nhập slug anime cần đồng bộ');
      return;
    }

    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.color = 'var(--text-muted)';
      statusDiv.textContent = `⏳ Đang đồng bộ "${slug}" từ máy chủ...`;
    }

    const res = await AniDokiAPI.syncAdminAnime(slug);
    if (res.success) {
      if (statusDiv) {
        statusDiv.style.color = '#2ecc71';
        statusDiv.textContent = `✓ ${res.message || 'Đồng bộ hoàn tất'}`;
      }
      showToast(`Đã đồng bộ thành công "${slug}"`);
      if (slugInput) slugInput.value = '';
    } else {
      if (statusDiv) {
        statusDiv.style.color = '#ff5c72';
        statusDiv.textContent = `⚠️ ${res.message || 'Đồng bộ thất bại'}`;
      }
      showToast(res.message || 'Lỗi đồng bộ anime');
    }
    await loadAdminSync();
  });

  // Recent Catalog Sync
  document.getElementById('admin-sync-recent-btn')?.addEventListener('click', async () => {
    const pageSelect = document.getElementById('admin-sync-recent-page');
    const statusDiv = document.getElementById('admin-sync-recent-status');
    const page = Number(pageSelect?.value || 1);

    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.color = 'var(--text-muted)';
      statusDiv.textContent = `⏳ Đang đồng bộ danh mục phim trang ${page}...`;
    }

    const res = await AniDokiAPI.syncAdminRecent(page);
    if (res.success) {
      if (statusDiv) {
        statusDiv.style.color = '#2ecc71';
        statusDiv.textContent = `✓ ${res.message || 'Đồng bộ catalog hoàn tất'}`;
      }
      showToast(`Đã đồng bộ danh mục trang ${page}`);
    } else {
      if (statusDiv) {
        statusDiv.style.color = '#ff5c72';
        statusDiv.textContent = `⚠️ ${res.message || 'Đồng bộ thất bại'}`;
      }
      showToast(res.message || 'Lỗi đồng bộ danh mục');
    }
    await loadAdminSync();
  });

  // Reports Panel Events
  document.getElementById('admin-reports-refresh-btn')?.addEventListener('click', loadAdminReports);

  // Status Filter Pills
  document.querySelectorAll('#admin-reports-status-tabs .pill-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-reports-status-tabs .pill-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAdminReportFilter.status = btn.getAttribute('data-report-status') || 'all';
      loadAdminReports();
    });
  });

  // Issue Type Filter
  document.getElementById('admin-reports-type-filter')?.addEventListener('change', (e) => {
    currentAdminReportFilter.issue_type = e.target.value;
    loadAdminReports();
  });

  // Report Process Modal Events
  const reportModal = document.getElementById('admin-report-process-modal');
  const closeReportModalBtn = document.getElementById('close-admin-report-modal-btn');
  const cancelReportModalBtn = document.getElementById('admin-report-process-cancel');
  const reportProcessForm = document.getElementById('admin-report-process-form');

  const closeReportModal = () => reportModal?.classList.remove('active');
  closeReportModalBtn?.addEventListener('click', closeReportModal);
  cancelReportModalBtn?.addEventListener('click', closeReportModal);
  reportModal?.addEventListener('click', (e) => {
    if (e.target === reportModal) closeReportModal();
  });

  reportProcessForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reportId = document.getElementById('admin-report-process-id')?.value;
    if (!reportId) return;

    const payload = {
      status: document.getElementById('admin-report-process-status')?.value || 'pending',
      admin_notes: document.getElementById('admin-report-process-notes')?.value.trim()
    };

    const res = await AniDokiAPI.updateAdminReport(reportId, payload);
    if (res.success) {
      showToast('Đã cập nhật trạng thái phản ánh!');
      closeReportModal();
      await loadAdminReports();
      await loadAdminDashboard();
    } else {
      showToast(res.message || 'Lỗi cập nhật phản ánh');
    }
  });

  // Users Refresh
  document.getElementById('admin-users-refresh-btn')?.addEventListener('click', loadAdminUsers);

  // Users Search & Status Filter (Phase 4)
  const userSearchInput = document.getElementById('admin-users-search-input');
  let userSearchTimeout;
  userSearchInput?.addEventListener('input', () => {
    clearTimeout(userSearchTimeout);
    userSearchTimeout = setTimeout(() => {
      currentAdminUserSearch = userSearchInput.value.trim();
      loadAdminUsers();
    }, 350);
  });

  document.querySelectorAll('#admin-users-status-tabs .pill-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-users-status-tabs .pill-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAdminUserStatus = btn.getAttribute('data-user-status') || 'all';
      loadAdminUsers();
    });
  });

  // Ban User Modal Events (Phase 4)
  const banModal = document.getElementById('admin-user-ban-modal');
  const closeBanModalBtn = document.getElementById('close-admin-ban-modal-btn');
  const cancelBanModalBtn = document.getElementById('admin-ban-cancel-btn');
  const banForm = document.getElementById('admin-ban-modal-form');

  const closeBanModal = () => banModal?.classList.remove('active');
  closeBanModalBtn?.addEventListener('click', closeBanModal);
  cancelBanModalBtn?.addEventListener('click', closeBanModal);
  banModal?.addEventListener('click', (e) => {
    if (e.target === banModal) closeBanModal();
  });

  banForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('admin-ban-user-id')?.value;
    const reason = document.getElementById('admin-ban-reason-input')?.value.trim();
    if (!userId) return;

    if (!reason) {
      showToast('Vui lòng nhập lý do khóa tài khoản');
      return;
    }

    const res = await AniDokiAPI.banAdminUser(userId, { is_banned: true, ban_reason: reason });
    if (res.success) {
      showToast('Đã khóa tài khoản người dùng thành công');
      closeBanModal();
      await loadAdminUsers();
    } else {
      showToast(res.message || 'Lỗi khóa tài khoản');
    }
  });

  // Feedback Panel Events (Phase 4)
  document.getElementById('admin-feedback-refresh-btn')?.addEventListener('click', () => loadAdminFeedback(currentFeedbackStatus));
  document.querySelectorAll('#admin-feedback-status-tabs .pill-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-feedback-status-tabs .pill-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const st = btn.getAttribute('data-feedback-status') || 'all';
      loadAdminFeedback(st);
    });
  });

  // Audit Logs Panel Events (Phase 4)
  document.getElementById('admin-audit-refresh-btn')?.addEventListener('click', () => loadAdminAuditLogs(currentAuditPage));
  const auditSearchInput = document.getElementById('admin-audit-search');
  let auditSearchTimeout;
  auditSearchInput?.addEventListener('input', () => {
    clearTimeout(auditSearchTimeout);
    auditSearchTimeout = setTimeout(() => {
      loadAdminAuditLogs(1);
    }, 350);
  });
  document.getElementById('admin-audit-action-filter')?.addEventListener('change', () => {
    loadAdminAuditLogs(1);
  });
  document.getElementById('admin-audit-prev-btn')?.addEventListener('click', () => {
    if (currentAuditPage > 1) loadAdminAuditLogs(currentAuditPage - 1);
  });
  document.getElementById('admin-audit-next-btn')?.addEventListener('click', () => {
    loadAdminAuditLogs(currentAuditPage + 1);
  });
}
