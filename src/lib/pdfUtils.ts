import * as pdfjsLib from 'pdfjs-dist';

// Dynamically match the installed pdfjs-dist version
const PDFJS_VERSION = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

export interface PDFPageData {
  pageNumber: number;
  thumbnailUrl: string; // data URL
  textContent: string;
}

/**
 * Extract pages from a PDF file as thumbnails + text
 */
export async function extractPDFPages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PDFPageData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages: PDFPageData[] = [];

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(i, totalPages);
    const page = await pdf.getPage(i);

    // Render thumbnail (small for UI)
    const thumbViewport = page.getViewport({ scale: 0.4 });
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbViewport.width;
    thumbCanvas.height = thumbViewport.height;
    const thumbCtx = thumbCanvas.getContext('2d')!;
    await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
    const thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    // Extract text
    const textData = await page.getTextContent();
    const textContent = textData.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({ pageNumber: i, thumbnailUrl, textContent });
  }

  return pages;
}

/**
 * Split plain text into "pages" (chunks of ~2000 chars)
 */
export function splitTextIntoPages(text: string, chunkSize = 2000): { pageNumber: number; textContent: string }[] {
  // 1. Primary split: double newlines (standard paragraphs)
  let paragraphs = text.split(/\n{2,}/);

  // 2. Fallback: if any chunk is still too large, re-split by single newlines
  if (paragraphs.some(p => p.length > chunkSize)) {
    paragraphs = paragraphs.flatMap(p =>
      p.length > chunkSize ? p.split(/\n/) : [p]
    );
  }

  // 3. Final fallback: force-split blocks with no line breaks at nearest space
  paragraphs = paragraphs.flatMap(p => {
    if (p.length <= chunkSize) return [p];
    const subChunks: string[] = [];
    let remaining = p;
    while (remaining.length > chunkSize) {
      let cutAt = remaining.lastIndexOf(' ', chunkSize);
      if (cutAt <= 0) cutAt = chunkSize;
      subChunks.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt).trimStart();
    }
    if (remaining) subChunks.push(remaining);
    return subChunks;
  });

  const pages: { pageNumber: number; textContent: string }[] = [];
  let current = '';
  let pageNum = 1;

  for (const para of paragraphs) {
    if (current.length + para.length > chunkSize && current.length > 0) {
      pages.push({ pageNumber: pageNum++, textContent: current.trim() });
      current = '';
    }
    current += para + '\n\n';
  }
  if (current.trim()) {
    pages.push({ pageNumber: pageNum, textContent: current.trim() });
  }

  return pages.length > 0 ? pages : [{ pageNumber: 1, textContent: text.trim() }];
}
