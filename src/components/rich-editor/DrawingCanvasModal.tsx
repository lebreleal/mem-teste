/**
 * DrawingCanvasModal — Modal drawing canvas.
 * Produces a PNG data URL that gets uploaded to Supabase storage.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X, Undo2, Redo2 } from 'lucide-react';

const COLORS = [
  '#2E2E2E', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
];

const THICKNESSES = [2, 4, 6, 8, 10];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export default function DrawingCanvasModal({ open, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [thickness, setThickness] = useState(4);
  const [opacity, setOpacity] = useState(100);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Resize canvas to container
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      const initial = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([initial]);
      setHistoryIdx(0);
    };

    // Delay to let dialog render
    const t = setTimeout(resize, 50);
    return () => clearTimeout(t);
  }, [open]);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0 : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacity / 100;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.globalAlpha = 1;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => {
      const next = prev.slice(0, historyIdx + 1);
      next.push(imageData);
      return next;
    });
    setHistoryIdx(prev => prev + 1);
  };

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const newIdx = historyIdx - 1;
    ctx.putImageData(history[newIdx], 0, 0);
    setHistoryIdx(newIdx);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const newIdx = historyIdx + 1;
    ctx.putImageData(history[newIdx], 0, 0);
    setHistoryIdx(newIdx);
  }, [history, historyIdx]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="p-0 gap-0 w-[calc(100%-0px)] max-w-[calc(100%-0px)] sm:max-w-lg h-[80dvh] max-h-[80dvh] flex flex-col overflow-hidden rounded-xl [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground">Tela</span>
          <div className="flex items-center gap-1.5">
            <button onClick={undo} disabled={historyIdx <= 0} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-accent transition-colors disabled:opacity-30">
              <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={redo} disabled={historyIdx >= history.length - 1} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-accent transition-colors disabled:opacity-30">
              <Redo2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <Button size="sm" className="rounded-full px-4 h-7 text-xs font-semibold" onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </div>

        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 min-h-0 bg-white overflow-hidden">
          <canvas
            ref={canvasRef}
            className="touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="px-3 py-2.5 border-t border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            {/* Thickness */}
            <div className="flex items-center gap-1">
              {THICKNESSES.map(t => (
                <button
                  key={t}
                  onClick={() => setThickness(t)}
                  className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                    thickness === t ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-accent'
                  }`}
                >
                  <span
                    className="rounded-full bg-foreground"
                    style={{ width: t + 2, height: t + 2 }}
                  />
                </button>
              ))}
            </div>

            {/* Opacity */}
            <div className="flex-1 min-w-0">
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            {/* Color picker */}
            <div className="flex items-center gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                    color === c ? 'border-primary scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
