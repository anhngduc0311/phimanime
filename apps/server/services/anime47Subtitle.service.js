import { randomBytes } from 'node:crypto';
import { anime47MediaHeaders } from './anime47Media.service.js';

const tickets = new Map();
const TTL = 4 * 60 * 60 * 1000;

export function allowedAnime47Subtitle(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['anime47.love', 'anime47.best'].includes(url.hostname) &&
      /^\/subtitles\/\d+\/[a-zA-Z0-9_.-]+\.vtt$/.test(url.pathname);
  } catch { return false; }
}

export function anime47SubtitleUrl(value) {
  if (!allowedAnime47Subtitle(value)) throw new Error('Nguồn phụ đề chưa được hỗ trợ');
  for (const [key, entry] of tickets) {
    if (entry.until <= Date.now()) tickets.delete(key);
    else if (entry.url === value) return '/api/watch/anime47/subtitles/' + key;
  }
  if (tickets.size >= 2000) tickets.delete(tickets.keys().next().value);
  const key = randomBytes(24).toString('hex');
  tickets.set(key, { url: value, until: Date.now() + TTL });
  return '/api/watch/anime47/subtitles/' + key;
}

export async function serveAnime47Subtitle(req, res) {
  const entry = tickets.get(req.params.ticket);
  if (!entry || entry.until <= Date.now()) return res.sendStatus(404);
  try {
    const upstream = await fetch(entry.url, {
      headers: anime47MediaHeaders(), redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) throw new Error('Subtitle unavailable');
    const chunks = [];
    let size = 0;
    for await (const chunk of upstream.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw new Error('Subtitle too large');
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.replace(/^\uFEFF/, '').startsWith('WEBVTT')) throw new Error('Invalid subtitle');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.type('text/vtt').send(text);
  } catch {
    res.status(502).json({ success: false, message: 'Không tải được phụ đề Việt.' });
  }
}
