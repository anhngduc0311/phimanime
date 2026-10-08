// Only wait for images in the initial viewport, never lazy content or video.
export async function waitForStartupAssets() {
  const images = [...document.images].filter(image => {
    const rect = image.getBoundingClientRect();
    return image.loading !== 'lazy' && rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.top < window.innerHeight
      && rect.right > 0 && rect.left < window.innerWidth;
  });
  let timeout;
  try {
    await Promise.race([
      Promise.allSettled([
        document.fonts?.ready,
        ...images.map(image => image.decode()),
      ]),
      new Promise(resolve => { timeout = window.setTimeout(resolve, 4000); }),
    ]);
  } finally {
    window.clearTimeout(timeout);
  }
}
