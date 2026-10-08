import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { router } from '../router.js';
import { showToast, formatTime } from '../utils/ui.js';
import { openAnimeDetail } from './DetailView.js';
import { loadContinueWatching } from './HomeView.js';
import { validEmbed, validAnime47WatchUrl } from '../../../../shared/providers.js';
import { setPlayerSEO } from '../utils/seo.js';

// CINEMA VIDEO PLAYER (ANIDOKI EMBED)
// ==========================================
let streamRequest = 0;
let lastProgressSave = 0;
let activeProvider = 'AniDoki';
let activeLanguage = 'sub';
let hlsPlayer = null;
let sourceWatchUrl = null;


export async function openPlayerByRoute(animeId, episodeNumber = 1) {
  // Hide detail view if currently open
  document.getElementById('detail-view')?.classList.remove('active');

  let anime = (state.currentDetailAnime?.id === animeId) ? state.currentDetailAnime : await AniDokiAPI.getAnimeDetail(animeId);
  if (!anime) {
    showToast('Không tìm thấy thông tin phim để phát.');
    router.navigate('/');
    return;
  }
  state.currentDetailAnime = anime;

  // Nạp danh sách tập nếu chưa có
  if (!state.currentEpisodes.length || state.currentVideoAnime?.id !== animeId) {
    try {
      const epData = await AniDokiAPI.getEpisodes(animeId);
      state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
    } catch {
      state.currentEpisodes = anime.episodes || [];
    }
  }

  const epNum = parseInt(episodeNumber, 10) || 1;
  let idx = state.currentEpisodes.findIndex(e => Number(e.number) === epNum);
  if (idx === -1) {
    showToast(anime.playbackUnavailable?.message || 'Nguồn này chưa có tập được chọn. Hãy chọn tập trong danh sách.');
    router.navigate(`/anime/${animeId}`, true);
    return;
  }

  await openPlayer(anime, idx, 0, false);
}

async function openPlayer(anime, episodeIndex = 0, resumeTime = 0, pushRoute = true) {
  state.currentVideoAnime = anime;
  state.currentEpisodeIndex = episodeIndex;
  activeProvider = anime.source || (anime.id?.startsWith('anime47-') ? 'Anime47' : 'AniDoki');
  void renderSourceChoices(anime, state.currentEpisodes[episodeIndex]?.number || 1);

  // Đảm bảo nạp đầy đủ danh sách tập từ API nếu chưa có
  if (!state.currentEpisodes.length || state.currentVideoAnime?.id !== anime.id) {
    try {
      const epData = await AniDokiAPI.getEpisodes(anime.id);
      state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
    } catch {
      state.currentEpisodes = anime.episodes || [];
    }
  }

  if (!state.currentEpisodes.length) {
    showToast('Nguồn này chưa có tập Vietsub cho phim này.');
    return;
  }

  const episode = state.currentEpisodes[episodeIndex] || state.currentEpisodes[0];
  const epNum = episode.number || (episodeIndex + 1);

  if (pushRoute) {
    router.navigate(`/watch/${anime.id}/${epNum}`);
    return;
  }

  document.getElementById('detail-view')?.classList.remove('active');
  setPlayerSEO(anime, epNum);

  const modal = document.getElementById('player-modal');
  const title = document.getElementById('player-anime-name');
  const epHeading = document.getElementById('current-ep-heading');

  if (title) title.textContent = `${anime.title.english || anime.title.vietnamese} — ${episode.title || `Tập ${epNum}`}`;
  if (epHeading) epHeading.textContent = episode.title || `Tập ${epNum}`;

  // Cập nhật giá kệ chọn tập xem nhanh trong trình phát
  const shelfCount = document.getElementById('watch-episodes-shelf-count');
  if (shelfCount) shelfCount.textContent = `Tổng cộng: ${state.currentEpisodes.length} tập`;
  const shelfGrid = document.getElementById('watch-episodes-shelf-grid');
  if (shelfGrid) {
    shelfGrid.innerHTML = '';
    state.currentEpisodes.forEach((ep, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `watch-ep-button ${i === episodeIndex ? 'active' : ''}`;
      btn.textContent = `${ep.number}`;
      btn.title = ep.title || `Tập ${ep.number}`;
      btn.addEventListener('click', () => {
        if (i === state.currentEpisodeIndex) return;
        router.navigate(`/watch/${anime.id}/${ep.number}`);
      });
      shelfGrid.appendChild(btn);
    });
    const activeBtn = shelfGrid.querySelector('.watch-ep-button.active');
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // Cập nhật trạng thái nút tập trước/kế tiếp
  const prevBtn = document.getElementById('nav-prev-ep');
  const nextBtn = document.getElementById('nav-next-ep');
  const ctrlPrevBtn = document.getElementById('prev-ep-btn');
  const ctrlNextBtn = document.getElementById('next-ep-btn');
  const hasPrev = episodeIndex > 0;
  const hasNext = episodeIndex < state.currentEpisodes.length - 1;

  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.disabled = !hasNext;
  if (ctrlPrevBtn) ctrlPrevBtn.style.opacity = hasPrev ? '1' : '0.4';
  if (ctrlNextBtn) ctrlNextBtn.style.opacity = hasNext ? '1' : '0.4';

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Nạp iframe AniDoki từ máy chủ
  await loadLiveAnimeStream(anime.id, epNum, activeProvider, activeLanguage, resumeTime);
}

async function loadLiveAnimeStream(animeId, episodeNumber, provider, language, resumeTime = 0) {
  const video = document.getElementById('main-video');
  const iframe = document.getElementById('anime-iframe');
  const controls = document.getElementById('player-controls');

  const requestId = ++streamRequest;
  sourceWatchUrl = null;
  hlsPlayer?.destroy();
  hlsPlayer = null;
  video.onloadedmetadata = null;
  video.onerror = null;
  lastProgressSave = 0;
  video.pause();
  video.removeAttribute('src');
  video.querySelectorAll('track').forEach(track => track.remove());
  video.style.display = 'none';
  iframe.removeAttribute('src');
  iframe.style.display = 'none';
  if (controls) controls.style.display = 'none';
  document.getElementById('player-notice-banner')?.remove();
  showToast(`Đang tải nguồn ${provider} • Vietsub...`);
  document.getElementById('player-source-label').textContent = `${provider} • Phụ đề Việt`;
  try {
    const res = await fetch('/api/watch/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anime_id: animeId, episode_number: episodeNumber, language, provider })
    });
    const data = await res.json();
    if (requestId !== streamRequest) return;
    if (!res.ok || !data.success) throw new Error(data.message || 'Tập hoặc ngôn ngữ này chưa có nguồn phát.');
    if (data.provider === 'Anime47' && validAnime47WatchUrl(data.watch_url)) sourceWatchUrl = data.watch_url;
    if (data.type === 'hls') {
      const streamUrl = new URL(data.stream_url, window.location.origin);
      const localAnime47 = data.provider === 'Anime47' && streamUrl.origin === window.location.origin &&
        /^\/api\/watch\/anime47\/media\/[a-f0-9]{48}$/.test(streamUrl.pathname);
      if ((!localAnime47 && streamUrl.protocol !== 'https:') || streamUrl.username || streamUrl.password) throw new Error('Địa chỉ video không hợp lệ.');
      video.controls = true;
      video.crossOrigin = 'anonymous';
      for (const [index, subtitle] of (data.subtitles || []).entries()) {
        const url = new URL(subtitle.file);
        if (url.protocol !== 'https:' || url.username || url.password) continue;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.srclang = 'vi';
        track.label = subtitle.label || 'Tiếng Việt';
        track.src = url.href;
        track.default = index === 0;
        video.appendChild(track);
      }
      video.style.display = 'block';
      if (data.provider) activeProvider = data.provider;
      document.getElementById('player-source-label').textContent = `${data.provider || activeProvider} • Phụ đề Việt`;
      video.onloadedmetadata = () => {
        if (requestId !== streamRequest) return;
        if (resumeTime > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - 1));
      };
      video.onerror = () => {
        if (requestId === streamRequest) {
          if (provider === 'Anime47') {
            showToast('Đang tự động chuyển sang nguồn AniDoki Vietsub...');
            activeProvider = 'AniDoki';
            loadLiveAnimeStream(animeId, episodeNumber, 'AniDoki', language, resumeTime);
            return;
          }
          showPlayerNotice('Không tải được video trực tiếp. Hãy thử lại hoặc chọn nguồn khác.');
        }
      };
      const { default: Hls } = await import('hls.js');
      if (requestId !== streamRequest) return;
      if (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl.href;
      } else {
        if (!Hls.isSupported()) throw new Error('Trình duyệt này chưa hỗ trợ phát video trực tiếp.');
        hlsPlayer = new Hls();
        hlsPlayer.on(Hls.Events.ERROR, (_event, error) => {
          if (error.fatal && requestId === streamRequest) {
            console.warn('Direct playback failed:', error.details);
            hlsPlayer?.destroy();
            hlsPlayer = null;
            if (provider === 'Anime47') {
              showToast('Nguồn Anime47 bị gián đoạn. Đang kết nối nguồn AniDoki Vietsub...');
              activeProvider = 'AniDoki';
              loadLiveAnimeStream(animeId, episodeNumber, 'AniDoki', language, resumeTime);
              return;
            }
            showPlayerNotice('Không tải được video trực tiếp. Hãy thử lại hoặc chọn nguồn khác.');
          }
        });
        hlsPlayer.loadSource(streamUrl.href);
        hlsPlayer.attachMedia(video);
      }
      return;
    }
    if (data.type !== 'embed') throw new Error('Nguồn phát không hợp lệ.');
    const url = new URL(data.embed_url);
    if (!validEmbed(url.href, data.provider)) throw new Error('Địa chỉ trình phát không hợp lệ.');
    document.getElementById('player-source-label').textContent = `${data.provider} • Phụ đề Việt`;
    iframe.title = `Trình phát ${data.provider}`;
    iframe.src = url.href;
    iframe.style.display = 'block';
    AniDokiAPI.saveProgress(animeId, episodeNumber, 0, 0);
    if (resumeTime > 0) showToast('Chọn vị trí xem tiếp trong trình phát.');
  } catch (err) {
    if (requestId === streamRequest) {
      if (provider === 'Anime47') {
        showToast('Đang tự động chuyển sang nguồn AniDoki Vietsub...');
        activeProvider = 'AniDoki';
        loadLiveAnimeStream(animeId, episodeNumber, 'AniDoki', language, resumeTime);
        return;
      }
      showPlayerNotice(err.message);
    }
  }
}

let sourceRequest = 0;
async function renderSourceChoices(anime, episodeNumber) {
  const request = ++sourceRequest;
  const container = document.getElementById('player-source-options');
  const render = sources => {
    container.replaceChildren();
    for (const source of sources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `prov-btn${source.id === anime.id ? ' active' : ''}`;
      button.textContent = source.source;
      button.setAttribute('aria-pressed', String(source.id === anime.id));
      button.addEventListener('click', () => {
        if (source.id !== anime.id) router.navigate(`/watch/${source.id}/${episodeNumber}`);
      });
      container.append(button);
    }
  };
  render([{ id: anime.id, source: anime.source || 'AniDoki' }]);
  try {
    const response = await fetch(`/api/anime/${encodeURIComponent(anime.id)}/seasons`);
    const result = await response.json();
    if (request !== sourceRequest || state.currentVideoAnime?.id !== anime.id) return;
    const season = result.data?.find(s => s.sources?.some(source => source.id === anime.id));
    if (season?.sources?.length) render(season.sources);
  } catch { /* The current source remains usable when discovery is unavailable. */ }
}

function showPlayerNotice(message) {
  const video = document.getElementById('main-video');
  const iframe = document.getElementById('anime-iframe');
  const controls = document.getElementById('player-controls');
  const container = document.getElementById('video-container');

  if (video) {
    video.pause();
    video.style.display = 'none';
  }
  if (iframe) {
    iframe.style.display = 'none';
    iframe.src = '';
  }
  if (controls) controls.style.display = 'none';

  let notice = document.getElementById('player-notice-banner');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'player-notice-banner';
    notice.className = 'player-notice-banner';
    container.appendChild(notice);
  }

  notice.innerHTML = `
    <div class="notice-card">
      <div class="notice-icon">⚠️</div>
      <h3 class="notice-title">Thông Báo Nguồn Phát</h3>
      <p class="notice-desc"></p>
      <div class="notice-actions">
        <button class="notice-retry-btn" id="notice-retry-btn">Thử lại</button>
      </div>
    </div>
  `;
  notice.querySelector('.notice-desc').textContent = message;
  if (sourceWatchUrl && validAnime47WatchUrl(sourceWatchUrl)) {
    const link = document.createElement('a');
    link.href = sourceWatchUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'notice-retry-btn';
    link.textContent = 'Mở tập trên Anime47';
    notice.querySelector('.notice-actions').appendChild(link);
  }
  notice.style.display = 'flex';

  document.getElementById('notice-retry-btn')?.addEventListener('click', () => {
    notice.style.display = 'none';
    const altProv = activeProvider;
    document.querySelectorAll('.prov-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.provider === altProv);
    });
    activeProvider = altProv;
    if (state.currentVideoAnime) {
      loadLiveAnimeStream(state.currentVideoAnime.id, state.currentEpisodes[state.currentEpisodeIndex]?.number || 1, altProv, activeLanguage, 0);
    }
  });
}

export function initPlayerControls() {
  const video = document.getElementById('main-video');
  const iframe = document.getElementById('anime-iframe');
  const modal = document.getElementById('player-modal');
  const playBtn = document.getElementById('play-pause-btn');
  const progressBar = document.getElementById('video-progress-bar');
  const progressFill = document.getElementById('video-progress-fill');
  const timeDisplay = document.getElementById('video-time');
  const speedBtn = document.getElementById('speed-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  // Điều hướng chuyển tập trước / tập tiếp theo
  const navigateToEp = (delta) => {
    const epList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime?.episodes || []);
    if (!state.currentVideoAnime || !epList.length) return;
    const targetIdx = state.currentEpisodeIndex + delta;
    if (targetIdx >= 0 && targetIdx < epList.length) {
      const targetEp = epList[targetIdx];
      router.navigate(`/watch/${state.currentVideoAnime.id}/${targetEp.number}`);
    } else if (delta < 0) {
      showToast('Đang ở tập đầu tiên');
    } else {
      showToast('Đang ở tập mới nhất');
    }
  };

  document.getElementById('nav-next-ep')?.addEventListener('click', () => navigateToEp(1));
  document.getElementById('next-ep-btn')?.addEventListener('click', () => navigateToEp(1));
  document.getElementById('nav-prev-ep')?.addEventListener('click', () => navigateToEp(-1));
  document.getElementById('prev-ep-btn')?.addEventListener('click', () => navigateToEp(-1));

  // Tùy chọn Tự chuyển tập (Autonext)
  const autoNextChk = document.getElementById('chk-autonext');
  if (autoNextChk) {
    const savedAutoNext = localStorage.getItem('anidoki_autonext');
    autoNextChk.checked = savedAutoNext !== 'false';
    autoNextChk.addEventListener('change', (e) => {
      localStorage.setItem('anidoki_autonext', String(e.target.checked));
      showToast(e.target.checked ? 'Đã bật tự chuyển tập' : 'Đã tắt tự chuyển tập');
    });
  }

  // Tự chuyển tập khi HTML5 video kết thúc
  video.addEventListener('ended', () => {
    const isAutoNext = localStorage.getItem('anidoki_autonext') !== 'false';
    if (isAutoNext && state.currentVideoAnime && state.currentEpisodeIndex < state.currentEpisodes.length - 1) {
      showToast('Đang tự động chuyển sang tập tiếp theo...');
      setTimeout(() => navigateToEp(1), 1000);
    }
  });

  // Tắt đèn / Theater Mode
  document.getElementById('btn-light')?.addEventListener('click', () => {
    modal.classList.toggle('light-off');
    showToast(modal.classList.contains('light-off') ? 'Đã tắt đèn làm dịu mắt' : 'Đã bật đèn');
  });

  // Đóng player
  document.getElementById('close-player-btn')?.addEventListener('click', async () => {
    ++streamRequest;
    hlsPlayer?.destroy();
    hlsPlayer = null;
    if (state.currentVideoAnime && video && video.currentTime > 0) {
      const episodeList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime.episodes || []);
      const episode = episodeList[state.currentEpisodeIndex];
      AniDokiAPI.saveProgress(state.currentVideoAnime.id, episode?.number || 1, video.currentTime, video.duration);
    }
    video.pause();
    video.src = '';
    iframe.src = '';
    modal.classList.remove('active');
    document.body.style.overflow = '';
    await loadContinueWatching();
    if (state.currentVideoAnime) {
      router.navigate(`/anime/${state.currentVideoAnime.id}`);
    } else {
      router.navigate('/');
    }
  });

  video.addEventListener('pause', () => {
    if (state.currentVideoAnime && video.currentTime > 0) {
      const episodeList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime.episodes || []);
      const episode = episodeList[state.currentEpisodeIndex];
      AniDokiAPI.saveProgress(state.currentVideoAnime.id, episode?.number || 1, video.currentTime, video.duration);
    }
  });

  playBtn?.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      updatePlayPauseIcon(true);
    } else {
      video.pause();
      updatePlayPauseIcon(false);
    }
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      progressFill.style.width = `${pct}%`;
      timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;

      // Sync progress to API every 5 seconds
      if (Date.now() - lastProgressSave >= 5000 && state.currentVideoAnime && video.currentTime > 0) {
        lastProgressSave = Date.now();
        const episodeList = state.currentEpisodes.length ? state.currentEpisodes : (state.currentVideoAnime.episodes || []);
        const episode = episodeList[state.currentEpisodeIndex];
        AniDokiAPI.saveProgress(state.currentVideoAnime.id, episode?.number || 1, video.currentTime, video.duration);
      }
    }
  });

  progressBar?.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
  });

  const speeds = [1, 1.25, 1.5, 2, 0.75];
  let speedIdx = 0;
  speedBtn?.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const s = speeds[speedIdx];
    video.playbackRate = s;
    speedBtn.textContent = `${s}x`;
  });

  fullscreenBtn?.addEventListener('click', () => {
    const container = document.getElementById('video-container');
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

// ==========================================
// REPORT ISSUE MODAL
// ==========================================
export function initReportModal() {
  const modal = document.getElementById('report-modal');
  const form = document.getElementById('report-form');
  const closeBtn = document.getElementById('close-report-btn');
  const cancelBtn = document.getElementById('cancel-report-btn');
  const openBtn = document.getElementById('open-report-btn');

  const close = () => {
    modal?.classList.remove('active');
  };

  openBtn?.addEventListener('click', () => {
    if (!state.currentVideoAnime) {
      showToast('Chưa chọn anime nào để báo lỗi');
      return;
    }
    const anime = state.currentVideoAnime;
    const ep = state.currentEpisodes[state.currentEpisodeIndex] || { number: state.currentEpisodeIndex + 1 };
    const epNum = ep.number || (state.currentEpisodeIndex + 1);

    const titleInput = document.getElementById('report-anime-title');
    const epInput = document.getElementById('report-episode-num');
    const provInput = document.getElementById('report-provider');

    if (titleInput) titleInput.value = anime.title.vietnamese || anime.title.english || anime.id;
    if (epInput) epInput.value = `Tập ${epNum}`;
    if (provInput) provInput.value = activeProvider || 'AniDoki';

    modal?.classList.add('active');
  });

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentVideoAnime) {
      close();
      return;
    }
    const ep = state.currentEpisodes[state.currentEpisodeIndex] || { number: state.currentEpisodeIndex + 1 };
    const epNum = ep.number || (state.currentEpisodeIndex + 1);
    const issueType = document.getElementById('report-issue-type')?.value;
    const desc = document.getElementById('report-desc')?.value?.trim();

    const submitBtn = document.getElementById('submit-report-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang gửi...';
    }

    try {
      const res = await AniDokiAPI.submitReport({
        anime_id: state.currentVideoAnime.id,
        episode_number: epNum,
        provider: activeProvider || 'AniDoki',
        issue_type: issueType,
        description: desc
      });

      if (res.success) {
        showToast('Báo lỗi thành công! Đội ngũ kỹ thuật sẽ sớm kiểm tra.');
        form.reset();
        close();
      } else {
        showToast(res.message || 'Không thể gửi báo lỗi lúc này.');
      }
    } catch {
      showToast('Đã xảy ra lỗi khi gửi báo lỗi.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gửi báo lỗi';
      }
    }
  });
}

// ==========================================




export function updatePlayPauseIcon(isPlaying) {
  const icon = document.getElementById('play-icon');
  if (!icon) return;
  if (isPlaying) {
    icon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
  } else {
    icon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }
}



// ==========================================
