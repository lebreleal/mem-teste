import * as pdfjsLib from 'pdfjs-dist';

// Dynamically match the installed pdfjs-dist version
const PDFJS_VERSION = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

export interface PDFPageData {
  pageNumber: number;
  thumbnailUrl: string; // data URL
  textContent: string;
  imageBase64?: string; // base64 image for AI vision
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

    // Render full-res image for AI vision
    const aiViewport = page.getViewport({ scale: 1.0 });
    const aiCanvas = document.createElement('canvas');
    aiCanvas.width = aiViewport.width;
    aiCanvas.height = aiViewport.height;
    const aiCtx = aiCanvas.getContext('2d')!;
    await page.render({ canvasContext: aiCtx, viewport: aiViewport }).promise;
    const imageBase64 = aiCanvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // raw base64

    // Extract text
    const textData = await page.getTextContent();
    const textContent = textData.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({ pageNumber: i, thumbnailUrl, textContent, imageBase64 });
  }

  return pages;
}

/**
 * Split plain text into "pages" (chunks of ~2000 chars)
 */
export function splitTextIntoPages(text: string, chunkSize = 2000): { pageNumber: number; textContent: string }[] {
  const paragraphs = text.split(/\n{2,}/);
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
