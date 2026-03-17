/**
 * DrawingCanvasModal — Modal drawing canvas.
 * Produces a PNG data URL that gets uploaded to Supabase storage.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X, Undo2, Redo2 } from 'lucide-react';
import {
  canInitializeCanvas,
  clamp,
  getCanvasBitmapMetrics,
  getMidpoint,
  getRelativePoint,
  type CanvasBitmapMetrics,
  type RelativePoint,
} from '@/components/rich-editor/drawingCanvasUtils';

const STROKE_PATH = 'M7.5 18s6.269-1.673 9.5-7c1.601-2.64-6.5-.5-8-3-1.16-2.5 8-3 8-3';
const THICKNESSES = [1, 2, 4, 6, 8];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

/* ─── Color Wheel Picker ─── */
function ColorWheelPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const brightnessRef = useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = useState(200);
  const [sat, setSat] = useState(100);
  const [bright, setBright] = useState(100);

  useEffect(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = color;
    const hex = ctx.fillStyle;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h = 0;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      setHue(Math.round(h * 360));
      setSat(Math.round(s * 100));
      setBright(Math.round(l * 200));
    }
  }, []);

  useEffect(() => {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, radius = size / 2 - 2;
    ctx.clearRect(0, 0, size, size);
    for (let angle = 0; angle < 360; angle++) {
      const startAngle = (angle - 1) * Math.PI / 180;
      const endAngle = (angle + 1) * Math.PI / 180;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `hsl(${angle}, 10%, 100%)`);
      gradient.addColorStop(0.5, `hsl(${angle}, 100%, 50%)`);
      gradient.addColorStop(1, `hsl(${angle}, 100%, 50%)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    const canvas = brightnessRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, `hsl(${hue}, ${sat}%, 0%)`);
    grad.addColorStop(0.5, `hsl(${hue}, ${sat}%, 50%)`);
    grad.addColorStop(1, `hsl(${hue}, ${sat}%, 100%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, [hue, sat]);

  const emitColor = (h: number, s: number, b: number) => {
    onChange(`hsl(${h}, ${s}%, ${Math.min(b, 95)}%)`);
  };

  const handleWheelClick = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = wheelRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2;
    const dist = Math.sqrt(x * x + y * y);
    if (dist > radius) return;
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const s = Math.min(100, Math.round((dist / radius) * 100));
    setHue(Math.round(angle));
    setSat(s);
    emitColor(Math.round(angle), s, bright);
  };

  const handleBrightnessClick = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = brightnessRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const b = Math.round((x / rect.width) * 100);
    setBright(b);
    emitColor(hue, sat, b);
  };

  const rad = (hue * Math.PI) / 180;
  const indicatorDist = (sat / 100) * 48;
  const ix = 50 + (indicatorDist * Math.cos(rad));
  const iy = 50 + (indicatorDist * Math.sin(rad));

  return (
    <div className="p-3 space-y-3">
      <div className="relative mx-auto" style={{ width: 180, height: 180 }}>
        <canvas
          ref={wheelRef}
          width={180}
          height={180}
          className="rounded-full cursor-crosshair"
          style={{ width: 180, height: 180 }}
          onClick={handleWheelClick}
          onTouchMove={handleWheelClick}
        />
        <div
          className="absolute w-5 h-5 rounded-full border-[3px] border-white shadow-md pointer-events-none"
          style={{
            left: `${ix}%`,
            top: `${iy}%`,
            transform: 'translate(-50%, -50%)',
            backgroundColor: `hsl(${hue}, ${sat}%, ${Math.min(bright, 95)}%)`,
          }}
        />
      </div>
      <div className="relative mx-auto" style={{ width: 180, height: 24 }}>
        <canvas
          ref={brightnessRef}
          width={180}
          height={24}
          className="rounded-full cursor-pointer"
          style={{ width: 180, height: 24 }}
          onClick={handleBrightnessClick}
          onTouchMove={handleBrightnessClick}
        />
        <div
          className="absolute top-1/2 w-5 h-5 rounded-full border-[3px] border-white shadow-md pointer-events-none"
          style={{
            left: `${bright}%`,
            transform: 'translate(-50%, -50%)',
            backgroundColor: `hsl(${hue}, ${sat}%, ${Math.min(bright, 95)}%)`,
          }}
        />
      </div>
    </div>
  );
}

/* ─── Diagonal split color/opacity circle (SVG) ─── */
function OpacityColorCircle({ color, opacity }: { color: string; opacity: number }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
      <defs>
        <clipPath id="oc-top">
          <polygon points="0,0 28,0 0,28" />
        </clipPath>
        <clipPath id="oc-bottom">
          <polygon points="28,0 28,28 0,28" />
        </clipPath>
        {/* Checkerboard pattern for transparency */}
        <pattern id="oc-checker" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="white" />
          <rect width="3" height="3" fill="#d1d5db" />
          <rect x="3" y="3" width="3" height="3" fill="#d1d5db" />
        </pattern>
      </defs>
      {/* Full color top-left diagonal */}
      <circle cx="14" cy="14" r="13" fill={color} clipPath="url(#oc-top)" />
      {/* Checkerboard + transparent color bottom-right diagonal */}
      <circle cx="14" cy="14" r="13" fill="url(#oc-checker)" clipPath="url(#oc-bottom)" />
      <circle cx="14" cy="14" r="13" fill={color} opacity={opacity / 100} clipPath="url(#oc-bottom)" />
      {/* Border */}
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="14" cy="14" r="13.5" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
    </svg>
  );
}

export default function DrawingCanvasModal({ open, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState('#3b82f6');
  const [thickness, setThickness] = useState(2);
  const [opacity, setOpacity] = useState(100);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const historyIdxRef = useRef(-1);
  const colorRef = useRef(color);
  const thicknessRef = useRef(thickness);
  const opacityRef = useRef(opacity);
  const hasInteractionRef = useRef(false);
  const lastPointRef = useRef<RelativePoint | null>(null);
  const lastMidPointRef = useRef<RelativePoint | null>(null);
  const bitmapMetricsRef = useRef<CanvasBitmapMetrics | null>(null);

  historyRef.current = history;
  historyIdxRef.current = historyIdx;
  colorRef.current = color;
  thicknessRef.current = thickness;
  opacityRef.current = opacity;

  useEffect(() => {
    if (!open) {
      hasInteractionRef.current = false;
      isDrawingRef.current = false;
      activePointerIdRef.current = null;
      lastPointRef.current = null;
      lastMidPointRef.current = null;
      bitmapMetricsRef.current = null;
      setShowColorPicker(false);
      return;
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const syncCanvasToContainer = (rect: DOMRectReadOnly) => {
      if (!canInitializeCanvas(rect.width, rect.height)) return;

      const dpr = window.devicePixelRatio || 1;
      const nextMetrics = getCanvasBitmapMetrics(rect.width, rect.height, dpr);
      const previousMetrics = bitmapMetricsRef.current;

      if (
        canvas.width === nextMetrics.pixelWidth
        && canvas.height === nextMetrics.pixelHeight
        && previousMetrics
      ) {
        bitmapMetricsRef.current = nextMetrics;
        return;
      }

      const previousCanvas = document.createElement('canvas');
      let hasPreviousBitmap = false;

      if (previousMetrics && canvas.width > 0 && canvas.height > 0) {
        previousCanvas.width = canvas.width;
        previousCanvas.height = canvas.height;
        const previousCtx = previousCanvas.getContext('2d');
        if (previousCtx) {
          previousCtx.drawImage(canvas, 0, 0);
          hasPreviousBitmap = true;
        }
      }

      canvas.width = nextMetrics.pixelWidth;
      canvas.height = nextMetrics.pixelHeight;
      bitmapMetricsRef.current = nextMetrics;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(nextMetrics.dpr, 0, 0, nextMetrics.dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, nextMetrics.cssWidth, nextMetrics.cssHeight);

      if (hasPreviousBitmap && previousMetrics) {
        ctx.drawImage(
          previousCanvas,
          0,
          0,
          previousMetrics.cssWidth,
          previousMetrics.cssHeight,
          0,
          0,
          nextMetrics.cssWidth,
          nextMetrics.cssHeight,
        );
      }

      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([snapshot]);
      setHistoryIdx(0);
    };

    const syncFromDom = () => {
      syncCanvasToContainer(container.getBoundingClientRect());
    };

    let frameA = 0;
    let frameB = 0;

    frameA = requestAnimationFrame(() => {
      syncFromDom();
      frameB = requestAnimationFrame(syncFromDom);
    });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncCanvasToContainer(entry.contentRect);
      }
    });

    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameA);
      cancelAnimationFrame(frameB);
      ro.disconnect();
    };
  }, [open]);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const getPos = useCallback((clientX: number, clientY: number): RelativePoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const point = getRelativePoint(rect, clientX, clientY);

    return {
      x: clamp(point.x, 0, rect.width),
      y: clamp(point.y, 0, rect.height),
    };
  }, []);

  const applyBrushStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = colorRef.current;
    ctx.fillStyle = colorRef.current;
    ctx.lineWidth = thicknessRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacityRef.current / 100;
  }, []);

  // Use pointer events + pointer capture for full-area precise drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;

    const drawDot = (ctx: CanvasRenderingContext2D, point: RelativePoint) => {
      ctx.save();
      applyBrushStyle(ctx);
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(thicknessRef.current / 2, 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawCurveToPoint = (ctx: CanvasRenderingContext2D, point: RelativePoint) => {
      const lastPoint = lastPointRef.current;
      if (!lastPoint) {
        lastPointRef.current = point;
        lastMidPointRef.current = point;
        drawDot(ctx, point);
        return;
      }

      const nextMidPoint = getMidpoint(lastPoint, point);
      const startPoint = lastMidPointRef.current ?? lastPoint;

      ctx.save();
      applyBrushStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, nextMidPoint.x, nextMidPoint.y);
      ctx.stroke();
      ctx.restore();

      lastPointRef.current = point;
      lastMidPointRef.current = nextMidPoint;
    };

    const finishStroke = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      lastPointRef.current = null;
      lastMidPointRef.current = null;

      const ctx = getCtx();
      if (!ctx || !canvas) return;

      ctx.globalAlpha = 1;
      ctx.beginPath();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const idx = historyIdxRef.current;
      setHistory((prev) => {
        const next = prev.slice(0, idx + 1);
        next.push(imageData);
        return next;
      });
      setHistoryIdx(idx + 1);
    };

    const stopPointer = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      canvas.releasePointerCapture?.(e.pointerId);
      activePointerIdRef.current = null;
      finishStroke();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      e.preventDefault();
      const ctx = getCtx();
      if (!ctx) return;

      const pos = getPos(e.clientX, e.clientY);
      activePointerIdRef.current = e.pointerId;
      isDrawingRef.current = true;
      hasInteractionRef.current = true;
      lastPointRef.current = pos;
      lastMidPointRef.current = pos;
      canvas.setPointerCapture?.(e.pointerId);

      drawDot(ctx, pos);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current || activePointerIdRef.current !== e.pointerId) return;

      e.preventDefault();
      const ctx = getCtx();
      if (!ctx) return;

      drawCurveToPoint(ctx, getPos(e.clientX, e.clientY));
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', stopPointer, { passive: false });
    window.addEventListener('pointercancel', stopPointer);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopPointer);
      window.removeEventListener('pointercancel', stopPointer);
    };
  }, [applyBrushStyle, getPos, open]);

  const restoreSnapshot = useCallback((snapshot: ImageData) => {
    const ctx = getCtx();
    const metrics = bitmapMetricsRef.current;
    if (!ctx || !metrics) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(snapshot, 0, 0);
    ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
  }, []);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const newIdx = historyIdx - 1;
    restoreSnapshot(history[newIdx]);
    setHistoryIdx(newIdx);
  }, [history, historyIdx, restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const newIdx = historyIdx + 1;
    restoreSnapshot(history[newIdx]);
    setHistoryIdx(newIdx);
  }, [history, historyIdx, restoreSnapshot]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="p-0 gap-0 w-[calc(100%-16px)] max-w-4xl h-[80dvh] max-h-[80dvh] flex flex-col overflow-hidden rounded-2xl [&>button]:hidden">
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

        {/* Canvas area — fills all remaining space */}
        <div ref={containerRef} className="flex-1 min-h-0 bg-white relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none cursor-crosshair"
          />
        </div>

        {/* Bottom toolbar */}
        <div className="border-t border-border bg-card shrink-0 relative">
          {/* Color wheel popover */}
          {showColorPicker && (
            <div className="absolute bottom-full right-2 mb-2 bg-card border border-border rounded-2xl shadow-xl z-50">
              <ColorWheelPicker
                color={color}
                onChange={(c) => setColor(c)}
              />
            </div>
          )}

          {/* Row 1: Thickness icons */}
          <div className="flex items-center justify-center gap-0.5 px-3 pt-2.5 pb-1.5">
            {THICKNESSES.map(t => (
              <button
                key={t}
                onClick={() => setThickness(t)}
                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${
                  thickness === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d={STROKE_PATH}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth={t}
                  />
                </svg>
              </button>
            ))}
          </div>

          {/* Row 2: Opacity slider + color circle */}
          <div className="flex items-center gap-3 px-3 pb-2.5">
            <div className="flex-1 min-w-0 relative">
              {/* Checkerboard + gradient background */}
              <div
                className="absolute inset-y-0 left-0 right-0 rounded-full overflow-hidden"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, transparent, ${color}),
                    repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)
                  `,
                  backgroundSize: '100% 100%, 8px 8px',
                }}
              />
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={10}
                max={100}
                step={5}
                className="relative w-full [&_[role=slider]]:bg-white [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_[data-orientation=horizontal]>.bg-primary]:bg-transparent [&_[data-orientation=horizontal]]:bg-transparent"
              />
            </div>

            {/* Color circle with diagonal opacity preview */}
            <button
              onClick={() => setShowColorPicker(p => !p)}
              className="shrink-0 transition-transform hover:scale-110"
              title="Cor"
            >
              <OpacityColorCircle color={color} opacity={opacity} />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
