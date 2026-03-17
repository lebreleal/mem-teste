/**
 * Occlusion Editor — supports rectangles, polygons, freehand, and touch.
 * Renders shapes via DOM overlays (not canvas) for better image display & interaction.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUtils';

type Tool = 'rect' | 'polygon' | 'freehand' | 'select';

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

/* ─── Custom SVG Icons ─── */
const IconRect = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className="h-4 w-4">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);
const IconPolygon = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} className="h-4 w-4">
    <path d="M12 2l9 7-3.5 10h-11L3 9z" />
  </svg>
);
const IconFreehand = ({ active }: { active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" className="h-4 w-4">
    <path d="M7.5 18s6.269-1.673 9.5-7c1.601-2.64-6.5-.5-8-3-1.16-2.5 8-3 8-3" />
  </svg>
);
const IconMove = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
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
const IconClear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
  </svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-muted-foreground">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);
const IconImageOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
    <line x1="2" x2="22" y1="2" y2="22" /><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" /><line x1="13.5" x2="6" y1="13.5" y2="21" /><path d="M18 12l3-3M21 15V6a2 2 0 0 0-2-2H8" /><path d="M3 16V5a2 2 0 0 1 .59-1.41" />
  </svg>
);
const IconOcclusionHeader = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-primary">
    <path d="M2 18v-1.5h2V18h2v2H4a2 2 0 0 1-2-2M4 4h2v2H4v1.5H2V6a2 2 0 0 1 2-2M3.486 13.5H2v-3h2L6.586 8a2 2 0 0 1 2.828 0L13 11.586l.586-.586a2 2 0 0 1 2.828 0l5.086 5 .5.5V18a2 2 0 0 1-2 2h-2v-2h2v-.586l-5-5-.586.586 1.293 1.293a1 1 0 0 1-1.414 1.414L8 9.414 4.5 13l-.5.5h-.514M10 6V4h4v2zM18 6V4h2a2 2 0 0 1 2 2v1.5h-2V6zM20 10.5h2v3h-2z" />
    <path d="M14 18v2h-4v-2z" />
  </svg>
);

const OcclusionEditor = ({ initialFront, onSave, onCancel, onRemoveImage, isSaving }: OcclusionEditorProps) => {
  const [imageUrl, setImageUrl] = useState('');
  const [shapes, setShapes] = useState<OcclusionShape[]>([]);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('rect');
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [shapeColor, setShapeColor] = useState('rgba(59,130,246,0.6)');

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
          ...(r.type === 'polygon' || r.type === 'freehand'
            ? { points: r.points }
            : { x: r.x, y: r.y, w: r.w, h: r.h }),
        }));
        setShapes(converted);
      }
    } catch {}
  }, [initialFront]);

  // When image loads, set dimensions
  const handleImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    setImgLoaded(true);
  };

  // Calculate display dimensions
  const getDisplaySize = useCallback(() => {
    const container = containerRef.current;
    if (!container || imgSize.w === 0) return { w: 0, h: 0, scale: 1 };
    const maxW = container.clientWidth;
    const maxH = Math.min(window.innerHeight * 0.45, 400);
    const scale = Math.min(maxW / imgSize.w, maxH / imgSize.h, 1) * zoom;
    return { w: imgSize.w * scale, h: imgSize.h * scale, scale };
  }, [imgSize, zoom]);

  const displaySize = getDisplaySize();
  const scale = displaySize.scale || 1;

  // Convert pointer to image-space coords (normalized to natural image size)
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
    const pos = toImgCoords(e.clientX, e.clientY);

    if (tool === 'select') {
      const hit = hitTest(pos);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        setDragOffset({ x: pos.x - (hit.x ?? 0), y: pos.y - (hit.y ?? 0) });
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
      return;
    }

    if (tool === 'rect') {
      const hit = hitTest(pos);
      if (hit) { setSelectedId(hit.id); setTool('select'); return; }
      setSelectedId(null);
      setDrawing(true);
      setStartPos(pos);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (tool === 'polygon') {
      if (currentPoints.length >= 3) {
        const first = currentPoints[0];
        if (Math.hypot(pos.x - first.x, pos.y - first.y) < 15 / scale) {
          setShapes(prev => [...prev, { id: crypto.randomUUID(), type: 'polygon', points: [...currentPoints], color: shapeColor }]);
          setCurrentPoints([]);
          return;
        }
      }
      setCurrentPoints(prev => [...prev, pos]);
    } else if (tool === 'freehand') {
      setDrawing(true);
      setCurrentPoints([pos]);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = toImgCoords(e.clientX, e.clientY);

    if (tool === 'select' && selectedId && dragOffset) {
      // Move selected shape
      setShapes(prev => prev.map(s => {
        if (s.id !== selectedId) return s;
        if (s.type === 'rect') return { ...s, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y };
        return s;
      }));
      return;
    }

    if (!drawing) return;
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
    setDragOffset(null);
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
        setSelectedId(newShape.id);
      }
      setDrawing(false);
      setCurrentPoints([]);
    }
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setShapes(prev => prev.filter(r => r.id !== selectedId));
    setSelectedId(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'webp';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('card-images').upload(path, compressed);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      setShapes([]);
      setImgLoaded(false);
    } catch (err: any) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl || shapes.length === 0) return;
    // Group shapes by color — each unique color becomes a separate card
    const colorGroups = new Map<string, string[]>();
    shapes.forEach(s => {
      const color = s.color || COLORS[0].fill;
      if (!colorGroups.has(color)) colorGroups.set(color, []);
      colorGroups.get(color)!.push(s.id);
    });
    // For now, save all shapes with activeRectIds being all shapes
    // The card splitting by color is handled at a higher level
    const frontContent = JSON.stringify({
      imageUrl,
      allRects: shapes,
      activeRectIds: shapes.map(s => s.id),
      colorGroups: Object.fromEntries(colorGroups),
    });
    onSave(frontContent, '');
  };

  // Keyboard: delete selected
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId]);

  /* ─── Upload Screen ─── */
  if (!imageUrl) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center space-y-3">
          <IconUpload />
          <p className="text-sm font-semibold text-foreground">Envie uma imagem</p>
          <p className="text-xs text-muted-foreground max-w-xs">Selecione a imagem e depois marque as áreas que serão ocultadas durante o estudo.</p>
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
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    );
  }

  /* ─── Shape rendering helpers ─── */
  const renderShape = (s: OcclusionShape) => {
    const isSelected = selectedId === s.id;
    const colorObj = getColorObj(s.color || COLORS[0].fill);

    if (s.type === 'rect') {
      return (
        <div
          key={s.id}
          className={`absolute transition-shadow cursor-pointer ${
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
              className="pointer-events-auto cursor-pointer"
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
              className="pointer-events-auto cursor-pointer"
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
    { id: 'select', icon: <IconMove />, label: 'Mover' },
  ];

  // Count unique colors used
  const usedColorFills = new Set(shapes.map(s => s.color || COLORS[0].fill));
  const cardCount = usedColorFills.size;

  // Progressive colors: show used colors + 1 next available
  const visibleColors = (() => {
    const used = COLORS.filter(c => usedColorFills.has(c.fill));
    const unused = COLORS.filter(c => !usedColorFills.has(c.fill));
    // Always show at least the active color + 1 extra
    const result = [...used];
    if (!result.find(c => c.fill === shapeColor)) {
      const active = COLORS.find(c => c.fill === shapeColor);
      if (active) result.push(active);
    }
    // Add next unused color if there are more
    const nextUnused = unused.find(c => !result.includes(c));
    if (nextUnused) result.push(nextUnused);
    // Sort by original COLORS order
    return result.sort((a, b) => COLORS.indexOf(a) - COLORS.indexOf(b));
  })();

  return (
    <div className="flex flex-col gap-2">
      {/* Compact toolbar row */}
      <div className="flex items-center gap-0.5">
        {/* Drawing tools */}
        {tools.map(t => (
          <button
            key={t.id}
            className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${
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

        <div className="h-4 w-px bg-border mx-1" />

        {/* Zoom */}
        <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onClick={() => setZoom(z => Math.max(0.3, z - 0.25))} title="Reduzir">
          <IconZoomOut />
        </button>
        <span className="text-[10px] text-muted-foreground w-8 text-center select-none tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Ampliar">
          <IconZoomIn />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Delete selected */}
        {selectedId && (
          <button className="h-7 w-7 flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onClick={deleteSelected} title="Excluir">
            <IconTrash />
          </button>
        )}

        {/* Clear */}
        <button
          className="h-7 flex items-center gap-1 px-2 rounded-md text-xs text-muted-foreground hover:bg-accent"
          onClick={() => { setShapes([]); setSelectedId(null); setCurrentPoints([]); }}
        >
          <IconClear /> Limpar
        </button>
      </div>

      {/* Color dots — progressive */}
      <div className="flex items-center gap-1">
        {visibleColors.map(c => {
          const isActive = shapeColor === c.fill;
          return (
            <button
              key={c.label}
              className={`rounded-full transition-all focus:outline-none ${isActive ? 'ring-2 ring-offset-1 ring-foreground/40' : 'hover:scale-110'}`}
              style={{
                backgroundColor: c.fill,
                width: isActive ? 24 : 20,
                height: isActive ? 24 : 20,
              }}
              onClick={() => setShapeColor(c.fill)}
              title={c.label}
            />
          );
        })}
        {visibleColors.length < COLORS.length && (
          <span className="text-[10px] text-muted-foreground/50 ml-1">+{COLORS.length - visibleColors.length}</span>
        )}
      </div>

      {/* Polygon hint */}
      {tool === 'polygon' && currentPoints.length > 0 && (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1">
          Clique para vértices. Feche no primeiro ponto. ({currentPoints.length} pt{currentPoints.length !== 1 ? 's' : ''})
        </p>
      )}

      {/* Polygon hint */}
      {tool === 'polygon' && currentPoints.length > 0 && (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1">
          Clique para vértices. Feche no primeiro ponto. ({currentPoints.length} pt{currentPoints.length !== 1 ? 's' : ''})
        </p>
      )}

      {/* Canvas + right sidebar */}
      <div className="flex gap-2">
        {/* Image canvas */}
        <div
          ref={containerRef}
          className="relative flex-1 min-w-0 rounded-xl border border-border overflow-auto bg-muted/10"
          style={{ touchAction: 'none', maxHeight: 'min(50dvh, 380px)' }}
        >
          <div
            className="occlusion-img-wrapper relative inline-block"
            style={{
              width: displaySize.w || '100%',
              height: displaySize.h || 'auto',
              cursor: tool === 'select' ? 'default' : 'crosshair',
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
            onClick={() => { if (tool !== 'polygon') setSelectedId(null); }}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Oclusão"
              crossOrigin="anonymous"
              onLoad={handleImgLoad}
              className="block select-none pointer-events-none"
              style={{ width: displaySize.w, height: displaySize.h }}
              draggable={false}
            />

            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {shapes.map((s) => renderShape(s))}

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

        {/* Right sidebar — actions */}
        <div className="flex flex-col items-center justify-center gap-1.5 shrink-0">
          {selectedId && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={deleteSelected}
              title="Excluir seleção"
            >
              <IconTrash />
            </button>
          )}
          {selectedId && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => {
                const s = shapes.find(s => s.id === selectedId);
                if (!s) return;
                const clone: OcclusionShape = { ...s, id: crypto.randomUUID(), x: s.x != null ? s.x + 15 : undefined, y: s.y != null ? s.y + 15 : undefined, points: s.points?.map(p => ({ x: p.x + 15, y: p.y + 15 })) };
                setShapes(prev => [...prev, clone]);
                setSelectedId(clone.id);
              }}
              title="Duplicar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          )}
          <button
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => { setTool('rect'); setSelectedId(null); }}
            title="Adicionar área"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Status + info */}
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-muted-foreground leading-snug flex-1">
          {shapes.length} área{shapes.length !== 1 ? 's' : ''} · {cardCount} cartão{cardCount !== 1 ? 'ões' : ''}
          {selectedId && <span className="text-primary font-medium ml-1">· selecionado</span>}
        </p>
        <button
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          onClick={() => { setShapes([]); setSelectedId(null); setCurrentPoints([]); }}
        >
          Limpar tudo
        </button>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center gap-2 pt-0.5">
        {onRemoveImage && (
          <button className="inline-flex items-center gap-1 text-[11px] text-destructive hover:text-destructive/80 font-medium" onClick={onRemoveImage}>
            <IconImageOff /> Remover imagem
          </button>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-8 rounded-xl text-xs" onClick={handleSave} disabled={isSaving || shapes.length === 0}>
          {isSaving ? 'Salvando...' : `Salvar (${cardCount})`}
        </Button>
      </div>
    </div>
  );
};

export default OcclusionEditor;
