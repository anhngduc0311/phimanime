import { publicAnimeId } from '../../../shared/animeUrls.js';
import { listing, genreOptions } from './kkphim.service.js';
import { AdminAnimeModel } from '../models/adminAnime.model.js';

const sitemapCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 giờ

export function clearSitemapCache() {
  sitemapCache.clear();
}

const DOMAIN = process.env.SITE_URL || 'https://anidoki.com';
const SITE_NAME = 'AniDoki';
const DEFAULT_IMAGE = `${DOMAIN}/brand/anidoki-white.svg`;

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateRobotsTxt() {
  return `# robots.txt for AniDoki (${DOMAIN})
User-agent: *
Allow: /
Allow: /browse*
Allow: /anime/*
Allow: /watch/*
Allow: /help
Disallow: /admin*
Disallow: /account*
Disallow: /library*
Disallow: /history*
Disallow: /api/*

User-agent: Googlebot-Image
Allow: /
Allow: /assets/*
Allow: /brand/*
Allow: /*.jpg$
Allow: /*.jpeg$
Allow: /*.png$
Allow: /*.webp$
Allow: /*.svg$

# Sitemaps
Sitemap: ${DOMAIN}/sitemap.xml
Sitemap: ${DOMAIN}/sitemap-main.xml
Sitemap: ${DOMAIN}/sitemap-genres.xml
Sitemap: ${DOMAIN}/sitemap-anime.xml

Host: ${DOMAIN.replace(/^https?:\/\//, '')}
`;
}

export function generateSitemapIndex() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${DOMAIN}/sitemap-main.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${DOMAIN}/sitemap-genres.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${DOMAIN}/sitemap-anime.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${DOMAIN}/sitemap-anime-1.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${DOMAIN}/sitemap-anime-2.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${DOMAIN}/sitemap-anime-3.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;
}

export function generateMainSitemap() {
  const now = new Date().toISOString().split('T')[0];
  const pages = [
    { url: '/', changefreq: 'daily', priority: '1.0' },
    { url: '/browse', changefreq: 'daily', priority: '0.95' },
    { url: '/browse?sort=updated', changefreq: 'daily', priority: '0.9' },
    { url: '/browse?sort=score', changefreq: 'daily', priority: '0.9' },
    { url: '/browse?status=ongoing', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?status=completed', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?type=movie', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?category=hanh-dong', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?category=phieu-luu', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?category=tinh-cam', changefreq: 'daily', priority: '0.85' },
    { url: '/help', changefreq: 'monthly', priority: '0.5' }
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  for (const page of pages) {
    xml += `
  <url>
    <loc>${escapeXml(DOMAIN + page.url)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }

  xml += `
</urlset>`;
  return xml;
}

export async function generateGenresSitemap() {
  const cached = sitemapCache.get('sitemap-genres.xml');
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const now = new Date().toISOString().split('T')[0];
  let genres = [];
  try {
    genres = await genreOptions();
  } catch {
    genres = [
      { name: 'Hành Động', slug: 'hanh-dong' },
      { name: 'Phiêu Lưu', slug: 'phieu-luu' },
      { name: 'Hài Hước', slug: 'hai-huoc' },
      { name: 'Tình Cảm', slug: 'tinh-cam' },
      { name: 'Tâm Lý', slug: 'tam-ly' },
      { name: 'Khoa Học', slug: 'khoa-hoc' },
      { name: 'Viễn Tưởng', slug: 'vien-tuong' },
      { name: 'Kinh Dị', slug: 'kinh-di' },
      { name: 'Bí Ẩn', slug: 'bi-an' },
      { name: 'Học Đường', slug: 'hoc-duong' },
      { name: 'Thể Thao', slug: 'the-thao' },
      { name: 'Thần Thoại', slug: 'than-thoai' },
      { name: 'Võ Thuật', slug: 'vo-thuat' },
      { name: 'Chính Kịch', slug: 'chinh-kich' },
      { name: 'Cổ Trang', slug: 'co-trang' },
      { name: 'Gia Đình', slug: 'gia-dinh' },
      { name: 'Chiến Tranh', slug: 'chien-tranh' },
      { name: 'Hình Sự', slug: 'hinh-su' },
      { name: 'Âm Nhạc', slug: 'am-nhac' },
      { name: 'Trẻ Em', slug: 'tre-em' },
      { name: 'Tài Liệu', slug: 'tai-lieu' },
      { name: 'Kinh Điển', slug: 'kinh-dien' },
      { name: 'Phim Ngắn', slug: 'phim-ngan' },
      { name: 'Phim 18+', slug: 'phim-18' }
    ];
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  for (const g of genres) {
    if (!g.slug) continue;
    xml += `
  <url>
    <loc>${DOMAIN}/browse?category=${encodeURIComponent(g.slug)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  sitemapCache.set('sitemap-genres.xml', { data: xml, expiry: Date.now() + CACHE_TTL_MS });
  return xml;
}

export async function generateAnimeSitemap(page = null) {
  const cacheKey = page ? `sitemap-anime-${page}.xml` : 'sitemap-anime.xml';
  const cached = sitemapCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  let animeList = [];
  const seen = new Set();

  const addItems = (items) => {
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (item && item.id && !seen.has(item.id)) {
          seen.add(item.id);
          animeList.push(item);
        }
      });
    }
  };

  try {
    if (page) {
      // Tải một trang cụ thể
      const res = await listing({ page: String(page), limit: '64' });
      addItems(res?.items);
    } else {
      // Tải nhiều trang cho sitemap chính tổng hợp
      const pagesToFetch = ['1', '2', '3', '4', '5', '6'];
      const results = await Promise.allSettled(
        pagesToFetch.map(p => listing({ page: p, limit: '64' }))
      );
      results.forEach(res => {
        if (res.status === 'fulfilled' && res.value?.items) {
          addItems(res.value.items);
        }
      });
    }
  } catch (err) {
    console.warn('Sitemap anime fetch error:', err);
  }

  // Bổ sung các anime có override từ database
  try {
    const overrides = await AdminAnimeModel.getAllAnimeOverrides();
    overrides.forEach((ov, slug) => {
      if (!ov.is_hidden && !seen.has(slug)) {
        seen.add(slug);
        animeList.push({
          id: slug,
          title: { vietnamese: ov.title_vietnamese, english: ov.title_english },
          coverImage: ov.cover_image,
          updatedAt: ov.updated_at
        });
      }
    });
  } catch {}

  const defaultDate = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">`;

  for (const a of animeList) {
    if (!a.id) continue;
    const title = a.title?.vietnamese || a.title?.english || a.id;
    const cleanDate = a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : defaultDate;
    const poster = a.coverImage || a.posterUrl;
    const animeSlug = escapeXml(publicAnimeId(a.id));

    // URL trang chi tiết anime
    xml += `
  <url>
    <loc>${DOMAIN}/anime/${animeSlug}</loc>
    <lastmod>${cleanDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>`;

    if (poster && poster.startsWith('http')) {
      xml += `
    <image:image>
      <image:loc>${escapeXml(poster)}</image:loc>
      <image:title>${escapeXml(title)} Vietsub Full HD</image:title>
      <image:caption>Xem anime ${escapeXml(title)} online Vietsub Full HD miễn phí tại AniDoki</image:caption>
    </image:image>`;
    }

    xml += `
  </url>`;

    // URL xem tập đầu tiên (kèm Google Video Sitemap Schema)
    xml += `
  <url>
    <loc>${DOMAIN}/watch/${animeSlug}/1</loc>
    <lastmod>${cleanDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>`;

    if (poster && poster.startsWith('http')) {
      xml += `
    <video:video>
      <video:thumbnail_loc>${escapeXml(poster)}</video:thumbnail_loc>
      <video:title>Xem ${escapeXml(title)} Tập 1 Vietsub Full HD</video:title>
      <video:description>Xem phim hoạt hình ${escapeXml(title)} Tập 1 bản đẹp Vietsub Full HD online tại AniDoki</video:description>
      <video:player_loc>${DOMAIN}/watch/${animeSlug}/1</video:player_loc>
      <video:publication_date>${cleanDate}T00:00:00+07:00</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
      <video:requires_subscription>no</video:requires_subscription>
    </video:video>`;
    }

    xml += `
  </url>`;
  }

  xml += `
</urlset>`;

  sitemapCache.set(cacheKey, { data: xml, expiry: Date.now() + CACHE_TTL_MS });
  return xml;
}
