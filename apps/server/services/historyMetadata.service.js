export function historyFallback(animeId) {
  const name = String(animeId).replace(/^(?:anime47|nguonc)-/i, '').replace(/-/g, ' ');
  return {
    id: animeId, title: { english: name || 'Phim đang cập nhật', vietnamese: name || 'Phim đang cập nhật' },
    coverImage: '/poster-placeholder.svg', bannerImage: '/poster-placeholder.svg', metadataPending: true
  };
}

export function needsHistoryMetadata(item) {
  const anime = item.anime;
  const title = typeof anime?.title === 'string' ? anime.title : anime?.title?.english || anime?.title?.vietnamese;
  return !title || title === item.animeId || anime.metadataPending || /^(?:anime47|nguonc)-/.test(title);
}

export async function repairHistoryMetadata(items, resolve, persist) {
  const output = [...items];
  for (let start = 0; start < items.length; start += 4) {
    await Promise.all(items.slice(start, start + 4).map(async (item, offset) => {
      if (!needsHistoryMetadata(item)) return;
      let anime;
      try {
        anime = await resolve(item.animeId);
        if (!anime || needsHistoryMetadata({ animeId: item.animeId, anime })) throw new Error('Incomplete metadata');
        await persist(item.animeId, anime);
      } catch { anime = historyFallback(item.animeId); }
      output[start + offset] = { ...item, anime };
    }));
  }
  return output;
}
