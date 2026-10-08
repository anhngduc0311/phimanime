import { listing, genreOptions } from './kkphim.service.js';
import { AdminAnimeModel } from '../models/adminAnime.model.js';

let sitemapCache = new Map();
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 giờ

export function clearSitemapCache() {
  sitemapCache.clear();
  cacheExpiry = 0;
}

const DOMAIN = process.env.SITE_URL || 'https://anidoki.com';

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
  return `# robots.txt for AniDoki (https://anidoki.com)
User-agent: *
Allow: /
Allow: /browse*
Allow: /anime/*
Allow: /watch/*
Allow: /help
Disallow: /admin*
Disallow: /account*
Disallow: /api/admin*
Disallow: /api/account*
Disallow: /api/auth*

# Sitemaps
Sitemap: ${DOMAIN}/sitemap.xml
Sitemap: ${DOMAIN}/sitemap-main.xml
Sitemap: ${DOMAIN}/sitemap-genres.xml
Sitemap: ${DOMAIN}/sitemap-anime.xml
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
    { url: '/browse?category=hanh-dong', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?category=phieu-luu', changefreq: 'daily', priority: '0.85' },
    { url: '/browse?category=tinh-cam', changefreq: 'daily', priority: '0.85' },
    { url: '/library', changefreq: 'weekly', priority: '0.6' },
    { url: '/history', changefreq: 'monthly', priority: '0.4' },
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
    xml += `
  <url>
    <loc>${DOMAIN}/browse?category=${encodeURIComponent(g.slug)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
</urlset>`;
  return xml;
}

export async function generateAnimeSitemap() {
  const cached = sitemapCache.get('sitemap-anime.xml');
  if (cached && Date.now() < cacheExpiry) {
    return cached;
  }

  let animeList = [];
  try {
    // Thu thập danh sách anime từ nhiều trang danh mục
    const [p1, p2, p3] = await Promise.allSettled([
      listing({ page: '1', limit: '64' }),
      listing({ page: '2', limit: '64' }),
      listing({ page: '3', limit: '64' })
    ]);

    const seen = new Set();
    const addItems = (res) => {
      if (res.status === 'fulfilled' && Array.isArray(res.value?.items)) {
        res.value.items.forEach(item => {
          if (item && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            animeList.push(item);
          }
        });
      }
    };

    addItems(p1);
    addItems(p2);
    addItems(p3);
  } catch (err) {
    console.warn('Sitemap anime listing error:', err);
  }

  // Bổ sung các anime có override từ database
  try {
    const overrides = await AdminAnimeModel.getAllAnimeOverrides();
    overrides.forEach((ov, slug) => {
      if (!ov.is_hidden && !animeList.some(a => a.id === slug)) {
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
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

  for (const a of animeList) {
    if (!a.id) continue;
    const title = a.title?.vietnamese || a.title?.english || a.id;
    const cleanDate = a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : defaultDate;
    const poster = a.coverImage || a.posterUrl;

    // URL trang chi tiết anime
    xml += `
  <url>
    <loc>${DOMAIN}/anime/${escapeXml(a.id)}</loc>
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

    // URL xem tập đầu tiên
    xml += `
  <url>
    <loc>${DOMAIN}/watch/${escapeXml(a.id)}/1</loc>
    <lastmod>${cleanDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  sitemapCache.set('sitemap-anime.xml', xml);
  cacheExpiry = Date.now() + CACHE_TTL_MS;

  return xml;
}
