// API and navigation URLs stay on the main website; only static files use this base.
export function publicAsset(path) {
  return `${import.meta.env?.BASE_URL || '/'}${path.replace(/^\/+/, '')}`;
}

export const POSTER_PLACEHOLDER = publicAsset('poster-placeholder.svg');
