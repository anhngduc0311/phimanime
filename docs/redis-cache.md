# Catalog cache

Start Redis: `docker compose up -d redis`.
Health check: `docker compose exec redis redis-cli ping`.

The API defaults to `redis://127.0.0.1:6380` (override with `REDIS_URL`).
If the API is containerized on the same Compose network, use `redis://redis:6379`.
Set `REDIS_DISABLED=1` for memory-only operation.

Redis is bound to loopback, has a 128 MB eviction limit, and persists cache in
the `anidoki_redis_data` volume. Only catalog data is cached; database records,
sessions and watch history are not moved into Redis.

Full upstream browse listings, NguonC searches and grouped/sorted catalogs are
cached for five minutes. Up to thirty minutes old data can be served while a
background refresh runs; expired data must be loaded again. Concurrent loads
of the same key within the API process share one task. The memory fallback
holds at most 20 entries. Redis failures do not fail catalog requests.

Admin overrides are read on each request before computing the grouped cache
key, so hiding or editing an anime does not wait for cache expiration. Keys
also include upstream content and sort order; pagination reuses grouped data.

The first request for an uncached filter still needs the upstream catalog.
Subsequent pages and requests reuse it, including after API process restarts.
