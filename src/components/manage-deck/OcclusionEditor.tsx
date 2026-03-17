/**
 * Occlusion Editor — full-screen on mobile, supports rect, polygon, freehand, eraser.
 * Colors group shapes: same color = same card, different color = different cards.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Undo2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { compressImage } from '@/lib/imageUtils';
import { useToast } from '@/hooks/use-toast';

type Tool = 'rect' | 'polygon' | 'freehand' | 'eraser';

interface OcclusionShape {
  id: string;
  type: 'rect' | 'polygon' | 'freehand';
  x?: number; y?: number; w?: number; h?: number;
  points?: { x: number; y: number }[];
  color?: string;
}

interface OcclusionEditorProps {
  initialFront: string;
  onSave: (front: string, back: string) => void;
  onCancel: () => void;
  onRemoveImage?: () => void;
  isSaving: boolean;
}

/* ─── SVG Icons ─── */
const IconRect = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className="h-5 w-5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);
const IconPolygon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className="h-5 w-5">
    <path d="M12 2l9 7-3.5 10h-11L3 9z" />
  </svg>
);
const IconFreehand = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" className="h-5 w-5">
    <path d="M7.5 18s6.269-1.673 9.5-7c1.601-2.64-6.5-.5-8-3-1.16-2.5 8-3 8-3" />
  </svg>
);
const IconEraser = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className="h-5 w-5">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
);
const IconZoomIn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
  </svg>
);
const IconZoomOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M8 11h6" />
  </svg>
);
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-muted-foreground">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

const COLORS = [
  { fill: 'rgba(59,130,246,0.6)', border: 'rgba(59,130,246,0.9)', label: 'Azul' },
  { fill: 'rgba(239,68,68,0.55)', border: 'rgba(239,68,68,0.9)', label: 'Vermelho' },
  { fill: 'rgba(34,197,94,0.55)', border: 'rgba(34,197,94,0.9)', label: 'Verde' },
  { fill: 'rgba(234,179,8,0.55)', border: 'rgba(234,179,8,0.9)', label: 'Amarelo' },
  { fill: 'rgba(168,85,247,0.55)', border: 'rgba(168,85,247,0.9)', label: 'Roxo' },
  { fill: 'rgba(249,115,22,0.55)', border: 'rgba(249,115,22,0.9)', label: 'Laranja' },
  { fill: 'rgba(20,184,166,0.55)', border: 'rgba(20,184,166,0.9)', label: 'Teal' },
  { fill: 'rgba(0,0,0,0.6)', border: 'rgba(0,0,0,0.85)', label: 'Preto' },
];

const getColorObj = (fill: string) => COLORS.find(c => c.fill === fill) || COLORS[0];

const OcclusionEditor = ({ initialFront, onSave, onCancel, onRemoveImage, isSaving }: OcclusionEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState('');
  const [shapes, setShapes] = useState<OcclusionShape[]>([]);
  const [history, setHistory] = useState<OcclusionShape[][]>([]);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('rect');
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shapeColor, setShapeColor] = useState(COLORS[0].fill);

  // Push to history before any shape mutation
  const pushHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-20), shapes]);
  }, [shapes]);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setShapes(last);
      return prev.slice(0, -1);
    });
  }, []);

  // Parse initial data
  useEffect(() => {
    if (!initialFront) return;
    try {
      const data = JSON.parse(initialFront);
      if (data.imageUrl) setImageUrl(data.imageUrl);
      if (data.allRects) {
        const converted: OcclusionShape[] = data.allRects.map((r: any) => ({
          id: r.id || crypto.randomUUID(),
          type: r.type || 'rect',
          color: r.color || COLORS[0].fill,
          ...(r.type === 'polygon' || r.type === 'freehand'
            ? { points: r.points }
            : { x: r.x, y: r.y, w: r.w, h: r.h }),
        }));
        setShapes(converted);
      }
    } catch {}
  }, [initialFront]);

  const handleImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    setImgLoaded(true);
  };

  const getDisplaySize = useCallback(() => {
    const container = containerRef.current;
    if (!container || imgSize.w === 0) return { w: 0, h: 0, scale: 1 };
    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    const scale = Math.min(maxW / imgSize.w, maxH / imgSize.h, 1) * zoom;
    return { w: imgSize.w * scale, h: imgSize.h * scale, scale };
  }, [imgSize, zoom]);

  const displaySize = getDisplaySize();
  const scale = displaySize.scale || 1;

  const toImgCoords = (clientX: number, clientY: number) => {
    const el = containerRef.current?.querySelector('.occlusion-img-wrapper');
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const hitTest = (pos: { x: number; y: number }) => {
    return [...shapes].reverse().find(s => {
      if (s.type === 'rect') return pos.x >= s.x! && pos.x <= s.x! + s.w! && pos.y >= s.y! && pos.y <= s.y! + s.h!;
      if (s.points && s.points.length > 2) {
        const xs = s.points.map(p => p.x);
        const ys = s.points.map(p => p.y);
        return pos.x >= Math.min(...xs) && pos.x <= Math.max(...xs) && pos.y >= Math.min(...ys) && pos.y <= Math.max(...ys);
      }
      return false;
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = toImgCoords(e.clientX, e.clientY);

    if (tool === 'eraser') {
      const hit = hitTest(pos);
      if (hit) {
        pushHistory();
        setShapes(prev => prev.filter(s => s.id !== hit.id));
      }
      return;
    }

    if (tool === 'rect') {
      setSelectedId(null);
      pushHistory();
      setDrawing(true);
      setStartPos(pos);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (tool === 'polygon') {
      if (currentPoints.length >= 3) {
        const first = currentPoints[0];
        if (Math.hypot(pos.x - first.x, pos.y - first.y) < 15 / scale) {
          pushHistory();
          setShapes(prev => [...prev, { id: crypto.randomUUID(), type: 'polygon', points: [...currentPoints], color: shapeColor }]);
          setCurrentPoints([]);
          return;
        }
      }
      if (currentPoints.length === 0) pushHistory();
      setCurrentPoints(prev => [...prev, pos]);
    } else if (tool === 'freehand') {
      pushHistory();
      setDrawing(true);
      setCurrentPoints([pos]);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const pos = toImgCoords(e.clientX, e.clientY);
    if (tool === 'rect' && startPos) {
      setCurrentRect({
        x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
        w: Math.abs(pos.x - startPos.x), h: Math.abs(pos.y - startPos.y),
      });
    } else if (tool === 'freehand') {
      setCurrentPoints(prev => [...prev, pos]);
    }
  };

  const handlePointerUp = () => {
    if (tool === 'rect') {
      if (drawing && currentRect && currentRect.w > 5 && currentRect.h > 5) {
        const newShape: OcclusionShape = { id: crypto.randomUUID(), type: 'rect', ...currentRect, color: shapeColor };
        setShapes(prev => [...prev, newShape]);
        setSelectedId(newShape.id);
      }
      setDrawing(false);
      setStartPos(null);
      setCurrentRect(null);
    } else if (tool === 'freehand' && drawing) {
      if (currentPoints.length > 5) {
        const newShape: OcclusionShape = { id: crypto.randomUUID(), type: 'freehand', points: [...currentPoints], color: shapeColor };
        setShapes(prev => [...prev, newShape]);
      }
      setDrawing(false);
      setCurrentPoints([]);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'webp';
      const userId = user?.id || 'anonymous';
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('card-images').upload(path, compressed);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      setShapes([]);
      setImgLoaded(false);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl || shapes.length === 0) return;
    const colorGroups = new Map<string, string[]>();
    shapes.forEach(s => {
      const color = s.color || COLORS[0].fill;
      if (!colorGroups.has(color)) colorGroups.set(color, []);
      colorGroups.get(color)!.push(s.id);
    });
    const frontContent = JSON.stringify({
      imageUrl,
      allRects: shapes,
      activeRectIds: shapes.map(s => s.id),
      colorGroups: Object.fromEntries(colorGroups),
    });
    onSave(frontContent, '');
  };

  // AI text detection
  const handleDetectAI = async () => {
    if (!imageUrl) return;
    setIsDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('detect-occlusion', {
        body: { imageUrl },
      });
      if (error) throw error;
      if (data?.regions && Array.isArray(data.regions) && data.regions.length > 0) {
        pushHistory();
        const newShapes: OcclusionShape[] = data.regions.map((r: any) => ({
          id: crypto.randomUUID(),
          type: 'rect' as const,
          x: r.x * imgSize.w,
          y: r.y * imgSize.h,
          w: r.w * imgSize.w,
          h: r.h * imgSize.h,
          color: shapeColor,
        }));
        setShapes(prev => [...prev, ...newShapes]);
        toast({ title: `✨ ${newShapes.length} área${newShapes.length > 1 ? 's' : ''} detectada${newShapes.length > 1 ? 's' : ''}!` });
      } else {
        toast({ title: 'Nenhum texto detectado na imagem' });
      }
    } catch (err: any) {
      console.error('AI detect error:', err);
      toast({ title: 'Erro ao detectar', description: err.message, variant: 'destructive' });
    } finally {
      setIsDetecting(false);
    }
  };

  // Keyboard: delete, undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        pushHistory();
        setShapes(prev => prev.filter(r => r.id !== selectedId));
        setSelectedId(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, pushHistory, undo]);

  /* ─── Upload Screen ─── */
  if (!imageUrl) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 px-8 text-center space-y-3 w-full max-w-sm">
          <IconUpload />
          <p className="text-sm font-semibold text-foreground">Envie uma imagem</p>
          <p className="text-xs text-muted-foreground max-w-xs">Selecione a imagem e marque as áreas para ocultar.</p>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <span className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              )}
              {uploading ? 'Enviando...' : 'Escolher imagem'}
            </span>
          </label>
        </div>
        <div className="flex justify-end mt-4 w-full max-w-sm">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    );
  }

  /* ─── Shape rendering ─── */
  const renderShape = (s: OcclusionShape) => {
    const isSelected = selectedId === s.id;
    const colorObj = getColorObj(s.color || COLORS[0].fill);

    if (s.type === 'rect') {
      return (
        <div
          key={s.id}
          className={`absolute transition-shadow ${tool === 'eraser' ? 'cursor-pointer hover:opacity-50' : 'cursor-default'} ${
            isSelected ? 'ring-2 ring-yellow-400 shadow-lg' : ''
          }`}
          style={{
            left: s.x! * scale,
            top: s.y! * scale,
            width: s.w! * scale,
            height: s.h! * scale,
            backgroundColor: colorObj.fill,
            border: `2px solid ${isSelected ? '#facc15' : colorObj.border}`,
            borderRadius: 4,
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
        />
      );
    }

    if ((s.type === 'polygon' || s.type === 'freehand') && s.points && s.points.length > 1) {
      const pts = s.points.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
      return (
        <svg key={s.id} className="absolute inset-0 pointer-events-none" style={{ width: displaySize.w, height: displaySize.h }}>
          {s.type === 'polygon' ? (
            <polygon
              points={pts}
              fill={colorObj.fill}
              stroke={isSelected ? '#facc15' : colorObj.border}
              strokeWidth="2"
              className={`pointer-events-auto ${tool === 'eraser' ? 'cursor-pointer' : 'cursor-default'}`}
              onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
            />
          ) : (
            <polyline
              points={pts}
              fill="none"
              stroke={isSelected ? '#facc15' : colorObj.border}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`pointer-events-auto ${tool === 'eraser' ? 'cursor-pointer' : 'cursor-default'}`}
              onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
            />
          )}
        </svg>
      );
    }
    return null;
  };

  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: 'rect', icon: <IconRect active={tool === 'rect'} />, label: 'Retângulo' },
    { id: 'polygon', icon: <IconPolygon active={tool === 'polygon'} />, label: 'Polígono' },
    { id: 'freehand', icon: <IconFreehand active={tool === 'freehand'} />, label: 'Livre' },
    { id: 'eraser', icon: <IconEraser active={tool === 'eraser'} />, label: 'Borracha' },
  ];

  const usedColorFills = new Set(shapes.map(s => s.color || COLORS[0].fill));
  const cardCount = usedColorFills.size;

  const visibleColors = (() => {
    const used = COLORS.filter(c => usedColorFills.has(c.fill));
    const unused = COLORS.filter(c => !usedColorFills.has(c.fill));
    const result = [...used];
    if (!result.find(c => c.fill === shapeColor)) {
      const active = COLORS.find(c => c.fill === shapeColor);
      if (active) result.push(active);
    }
    const nextUnused = unused.find(c => !result.includes(c));
    if (nextUnused) result.push(nextUnused);
    return result.sort((a, b) => COLORS.indexOf(a) - COLORS.indexOf(b));
  })();

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
        <button
          onClick={onCancel}
          className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold text-foreground">Oclusão de imagem</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || shapes.length === 0}
          className="h-8 w-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30 transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </header>

      {/* ─── Toolbar ─── */}
      <div className="shrink-0 px-3 py-2 space-y-2">
        {/* Sub-header with counts */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {shapes.length} área{shapes.length !== 1 ? 's' : ''} · {cardCount} cartão{cardCount !== 1 ? 'ões' : ''}
          </p>
          {onRemoveImage && (
            <button
              className="text-[11px] text-destructive hover:text-destructive/80 font-medium"
              onClick={onRemoveImage}
            >
              Remover imagem
            </button>
          )}
        </div>

        {/* Tools + zoom row */}
        <div className="flex items-center gap-0.5">
          {tools.map(t => (
            <button
              key={t.id}
              className={`h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
                tool === t.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              onClick={() => { setTool(t.id); setSelectedId(null); setCurrentPoints([]); }}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}

          {/* Undo */}
          <button
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20 transition-colors"
            onClick={undo}
            disabled={history.length === 0}
            title="Desfazer"
          >
            <Undo2 className="h-5 w-5" />
          </button>

          <div className="h-5 w-px bg-border mx-1" />

          {/* Zoom */}
          <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onClick={() => setZoom(z => Math.max(0.3, z - 0.25))}>
            <IconZoomOut />
          </button>
          <span className="text-[11px] text-muted-foreground w-9 text-center select-none tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>
            <IconZoomIn />
          </button>
        </div>

        {/* Color dots */}
        <div className="flex items-center gap-1.5">
          {visibleColors.map(c => {
            const isActive = shapeColor === c.fill;
            return (
              <button
                key={c.label}
                className={`rounded-full transition-all focus:outline-none ${isActive ? 'ring-2 ring-offset-1 ring-foreground/40' : 'hover:scale-110'}`}
                style={{
                  backgroundColor: c.fill,
                  width: isActive ? 26 : 22,
                  height: isActive ? 26 : 22,
                }}
                onClick={() => setShapeColor(c.fill)}
                title={c.label}
              />
            );
          })}
          {visibleColors.length < COLORS.length && (
            <span className="text-[10px] text-muted-foreground/50 ml-0.5">+{COLORS.length - visibleColors.length}</span>
          )}
        </div>
      </div>

      {/* Polygon hint */}
      {tool === 'polygon' && currentPoints.length > 0 && (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-1 mx-3">
          Clique para vértices. Feche no primeiro ponto. ({currentPoints.length} pt{currentPoints.length !== 1 ? 's' : ''})
        </p>
      )}

      {/* ─── Canvas area (flex-1 = takes all remaining space) ─── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-auto bg-muted/10 mx-3 my-1 rounded-xl border border-border"
        style={{ touchAction: 'none' }}
      >
        <div
          className="occlusion-img-wrapper relative inline-block"
          style={{
            width: displaySize.w || '100%',
            height: displaySize.h || 'auto',
            cursor: tool === 'eraser' ? 'crosshair' : tool === 'rect' || tool === 'freehand' ? 'crosshair' : 'crosshair',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (drawing && tool !== 'polygon') {
              setDrawing(false);
              setStartPos(null);
              setCurrentRect(null);
              setCurrentPoints([]);
            }
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Oclusão"
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            className="block select-none pointer-events-none"
            style={{ width: displaySize.w, height: displaySize.h, userSelect: 'none', WebkitUserDrag: 'none' } as any}
            draggable={false}
          />

          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {shapes.map(renderShape)}

          {currentRect && tool === 'rect' && (
            <div
              className="absolute border-2 border-dashed border-primary/80 pointer-events-none"
              style={{
                left: currentRect.x * scale,
                top: currentRect.y * scale,
                width: currentRect.w * scale,
                height: currentRect.h * scale,
                backgroundColor: shapeColor.replace(/[\d.]+\)$/, '0.15)'),
                borderRadius: 4,
              }}
            />
          )}

          {currentPoints.length > 0 && (
            <svg className="absolute inset-0 pointer-events-none" style={{ width: displaySize.w, height: displaySize.h }}>
              <polyline
                points={currentPoints.map(p => `${p.x * scale},${p.y * scale}`).join(' ')}
                fill="none"
                stroke="rgba(59,130,246,0.8)"
                strokeWidth="2"
                strokeDasharray={tool === 'polygon' ? '5 5' : undefined}
                strokeLinecap="round"
              />
              {tool === 'polygon' && currentPoints.map((p, i) => (
                <circle key={i} cx={p.x * scale} cy={p.y * scale} r="4" fill="#3b82f6" />
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* ─── Bottom bar ─── */}
      <div className="shrink-0 px-3 py-2 border-t border-border/40 flex items-center gap-2">
        <button
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          title="Preview"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={handleDetectAI}
          disabled={isDetecting || !imgLoaded}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {isDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-.5 5a.5.5 0 0 1 1 0v4.5H17a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5V7z" />
            </svg>
          )}
          ✨ Detectar com IA
        </button>
      </div>
    </div>
  );
};

export default OcclusionEditor;
