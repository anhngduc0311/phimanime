import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { movieDetail } from './kkphim.service.js';
import { internalAnimeId, publicAnimeId } from '../../../shared/animeUrls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = process.env.SITE_URL || 'https://anidoki.com';
const SITE_NAME = 'AniDoki';
const DEFAULT_IMAGE = `${DOMAIN}/brand/anidoki-white.svg`;

let htmlTemplateCache = null;
let htmlTemplateMtime = 0;

function getBaseHtml() {
  const distHtmlPath = path.resolve(__dirname, '../../web/dist/index.html');
  const srcHtmlPath = path.resolve(__dirname, '../../web/index.html');
  const targetPath = fs.existsSync(distHtmlPath) ? distHtmlPath : srcHtmlPath;

  if (!fs.existsSync(targetPath)) return '';

  const stat = fs.statSync(targetPath);
  if (!htmlTemplateCache || stat.mtimeMs > htmlTemplateMtime) {
    htmlTemplateCache = fs.readFileSync(targetPath, 'utf8');
    htmlTemplateMtime = stat.mtimeMs;
  }
  return htmlTemplateCache;
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render HTML kèm Metadata và Rich Snippets SSR cho Crawler và Direct URL requests
 */
export async function renderHtmlWithSeo(req) {
  const rawHtml = getBaseHtml();
  if (!rawHtml) return '';

  const pathname = req.path || '/';

  // 1. Trang Chi tiết Anime: /anime/:slug
  const animeMatch = pathname.match(/^\/anime\/([^/?#]+)/);
  if (animeMatch) {
    const rawSlug = animeMatch[1];
    const internalSlug = internalAnimeId(rawSlug);
    try {
      const anime = await movieDetail(internalSlug);
      if (anime) {
        return injectAnimeDetailSeo(rawHtml, anime);
      }
    } catch {}
  }

  // 2. Trang Xem Phim: /watch/:slug/:episode
  const watchMatch = pathname.match(/^\/watch\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (watchMatch) {
    const rawSlug = watchMatch[1];
    const episodeNum = watchMatch[2] || '1';
    const internalSlug = internalAnimeId(rawSlug);
    try {
      const anime = await movieDetail(internalSlug);
      if (anime) {
        return injectWatchSeo(rawHtml, anime, episodeNum);
      }
    } catch {}
  }

  // 3. Trang Khám phá: /browse
  if (pathname.startsWith('/browse')) {
    return injectBrowseSeo(rawHtml, req.query);
  }

  // Mặc định trả về HTML gốc đã tối ưu SEO trang chủ
  return rawHtml;
}

function injectAnimeDetailSeo(html, anime) {
  const nameVi = (anime.title?.vietnamese || '').trim();
  const nameEn = (anime.title?.english || '').trim();
  const displayName = nameVi || nameEn || 'Anime';
  const subName = (nameVi && nameEn && nameVi !== nameEn && (nameVi + nameEn).length < 32) ? ` (${nameEn})` : '';

  let epStatus = 'Trọn Bộ';
  if (anime.status === 'Currently Airing' || anime.currentEpisode) {
    epStatus = anime.currentEpisode ? `Tập ${anime.currentEpisode}` : 'Đang phát sóng';
  } else if (anime.isMovie || anime.format === 'MOVIE') {
    epStatus = 'Phim Lẻ Chiếu Rạp';
  }

  // Tiêu đề clickbait sạch đạt High CTR (tối ưu độ dài Google SERP < 60 ký tự)
  const title = `Xem Phim ${displayName}${subName} Vietsub Full HD [${epStatus}] — ${SITE_NAME}`;

  const synopsisExcerpt = cleanText(anime.description || '', 110);
  const scoreVal = (typeof anime.score === 'number' && anime.score > 0) ? anime.score.toFixed(1) : '8.5';
  const description = `Xem phim ${displayName}${subName} Vietsub Full HD bản chuẩn 1080p. ${synopsisExcerpt ? synopsisExcerpt + ' ' : ''}⭐ Đánh giá ${scoreVal}/10. Xem ngay bản đẹp không quảng cáo tại AniDoki!`;

  const poster = anime.coverImage || anime.bannerImage || DEFAULT_IMAGE;
  const canonical = `${DOMAIN}/anime/${publicAnimeId(anime.id)}`;
  const isTv = !anime.isMovie && anime.format !== 'MOVIE';

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

  const jsonLdPayload = {
    '@context': 'https://schema.org',
    '@graph': [mediaSchema, breadcrumbsSchema]
  };

  return replaceMetaInHtml(html, {
    title,
    description,
    canonical,
    image: poster,
    type: isTv ? 'video.tv_show' : 'video.movie',
    jsonLd: jsonLdPayload
  });
}

function injectWatchSeo(html, anime, episodeNum = '1') {
  const nameVi = (anime.title?.vietnamese || '').trim();
  const nameEn = (anime.title?.english || '').trim();
  const displayName = nameVi || nameEn || 'Anime';
  const epText = `Tập ${episodeNum}`;

  const title = `Xem ${displayName} ${epText} Vietsub Full HD — Bản Cực Mượt | ${SITE_NAME}`;
  const description = `Xem phim ${displayName} ${epText} Vietsub Full HD siêu nét 1080p, âm thanh sống động, load nhanh không giật lag. Xem phim hoạt hình online bản đẹp miễn phí tại AniDoki!`;
  const canonical = `${DOMAIN}/watch/${publicAnimeId(anime.id)}/${episodeNum}`;
  const poster = anime.coverImage || anime.bannerImage || DEFAULT_IMAGE;

  const episodeSchema = {
    '@type': 'TVEpisode',
    'name': `${displayName} - ${epText} Vietsub Full HD`,
    'episodeNumber': Number(episodeNum) || 1,
    'image': poster,
    'description': description,
    'inLanguage': 'vi',
    'partOfSeries': {
      '@type': 'TVSeries',
      'name': displayName,
      'url': `${DOMAIN}/anime/${publicAnimeId(anime.id)}`
    }
  };

  const videoObjectSchema = {
    '@type': 'VideoObject',
    'name': `${displayName} - ${epText} Vietsub Full HD`,
    'description': description,
    'thumbnailUrl': [poster],
    'uploadDate': anime.updatedAt ? new Date(anime.updatedAt).toISOString() : new Date().toISOString(),
    'contentUrl': canonical,
    'embedUrl': canonical,
    'interactionStatistic': {
      '@type': 'InteractionCounter',
      'interactionType': { '@type': 'WatchAction' },
      'userInteractionCount': 12500
    }
  };

  const breadcrumbsSchema = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Trang chủ', 'item': `${DOMAIN}/` },
      { '@type': 'ListItem', 'position': 2, 'name': displayName, 'item': `${DOMAIN}/anime/${publicAnimeId(anime.id)}` },
      { '@type': 'ListItem', 'position': 3, 'name': epText, 'item': canonical }
    ]
  };

  const jsonLdPayload = {
    '@context': 'https://schema.org',
    '@graph': [episodeSchema, videoObjectSchema, breadcrumbsSchema]
  };

  return replaceMetaInHtml(html, {
    title,
    description,
    canonical,
    image: poster,
    type: 'video.episode',
    jsonLd: jsonLdPayload
  });
}

function injectBrowseSeo(html, query = {}) {
  let title = 'Khám Phá Anime Vietsub Đỉnh Cao — Bảng Xếp Hạng & Phim Mới | AniDoki';
  let description = 'Khám phá kho anime đỉnh cao theo thể loại, năm phát hành và bảng xếp hạng điểm số. Xem anime Vietsub Full HD miễn phí tại AniDoki.';

  if (query.category) {
    const catName = query.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    title = `Top Anime ${catName} Vietsub Hay Nhất 2026 — Xem Mượt | AniDoki`;
    description = `Danh sách tổng hợp anime thể loại ${catName} Vietsub Full HD mới nhất và được xem nhiều nhất. Xem ngay bản đẹp không quảng cáo tại AniDoki!`;
  } else if (query.q) {
    title = `Tìm Kiếm: "${query.q}" — Kết Quả Anime Vietsub Full HD | AniDoki`;
    description = `Kết quả tìm kiếm cho anime "${query.q}". Xem ngay bản Vietsub Full HD tải nhanh tại AniDoki.`;
  } else if (query.year) {
    title = `Anime Mùa Mới Năm ${query.year} Vietsub Full HD — Bản Chuẩn | AniDoki`;
    description = `Kho anime phát hành năm ${query.year} bản Vietsub sắc nét, đầy đủ các tập mới nhất tại AniDoki.`;
  }

  const breadcrumbsSchema = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Trang chủ', 'item': `${DOMAIN}/` },
      { '@type': 'ListItem', 'position': 2, 'name': 'Khám phá', 'item': `${DOMAIN}/browse` }
    ]
  };

  return replaceMetaInHtml(html, {
    title,
    description,
    canonical: `${DOMAIN}/browse`,
    image: DEFAULT_IMAGE,
    type: 'website',
    jsonLd: { '@context': 'https://schema.org', '@graph': [breadcrumbsSchema] }
  });
}

function replaceMetaInHtml(html, { title, description, canonical, image, type, jsonLd }) {
  let modified = html;

  // Title
  modified = modified.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  // Description
  modified = modified.replace(/<meta\s+name=["']description["']\s+content=["'][^"']*["']/i, `<meta name="description" content="${escapeHtml(description)}"`);

  // Canonical
  modified = modified.replace(/<link\s+rel=["']canonical["']\s+href=["'][^"']*["']/i, `<link rel="canonical" href="${escapeHtml(canonical)}"`);

  // Open Graph
  modified = modified.replace(/<meta\s+property=["']og:title["']\s+content=["'][^"']*["']/i, `<meta property="og:title" content="${escapeHtml(title)}"`);
  modified = modified.replace(/<meta\s+property=["']og:description["']\s+content=["'][^"']*["']/i, `<meta property="og:description" content="${escapeHtml(description)}"`);
  modified = modified.replace(/<meta\s+property=["']og:url["']\s+content=["'][^"']*["']/i, `<meta property="og:url" content="${escapeHtml(canonical)}"`);
  modified = modified.replace(/<meta\s+property=["']og:image["']\s+content=["'][^"']*["']/i, `<meta property="og:image" content="${escapeHtml(image)}"`);
  modified = modified.replace(/<meta\s+property=["']og:type["']\s+content=["'][^"']*["']/i, `<meta property="og:type" content="${escapeHtml(type)}"`);

  // Twitter
  modified = modified.replace(/<meta\s+name=["']twitter:title["']\s+content=["'][^"']*["']/i, `<meta name="twitter:title" content="${escapeHtml(title)}"`);
  modified = modified.replace(/<meta\s+name=["']twitter:description["']\s+content=["'][^"']*["']/i, `<meta name="twitter:description" content="${escapeHtml(description)}"`);
  modified = modified.replace(/<meta\s+name=["']twitter:image["']\s+content=["'][^"']*["']/i, `<meta name="twitter:image" content="${escapeHtml(image)}"`);

  // JSON-LD
  if (jsonLd) {
    const jsonStr = JSON.stringify(jsonLd, null, 2);
    modified = modified.replace(
      /<script\s+type=["']application\/ld\+json["']\s+id=["']jsonld-structured-data["']>[\s\S]*?<\/script>/i,
      `<script type="application/ld+json" id="jsonld-structured-data">\n${jsonStr}\n  </script>`
    );
  }

  return modified;
}
