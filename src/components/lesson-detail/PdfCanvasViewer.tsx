/**
 * PDF Canvas Viewer — renders pages to canvas, supports restricted preview (25%).
 */

import { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';

interface PdfCanvasViewerProps {
  url: string;
  restricted: boolean;
}

const PdfCanvasViewer = ({ url, restricted }: PdfCanvasViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(0);
  const [allowedPages, setAllowedPages] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const renderPdf = async () => {
      setLoading(true);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        const total = pdf.numPages;
        const maxPages = restricted ? Math.ceil(total * 0.25) : total;
        setTotalPages(total);
        setAllowedPages(maxPages);
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let i = 1; i <= maxPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '8px';
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          container.appendChild(canvas);
        }
      } catch (err) {
        console.error('PDF render error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [url, restricted]);

  return (
    <div className="flex-1 relative overflow-auto">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      <div ref={containerRef} className="px-2 py-2" />
      {restricted && !loading && totalPages > allowedPages && (
        <div className="sticky bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background via-background/90 to-transparent flex flex-col items-center justify-end pb-4">
          <Lock className="h-5 w-5 mb-2" style={{ color: 'hsl(270 60% 55%)' }} />
          <p className="text-sm font-semibold text-foreground">Conteúdo restrito</p>
          <p className="text-xs text-muted-foreground">
            Mostrando {allowedPages} de {totalPages} páginas · Assine para ver tudo
          </p>
        </div>
      )}
    </div>
  );
};

export default PdfCanvasViewer;
