# NguonC

API documentation: https://phim.nguonc.com/api-document

- Search and browse keyword queries combine AniDoki and NguonC results. NguonC summaries are hydrated to accept only Japanese animation; search is capped at five upstream pages, with five concurrent detail requests and a five-minute bounded cache.
- NguonC routes use `nguonc-<slug>` to avoid collisions with existing catalog, library and history IDs.
- Season discovery matches provider series IDs or exact normalized title aliases. The explicit Bookworm mapping in `shared/providers.js` reconciles its 2026 sequel with release-order season 4. Sources of the same season and year share one season button.
- The player switches source by navigating to that provider's route at the selected episode number. Missing episodes return to details instead of silently playing episode 1.
- Embedded players run in a sandbox permitting scripts, their own origin and presentation. Popups, top-level navigation, forms and downloads are not permitted. This limits disruptive advertising actions; it does not filter network requests or remove in-player video ads. Direct HLS playback is preferred when the source supplies it.
- Only HTTPS PhimAPI player URLs and NguonC's numbered `embed*.streamc.xyz/embed.php` hosts are accepted. The browser loads the validated iframe directly. Server-side embed probes are not used as a playback gate: bot protection may treat Node requests differently from browser requests.

## Verified on 2026-10-04

Bookworm metadata and episode lists resolve for seasons 1–4 (14, 12, 10, 24 episodes). NguonC embeds returned HTTP 403 in server checks; the browser redirected to the provider landing page. The earlier server-side playback gate has been removed; upstream playback remains unverified and may still redirect or be blocked. Season 4 remains available through the existing AniDoki source. No proxy or access-control bypass is implemented.

Validation: `npm test --workspace server`, focused provider/season tests, web production build, local API checks and browser source-switch check.
