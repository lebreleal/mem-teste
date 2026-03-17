/**
 * DrawingCanvasModal — Full-screen drawing canvas.
 * Produces a PNG data URL that gets uploaded to Supabase storage.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
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
      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      // Save initial state
      const initial = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([initial]);
      setHistoryIdx(0);
    };

    // Small delay to let modal render
    requestAnimationFrame(resize);
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
    // Save to history
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors">
          <X className="h-5 w-5 text-foreground" />
        </button>
        <span className="text-base font-semibold text-foreground">Tela</span>
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={historyIdx <= 0} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors disabled:opacity-30">
            <Undo2 className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors disabled:opacity-30">
            <Redo2 className="h-4 w-4 text-muted-foreground" />
          </button>
          <Button size="sm" className="rounded-full px-5 font-semibold" onClick={handleSave}>
            Salvar
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 min-h-0 bg-white">
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
      <div className="px-4 py-3 border-t border-border bg-card space-y-3">
        <div className="flex items-center gap-6">
          {/* Thickness */}
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Espessura</span>
            <div className="flex items-center gap-1.5">
              {THICKNESSES.map(t => (
                <button
                  key={t}
                  onClick={() => setThickness(t)}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${
                    thickness === t ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-accent'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 10 + t * 2, height: 10 + t * 2 }}>
                    <path d="M14.78 10.746 13 11l.254-1.78a1 1 0 0 1 .283-.565l3.65-3.65 1.807 1.809-3.65 3.649a1 1 0 0 1-.565.283M19.704 6.104l-1.808-1.808 1.026-1.026a1 1 0 0 1 1.414 0l.394.394a1 1 0 0 1 0 1.414zM11.873 11.354c-1.267-1.35-2.71-2.42-4.034-2.934-.66-.257-1.366-.405-2.039-.31-.714.1-1.35.473-1.756 1.147-.443.735-.579 1.498-.465 2.241.11.718.441 1.357.833 1.899.746 1.035 1.867 1.93 2.675 2.576l.065.051q.415.33.763.605c.835.659 1.397 1.102 1.771 1.523.217.244.31.42.352.558.026.09.041.2.026.35h-.032c-.343-.006-.892-.137-1.582-.413-1.366-.548-2.897-1.509-3.743-2.354a1 1 0 0 0-1.414 1.415c1.078 1.076 2.855 2.17 4.413 2.795.772.31 1.588.544 2.293.556.353.006.766-.042 1.142-.244.415-.223.716-.598.832-1.083.129-.542.136-1.07-.018-1.59-.152-.511-.437-.939-.774-1.318-.503-.567-1.256-1.16-2.12-1.839q-.322-.253-.66-.523c-.868-.693-1.792-1.436-2.367-2.235-.28-.388-.433-.73-.478-1.03-.042-.275-.004-.567.201-.908.07-.115.152-.175.321-.199.211-.03.556.007 1.037.194.958.372 2.161 1.225 3.3 2.439a1 1 0 1 0 1.458-1.369" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Opacity */}
          <div className="flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Opacidade</span>
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
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === c ? 'border-primary scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
