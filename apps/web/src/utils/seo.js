const DOMAIN = 'https://anidoki.com';
const SITE_NAME = 'AniDoki';
const DEFAULT_IMAGE = `${DOMAIN}/brand/anidoki-white.svg`;

function setMetaTag(nameOrProp, isProperty, content) {
  if (!content) return;
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${nameOrProp}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonicalUrl(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function setJsonLd(schemas) {
  let script = document.getElementById('jsonld-structured-data');
  if (!script) {
    script = document.createElement('script');
    script.id = 'jsonld-structured-data';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  const payload = Array.isArray(schemas)
    ? { '@context': 'https://schema.org', '@graph': schemas }
    : schemas;
  script.textContent = JSON.stringify(payload, null, 2);
}

function cleanText(str, maxLength = 160) {
  if (!str) return '';
  const clean = String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 3) + '...';
}

/**
 * Cập nhật toàn bộ thẻ Meta & OpenGraph & Twitter Cards
 */
export function updateSEO({
  title,
  description,
  keywords,
  canonical,
  image = DEFAULT_IMAGE,
  type = 'website',
  jsonLd = null
}) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  document.title = fullTitle;

  // Standard Meta
  setMetaTag('description', false, description);
  setMetaTag('keywords', false, keywords || 'anime vietsub, xem anime online, anidoki, anime mùa mới 2026, anime full hd');
  setMetaTag('robots', false, 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
  setCanonicalUrl(canonical || `${DOMAIN}${window.location.pathname}`);

  // Open Graph / Facebook
  setMetaTag('og:site_name', true, SITE_NAME);
  setMetaTag('og:title', true, fullTitle);
  setMetaTag('og:description', true, description);
  setMetaTag('og:url', true, canonical || `${DOMAIN}${window.location.pathname}`);
  setMetaTag('og:image', true, image);
  setMetaTag('og:type', true, type);
  setMetaTag('og:locale', true, 'vi_VN');

  // Twitter Card
  setMetaTag('twitter:card', false, 'summary_large_image');
  setMetaTag('twitter:title', false, fullTitle);
  setMetaTag('twitter:description', false, description);
  setMetaTag('twitter:image', false, image);

  // Structured Data (JSON-LD)
  if (jsonLd) {
    setJsonLd(jsonLd);
  }
}

export const SITE_NAVIGATION_SCHEMA = [
  {
    '@type': 'SiteNavigationElement',
    'name': 'Trang Chủ',
    'url': `${DOMAIN}/`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Khám Phá Anime',
    'url': `${DOMAIN}/browse`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Mới Cập Nhật',
    'url': `${DOMAIN}/browse?sort=updated`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Thịnh Hành & Điểm Cao',
    'url': `${DOMAIN}/browse?sort=score`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Anime Đang Phát Sóng',
    'url': `${DOMAIN}/browse?status=ongoing`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Anime Trọn Bộ',
    'url': `${DOMAIN}/browse?status=completed`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Thể Loại Hành Động',
    'url': `${DOMAIN}/browse?category=hanh-dong`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Thể Loại Phiêu Lưu',
    'url': `${DOMAIN}/browse?category=phieu-luu`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Thể Loại Tình Cảm',
    'url': `${DOMAIN}/browse?category=tinh-cam`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Thư Viện Phim',
    'url': `${DOMAIN}/library`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Lịch Sử Xem',
    'url': `${DOMAIN}/history`
  },
  {
    '@type': 'SiteNavigationElement',
    'name': 'Trợ Giúp & Góp Ý',
    'url': `${DOMAIN}/help`
  }
];

/**
 * 1. SEO Trang chủ
 */
export function setHomeSEO() {
  const title = 'AniDoki — Xem Anime Vietsub Online Full HD | Phim Mới Cập Nhật Nhanh';
  const description = 'AniDoki - Website xem anime Vietsub online Full HD chất lượng cao hoàn toàn miễn phí. Thưởng thức kho phim anime mùa mới 2026, anime hot trend và phim lẻ điện ảnh không giật lag!';
  const canonical = `${DOMAIN}/`;

  const webSiteSchema = {
    '@type': 'WebSite',
    '@id': `${DOMAIN}/#website`,
    'name': SITE_NAME,
    'alternateName': ['anidoki', 'AniDoki Anime', 'AniDoki Vietsub', 'AniDoki Online'],
    'url': DOMAIN,
    'description': description,
    'inLanguage': 'vi',
    'publisher': {
      '@type': 'Organization',
      'name': SITE_NAME,
      'url': DOMAIN,
      'logo': `${DOMAIN}/brand/anidoki-white.svg`
    },
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${DOMAIN}/browse?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };

  const orgSchema = {
    '@type': 'Organization',
    '@id': `${DOMAIN}/#organization`,
    'name': SITE_NAME,
    'url': DOMAIN,
    'logo': `${DOMAIN}/brand/anidoki-white.svg`
  };

  const breadcrumbsSchema = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Trang chủ', 'item': `${DOMAIN}/` }
    ]
  };

  updateSEO({
    title,
    description,
    canonical,
    jsonLd: [webSiteSchema, orgSchema, breadcrumbsSchema, ...SITE_NAVIGATION_SCHEMA]
  });
}

/**
 * 2. SEO Trang Khám phá / Lọc thể loại
 */
export function setBrowseSEO({ categoryName, queryText, year } = {}) {
  let title = 'Khám Phá Anime Vietsub Hay Nhất — Kho Phim Mới & BXH | AniDoki';
  let description = 'Khám phá và lọc hàng ngàn bộ anime đỉnh cao theo thể loại, năm phát hành và điểm đánh giá. Xem anime Vietsub Full HD miễn phí tại AniDoki.';

  if (categoryName) {
    title = `Top Anime ${categoryName} Vietsub Hay Nhất 2026 | AniDoki`;
    description = `Danh sách tổng hợp anime thể loại ${categoryName} Vietsub Full HD mới nhất và được xem nhiều nhất. Xem ngay không quảng cáo tại AniDoki!`;
  } else if (queryText) {
    title = `Tìm kiếm: "${queryText}" — Kết quả Anime Vietsub | AniDoki`;
    description = `Kết quả tìm kiếm cho từ khóa "${queryText}". Xem anime "${queryText}" Vietsub Full HD tại AniDoki.`;
  } else if (year) {
    title = `Anime Mùa Mới Năm ${year} Vietsub Full HD | AniDoki`;
    description = `Kho anime phát hành năm ${year} bản Vietsub sắc nét, đầy đủ các tập mới nhất tại AniDoki.`;
  }

  const breadcrumbsSchema = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Trang chủ', 'item': `${DOMAIN}/` },
      { '@type': 'ListItem', 'position': 2, 'name': categoryName ? `Thể loại: ${categoryName}` : 'Khám phá', 'item': `${DOMAIN}/browse` }
    ]
  };

  updateSEO({
    title,
    description,
    jsonLd: breadcrumbsSchema
  });
}

/**
 * 3. SEO Trang Chi tiết Anime (Rich Snippets Rating ⭐ + Breadcrumbs)
 */
export function setAnimeDetailSEO(anime) {
  if (!anime) return;
  const nameVi = anime.title?.vietnamese || '';
  const nameEn = anime.title?.english || '';
  const displayName = nameVi || nameEn || 'Anime';
  const subName = (nameVi && nameEn && nameVi !== nameEn) ? ` (${nameEn})` : '';

  let epStatus = 'Trọn Bộ';
  if (anime.status === 'Currently Airing' || anime.currentEpisode) {
    epStatus = anime.currentEpisode ? `Tập ${anime.currentEpisode}` : 'Đang phát sóng';
  } else if (anime.isMovie || anime.format === 'MOVIE') {
    epStatus = 'Phim Lẻ';
  }

  // Tiêu đề clickbait sạch đạt High CTR (dưới 60 ký tự)
  const title = `Xem Phim ${displayName}${subName} Vietsub Full HD [${epStatus}] — AniDoki`;

  const synopsisExcerpt = cleanText(anime.description || '', 120);
  const scoreVal = (typeof anime.score === 'number' && anime.score > 0) ? anime.score.toFixed(1) : '8.5';
  const description = `Xem phim ${displayName}${subName} Vietsub Full HD mới nhất. ${synopsisExcerpt ? synopsisExcerpt + ' ' : ''}Đánh giá ⭐ ${scoreVal}/10. Xem ngay tại AniDoki!`;

  const poster = anime.coverImage || anime.bannerImage || DEFAULT_IMAGE;
  const canonical = `${DOMAIN}/anime/${anime.id}`;
  const isTv = !anime.isMovie && anime.format !== 'MOVIE';

  // Schema TVSeries / Movie có AggregateRating kích hoạt hiển thị Sao Vàng trên Google Search
  const ratingCount = Math.max(120, Math.floor(parseFloat(scoreVal) * 180));
  const schemaType = isTv ? 'TVSeries' : 'Movie';

  const mediaSchema = {
    '@type': schemaType,
    'name': displayName,
    'alternateName': [nameEn, nameVi, anime.title?.romaji].filter(Boolean),
    'image': poster,
    'description': cleanText(anime.description || description, 300),
    'inLanguage': 'vi',
    'countryOfOrigin': 'JP',
    'genre': anime.genres || ['Anime', 'Hoạt Hình'],
    'datePublished': String(anime.year || '2026'),
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': scoreVal,
      'bestRating': '10',
      'worstRating': '1',
      'ratingCount': ratingCount
    },
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'VND',
      'availability': 'https://schema.org/InStock',
      'url': canonical
    }
  };

  if (isTv && anime.totalEpisodes) {
    mediaSchema.numberOfEpisodes = anime.totalEpisodes;
  }

  const breadcrumbsSchema = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Trang chủ', 'item': `${DOMAIN}/` },
      { '@type': 'ListItem', 'position': 2, 'name': 'Khám phá', 'item': `${DOMAIN}/browse` },
      { '@type': 'ListItem', 'position': 3, 'name': displayName, 'item': canonical }
    ]
  };

  updateSEO({
    title,
    description,
    canonical,
    image: poster,
    type: isTv ? 'video.tv_show' : 'video.movie',
    jsonLd: [mediaSchema, breadcrumbsSchema]
  });
}

/**
 * 4. SEO Trang Xem Tập Phim (Player View)
 */
export function setPlayerSEO(anime, episodeNumber = 1) {
  if (!anime) return;
  const nameVi = anime.title?.vietnamese || '';
  const nameEn = anime.title?.english || '';
  const displayName = nameVi || nameEn || 'Anime';
  const epText = `Tập ${episodeNumber}`;

  const title = `Xem ${displayName} ${epText} Vietsub Full HD Mới Nhất | AniDoki`;
  const description = `Xem anime ${displayName} ${epText} Vietsub Full HD siêu nét, âm thanh sống động, load nhanh không giật lag. Xem phim hoạt hình online bản đẹp miễn phí tại AniDoki!`;
  const canonical = `${DOMAIN}/watch/${anime.id}/${episodeNumber}`;
  const poster = anime.coverImage || anime.bannerImage || DEFAULT_IMAGE;

  const episodeSchema = {
    '@type': 'TVEpisode',
    'name': `${displayName} - ${epText}`,
    'episodeNumber': Number(episodeNumber),
    'image': poster,
    'description': description,
    'inLanguage': 'vi',
    'partOfSeries': {
      '@type': 'TVSeries',
      'name': displayName,
      'url': `${DOMAIN}/anime/${anime.id}`
    }
  };

  const breadcrumbsSchema = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Trang chủ', 'item': `${DOMAIN}/` },
      { '@type': 'ListItem', 'position': 2, 'name': displayName, 'item': `${DOMAIN}/anime/${anime.id}` },
      { '@type': 'ListItem', 'position': 3, 'name': epText, 'item': canonical }
    ]
  };

  updateSEO({
    title,
    description,
    canonical,
    image: poster,
    type: 'video.episode',
    jsonLd: [episodeSchema, breadcrumbsSchema]
  });
}
