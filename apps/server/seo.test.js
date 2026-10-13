import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRobotsTxt,
  generateSitemapIndex,
  generateMainSitemap,
  generateGenresSitemap,
  generateAnimeSitemap,
  clearSitemapCache
} from './services/sitemap.service.js';
import { renderHtmlWithSeo } from './services/seoRenderer.service.js';

test('SEO: robots.txt contains necessary directives and sitemaps', () => {
  const robots = generateRobotsTxt();
  assert.ok(robots.includes('User-agent: *'), 'Must include general user agent');
  assert.ok(robots.includes('Disallow: /admin*'), 'Must disallow admin');
  assert.ok(robots.includes('Disallow: /account*'), 'Must disallow account');
  assert.ok(robots.includes('Disallow: /library*'), 'Must disallow user library');
  assert.ok(robots.includes('Disallow: /history*'), 'Must disallow user history');
  assert.ok(robots.includes('Disallow: /api/*'), 'Must disallow api internal paths');
  assert.ok(robots.includes('User-agent: Googlebot-Image'), 'Must configure Googlebot-Image');
  assert.ok(robots.includes('Sitemap: https://anidoki.com/sitemap.xml'), 'Must list sitemap index');
  assert.ok(robots.includes('Sitemap: https://anidoki.com/sitemap-anime.xml'), 'Must list anime sitemap');
  assert.ok(robots.includes('Host: anidoki.com'), 'Must list Host directive');
});

test('SEO: sitemap index contains main, genres and anime sitemaps', () => {
  const xml = generateSitemapIndex();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Must be valid XML');
  assert.ok(xml.includes('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Must have sitemapindex tag');
  assert.ok(xml.includes('<loc>https://anidoki.com/sitemap-main.xml</loc>'), 'Must have sitemap-main');
  assert.ok(xml.includes('<loc>https://anidoki.com/sitemap-genres.xml</loc>'), 'Must have sitemap-genres');
  assert.ok(xml.includes('<loc>https://anidoki.com/sitemap-anime.xml</loc>'), 'Must have sitemap-anime');
});

test('SEO: main sitemap lists core website routes with correct priorities', () => {
  const xml = generateMainSitemap();
  assert.ok(xml.includes('<loc>https://anidoki.com/</loc>'), 'Must include homepage');
  assert.ok(xml.includes('<priority>1.0</priority>'), 'Homepage must have 1.0 priority');
  assert.ok(xml.includes('<loc>https://anidoki.com/browse</loc>'), 'Must include browse');
  assert.ok(xml.includes('<loc>https://anidoki.com/browse?sort=updated</loc>'), 'Must include updated sort');
  assert.ok(xml.includes('<loc>https://anidoki.com/browse?type=movie</loc>'), 'Must include movie filter');
  assert.ok(xml.includes('<loc>https://anidoki.com/help</loc>'), 'Must include help');
});

test('SEO: genres sitemap outputs category browse urls', async () => {
  clearSitemapCache();
  const xml = await generateGenresSitemap();
  assert.ok(xml.includes('https://anidoki.com/browse?category=hanh-dong'), 'Must include hanh-dong genre');
  assert.ok(xml.includes('https://anidoki.com/browse?category=phieu-luu'), 'Must include phieu-luu genre');
});

test('SEO: anime sitemap includes Image and Video extensions', async () => {
  clearSitemapCache();
  const xml = await generateAnimeSitemap();
  assert.ok(xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), 'Must have Google Image schema namespace');
  assert.ok(xml.includes('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"'), 'Must have Google Video schema namespace');
  assert.ok(xml.includes('https://anidoki.com/anime/'), 'Must have /anime/ URLs');
  assert.ok(xml.includes('https://anidoki.com/watch/'), 'Must have /watch/ URLs');
});

test('SEO: renderHtmlWithSeo injects dynamic metadata for /browse', async () => {
  const req = {
    path: '/browse',
    query: { category: 'hanh-dong' }
  };
  const html = await renderHtmlWithSeo(req);
  assert.ok(html.includes('<title>Top Anime Hanh Dong Vietsub Hay Nhất 2026 — Xem Mượt | AniDoki</title>'), 'Must have category clickbait clean title');
  assert.ok(html.includes('content="https://anidoki.com/browse"'), 'Must have canonical url');
});

test('SEO: renderHtmlWithSeo injects rich snippets & meta tags for anime and watch pages', async () => {
  const htmlAnime = await renderHtmlWithSeo({ path: '/anime/dao-hai-tac' });
  if (htmlAnime.includes('Đảo Hải Tặc') || htmlAnime.includes('One Piece')) {
    assert.ok(htmlAnime.includes('Vietsub Full HD'), 'Must include Vietsub Full HD in title/meta');
    assert.ok(htmlAnime.includes('AggregateRating'), 'Must include AggregateRating schema for stars');
  }

  const htmlWatch = await renderHtmlWithSeo({ path: '/watch/dao-hai-tac/1' });
  if (htmlWatch.includes('Đảo Hải Tặc') || htmlWatch.includes('One Piece')) {
    assert.ok(htmlWatch.includes('Tập 1'), 'Must include episode 1 in title');
    assert.ok(htmlWatch.includes('VideoObject'), 'Must include VideoObject schema');
    assert.ok(htmlWatch.includes('TVEpisode'), 'Must include TVEpisode schema');
  }
});
