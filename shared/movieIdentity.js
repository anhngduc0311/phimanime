const normalize = text => text.normalize('NFKC').toLowerCase().replace(/["'’]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function movieIdentityKeys(item) {
  const titles = Object.values(item.title || {}).filter(Boolean);
  const all = [...titles, ...(item.aliases || [])].filter(Boolean);
  const special = /\b(?:OVA|ONA|special)\b/i.test(all.join(' ')) ? 'special:' : 'movie:';
  const explicit = /\b(?:movie|gekijouban)\b/i.test(all.join(' '));
  const keys = new Set((explicit || special === 'special:' ? all : titles).map(title => special + normalize(
    title.replace(/\b(?:movie|film)\s*1\b/gi, 'Movie').replace(/\b(?:movie|film|gekijouban)\b/gi, ' ')
  )));
  if (explicit && special === 'movie:') {
    for (const title of all) {
      const numbered = title.match(/^(.+?)\s+(?:movie|film)\s*(\d+)\b/i);
      if (numbered) keys.add('numbered:' + normalize(numbered[1]) + ':' + numbered[2]);
    }
  }
  return [...keys];
}

export function compatibleMovie(a, b) {
  if (a.year && b.year && Number(a.year) !== Number(b.year)) return false;
  if (a.seriesId && b.seriesId && a.seriesId !== b.seriesId) return false;
  return true;
}
