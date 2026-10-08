const primary = 'anime_primary';
const extra = 'anime_nguonc';
let syncing;
let extraReady;
let unavailableUntil = 0;

export async function meiliRequest(path, method = 'GET', body) {
  if (!process.env.MEILI_MASTER_KEY) throw new Error('Meilisearch chưa được cấu hình');
  const response = await fetch((process.env.MEILI_URL || 'http://127.0.0.1:7700') + path, {
    method, signal: AbortSignal.timeout(2500),
    headers: { Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json();
  if (!response.ok) { const error = new Error(`Meilisearch: ${result.code || response.status}`); error.status = response.status; throw error; }
  return result;
}

async function waitTask(task) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await meiliRequest('/tasks/' + task.taskUid);
    if (result.status === 'succeeded') return;
    if (['failed', 'canceled'].includes(result.status)) throw new Error(`Meilisearch indexing: ${result.error?.code || result.status}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Meilisearch indexing timed out');
}

async function ensureIndex(uid) {
  try { await meiliRequest('/indexes/' + uid); }
  catch (error) {
    if (error.status !== 404) throw error;
    await waitTask(await meiliRequest('/indexes', 'POST', { uid, primaryKey: 'id' }));
  }
}

async function settings(uid) {
  await waitTask(await meiliRequest(`/indexes/${uid}/settings`, 'PATCH', {
    searchableAttributes: ['title.vietnamese', 'title.english', 'title.romaji', 'aliases'],
    displayedAttributes: ['id', 'anime'],
    pagination: { maxTotalHits: 20000 }
  }));
}

export function searchDocument(item) {
  const { episodes, seasons, notes, ...anime } = item;
  return { id: item.id, title: item.title, aliases: item.aliases || [], anime };
}

export async function syncPrimarySearch(items) {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!items.length) throw new Error('Không thay thế chỉ mục bằng danh mục rỗng');
    const staging = primary + '_next';
    await ensureIndex(primary);
    await ensureIndex(staging);
    await waitTask(await meiliRequest(`/indexes/${staging}/documents`, 'DELETE'));
    await settings(staging);
    for (let offset = 0; offset < items.length; offset += 500) {
      await waitTask(await meiliRequest(`/indexes/${staging}/documents`, 'POST', items.slice(offset, offset + 500).map(searchDocument)));
    }
    await waitTask(await meiliRequest('/swap-indexes', 'POST', [{ indexes: [primary, staging] }]));
    unavailableUntil = 0;
    return items.length;
  })();
  try { return await syncing; } finally { syncing = null; }
}

export async function indexNguoncSearch(items) {
  if (!items.length || !process.env.MEILI_MASTER_KEY) return;
  if (!extraReady) {
    extraReady = (async () => { await ensureIndex(extra); await settings(extra); })();
    extraReady.catch(() => { extraReady = null; });
  }
  await extraReady;
  await waitTask(await meiliRequest(`/indexes/${extra}/documents`, 'POST', items.map(searchDocument)));
}

export async function searchIndex(keyword, uid, request = meiliRequest) {
  const items = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const result = await request(`/indexes/${uid}/search`, 'POST', { q: keyword, limit: 1000, offset, matchingStrategy: 'all' });
    if (!Array.isArray(result.hits)) throw new Error('Meilisearch trả dữ liệu không hợp lệ');
    items.push(...result.hits.map(hit => hit.anime).filter(Boolean));
    if (result.hits.length < 1000) break;
  }
  return items;
}

// null means use the existing upstream search; [] is a valid empty result.
export async function searchMeili(keyword) {
  if (!process.env.MEILI_MASTER_KEY || Date.now() < unavailableUntil) return null;
  try {
    const stats = await meiliRequest(`/indexes/${primary}/stats`);
    if (!stats.numberOfDocuments) return null;
    const [main, supplemental] = await Promise.all([
      searchIndex(keyword, primary),
      searchIndex(keyword, extra).catch(error => { if (error.status === 404) return []; throw error; })
    ]);
    return [...main, ...supplemental];
  } catch {
    unavailableUntil = Date.now() + 10000;
    return null;
  }
}
