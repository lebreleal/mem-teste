/**
 * Client-side image compression utility.
 * Resizes large images and converts to WebP before upload.
 */

export async function compressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.82
): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);

      // Already small enough — skip compression
      if (img.width <= maxWidth && file.size < 300_000) {
        resolve(file);
        return;
      }

      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // fallback if compressed is larger
            return;
          }
          const ext = blob.type.includes('webp') ? 'webp' : 'jpg';
          resolve(
            new File(
              [blob],
              file.name.replace(/\.[^.]+$/, `.${ext}`),
              { type: blob.type }
            )
          );
        },
        'image/webp',
        quality
      );
    };
    img.onerror = () => resolve(file); // fallback on error
    img.src = URL.createObjectURL(file);
  });
}
