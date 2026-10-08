// Runs before the app bundle, so a failed import cannot leave the screen locked.
(() => {
  const root = document.documentElement;
  root.classList.add('is-starting');
  let finished = false;
  const timeout = window.setTimeout(finish, 15000);

  function finish() {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    const loader = document.getElementById('startup-loader');
    loader?.classList.add('is-leaving');
    // Reveal the page beneath the fading overlay.
    root.classList.add('startup-leaving');
    window.setTimeout(() => {
      root.classList.remove('is-starting', 'startup-leaving');
      loader?.remove();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
  }

  window.finishStartupLoading = finish;
})();
