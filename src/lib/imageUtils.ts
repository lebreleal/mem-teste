/**
 * Client-side image compression utility.
 * Uses browser-image-compression for robust, high-quality compression before upload.
 */

import imageCompression from 'browser-image-compression';

const DEFAULT_OPTIONS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
  fileType: 'image/webp',
};

/**
 * Compress an image file before uploading to Supabase Storage.
 * Returns the original file unchanged for non-image inputs or if compression fails.
 */
export async function compressImage(
  file: File,
  overrides?: Partial<typeof DEFAULT_OPTIONS>,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  // Already small enough — skip
  if (file.size < 100_000) return file;

  try {
    const opts = { ...DEFAULT_OPTIONS, ...overrides };
    const compressed = await imageCompression(file, opts);

    // Keep original if compression made it larger
    if (compressed.size >= file.size) return file;

    const ext = compressed.type.includes('webp') ? 'webp' : 'jpg';
    return new File(
      [compressed],
      file.name.replace(/\.[^.]+$/, `.${ext}`),
      { type: compressed.type },
    );
  } catch {
    return file; // fallback on any error
  }
}
