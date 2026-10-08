// Router cho Single Page Application (SPA) AniDoki
// Hỗ trợ URL trực tiếp, Back/Forward, Tải lại trang, và Dynamic URL segments

export class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.notFoundHandler = null;

    window.addEventListener('popstate', () => {
      this.handleRoute(window.location.pathname + window.location.search);
    });

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      // Bỏ qua external links, hash anchors nội bộ đơn thuần, và javascript:
      if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//') || href.startsWith('mailto:') || href.startsWith('tel:') || href === '#') {
        return;
      }

      // Xử lý các link nội bộ
      if (href.startsWith('/') || href.startsWith('?')) {
        e.preventDefault();
        this.navigate(href);
      }
    });
  }

  addRoute(pattern, handler) {
    // Chuyển route pattern thành regex: ví dụ /anime/:slug -> /anime/([^/]+)
    const paramNames = [];
    const regexPath = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${regexPath}$`);
    this.routes.push({ pattern, regex, paramNames, handler });
    return this;
  }

  setNotFound(handler) {
    this.notFoundHandler = handler;
    return this;
  }

  navigate(url, replace = false, scrollY = 0) {
    const currentUrl = window.location.pathname + window.location.search;
    const isDetail = path => /^\/(anime|watch)\//.test(path);
    const returnTo = isDetail(url)
      ? (isDetail(currentUrl) ? window.history.state?.detailReturnTo : { url: currentUrl, scrollY: window.scrollY })
      : undefined;
    const historyState = returnTo ? { detailReturnTo: returnTo } : {};
    if (replace) {
      window.history.replaceState(historyState, '', url);
    } else {
      window.history.pushState(historyState, '', url);
    }
    this.handleRoute(url, scrollY);
  }

  returnFromDetail() {
    const target = window.history.state?.detailReturnTo;
    const safe = target && /^\/(?!\/|anime\/|watch\/)/.test(target.url);
    this.navigate(safe ? target.url : '/', true, safe ? target.scrollY || 0 : 0);
  }

  handleRoute(fullUrl = window.location.pathname + window.location.search, scrollY = 0) {
    const [pathname, searchStr] = fullUrl.split('?');
    const searchParams = new URLSearchParams(searchStr || '');

    for (const route of this.routes) {
      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1]);
        });

        this.currentRoute = {
          pattern: route.pattern,
          pathname,
          params,
          query: Object.fromEntries(searchParams.entries()),
          searchParams
        };

        this.updateActiveNav(pathname);
        const current = this.currentRoute;
        const result = route.handler(current);
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        if (scrollY) Promise.resolve(result).then(() => {
          if (this.currentRoute === current) window.scrollTo({ top: scrollY, behavior: 'instant' });
        });
        return result;
      }
    }

    // 404 Route
    this.currentRoute = {
      pattern: '404',
      pathname,
      params: {},
      query: Object.fromEntries(searchParams.entries()),
      searchParams
    };
    this.updateActiveNav(pathname);
    const result = this.notFoundHandler?.(this.currentRoute);
    window.scrollTo({ top: 0, behavior: 'instant' });
    return result;
  }

  updateActiveNav(pathname) {
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;

      const isHome = (pathname === '/' || pathname === '') && (href === '/' || href === '#');
      const isMatch = href === pathname || (href !== '/' && pathname.startsWith(href));
      link.classList.toggle('active', isHome || isMatch);
      if (isHome || isMatch) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelector('.mobile-bottom-nav')?.classList.remove('nav-hidden');
  }
}

export const router = new Router();
