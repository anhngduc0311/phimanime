import {
  generateRobotsTxt,
  generateSitemapIndex,
  generateMainSitemap,
  generateGenresSitemap,
  generateAnimeSitemap
} from '../services/sitemap.service.js';

export const SeoController = {
  getRobots(req, res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(generateRobotsTxt());
  },

  getSitemapIndex(req, res) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(generateSitemapIndex());
  },

  getMainSitemap(req, res) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(generateMainSitemap());
  },

  async getGenresSitemap(req, res) {
    try {
      const xml = await generateGenresSitemap();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(xml);
    } catch (err) {
      console.error('Error generating genres sitemap:', err);
      res.status(500).send('Error generating sitemap');
    }
  },

  async getAnimeSitemap(req, res) {
    try {
      const xml = await generateAnimeSitemap();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(xml);
    } catch (err) {
      console.error('Error generating anime sitemap:', err);
      res.status(500).send('Error generating sitemap');
    }
  }
};
