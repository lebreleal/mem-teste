/**
 * DrawingCanvasModal — Modal drawing canvas.
 * Produces a PNG data URL that gets uploaded to Supabase storage.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X, Undo2, Redo2 } from 'lucide-react';

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

  // Parse initial color to HSL on mount
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
      setBright(Math.round(l * 200)); // rough
    }
  }, []);

  // Draw wheel
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

  // Draw brightness bar
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

  // Wheel indicator position
  const rad = (hue * Math.PI) / 180;
  const indicatorDist = (sat / 100) * 48; // 48% of container
  const ix = 50 + (indicatorDist * Math.cos(rad));
  const iy = 50 + (indicatorDist * Math.sin(rad));

  return (
    <div className="p-3 space-y-3">
      {/* Color wheel */}
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
        {/* Indicator */}
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
      {/* Brightness slider */}
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

export default function DrawingCanvasModal({ open, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#3b82f6');
  const [thickness, setThickness] = useState(2);
  const [opacity, setOpacity] = useState(100);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showColorPicker, setShowColorPicker] = useState(false);

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

          {/* Row 1: Thickness label + icons */}
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-1.5">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0">Espessura</span>
            <div className="flex items-center gap-0.5">
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
          </div>

          {/* Row 2: Opacity + color circle */}
          <div className="flex items-center gap-3 px-3 pb-2.5">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0">Opacidade</span>
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
                className="relative w-full [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_[data-orientation=horizontal]>.bg-primary]:bg-transparent [&_[data-orientation=horizontal]]:bg-transparent"
              />
            </div>

            {/* Color circle button */}
            <button
              onClick={() => setShowColorPicker(p => !p)}
              className="h-7 w-7 rounded-full border-2 border-border shadow-sm shrink-0 transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
              title="Cor"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
