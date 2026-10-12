// Public slugs can change without changing persisted provider IDs or watch progress.
export function publicAnimeId(id) {
  return String(id).replace(/^anime47-/, 'anido-');
}

export function internalAnimeId(id) {
  return String(id).replace(/^anido-/, 'anime47-');
}

export function publicAnimeUrl(url) {
  return url.replace(/^(\/(?:anime|watch)\/)anime47-/, '$1anido-');
}

export function internalAnimeUrl(url) {
  return url.replace(/^(\/(?:anime|watch)\/)anido-/, '$1anime47-');
}
