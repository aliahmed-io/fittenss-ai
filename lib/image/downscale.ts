/** Downscales an image data URL to a max edge and re-encodes as JPEG to cut upload size. */
export async function downscaleImage(
  dataUrl: string,
  maxEdge = 1280,
  quality = 0.85
): Promise<{ base64: string; mimeType: 'image/jpeg' }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('The selected file could not be read as an image.'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0, width, height);

  const out = canvas.toDataURL('image/jpeg', quality);
  return { base64: out.split(',')[1] ?? '', mimeType: 'image/jpeg' };
}
