/**
 * Occlusion Editor — contained overlay, supports rect, polygon, freehand, eraser, select+resize.
 * Colors group shapes: same color = same card, different color = different cards.
 * Dynamic colors: new colors appear as needed.
 * Layout: image centered, drawing tools above image, bottom bar below image.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { compressImage } from '@/lib/imageUtils';
import { useToast } from '@/hooks/use-toast';
import {
  IconRect, IconPolygon, IconFreehand, IconEraser, IconEyeOpen, IconEyeClosed,
  IconSparkle, IconUpload, IconClose, IconCheck, IconInfo, IconTrash, IconCursor,
} from '@/components/icons';

type Tool = 'select' | 'rect' | 'polygon' | 'freehand' | 'eraser';

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
  const [previewOpaque, setPreviewOpaque] = useState(true);
  const [colorInfoOpen, setColorInfoOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shapeColor, setShapeColor] = useState(COLORS[0].fill);
  const [resizing, setResizing] = useState<{ corner: string; startX: number; startY: number; origShape: OcclusionShape } | null>(null);
  const [panOffset] = useState({ x: 0, y: 0 });

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

  const autoSwitchColor = useCallback((currentShapes: OcclusionShape[]) => {
    const usedColors = new Set(currentShapes.map(s => s.color || COLORS[0].fill));
    if (usedColors.has(shapeColor)) {
      const currentIdx = COLORS.findIndex(c => c.fill === shapeColor);
      const nextIdx = (currentIdx + 1) % COLORS.length;
      for (let i = 0; i < COLORS.length; i++) {
        const candidate = COLORS[(nextIdx + i) % COLORS.length];
        if (!usedColors.has(candidate.fill)) {
          setShapeColor(candidate.fill);
          return;
        }
      }
      setShapeColor(COLORS[nextIdx].fill);
    }
  }, [shapeColor]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = toImgCoords(e.clientX, e.clientY);

    if (tool === 'select') {
      const hit = hitTest(pos);
      setSelectedId(hit ? hit.id : null);
      return;
    }

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
          const newShape: OcclusionShape = { id: crypto.randomUUID(), type: 'polygon', points: [...currentPoints], color: shapeColor };
          const newShapes = [...shapes, newShape];
          setShapes(newShapes);
          setCurrentPoints([]);
          autoSwitchColor(newShapes);
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

    if (resizing) {
      const pos = toImgCoords(e.clientX, e.clientY);
      const s = resizing.origShape;
      if (s.type === 'rect') {
        let newX = s.x!, newY = s.y!, newW = s.w!, newH = s.h!;
        const dx = pos.x - resizing.startX;
        const dy = pos.y - resizing.startY;
        if (resizing.corner.includes('e')) { newW = Math.max(10, s.w! + dx); }
        if (resizing.corner.includes('w')) { newX = s.x! + dx; newW = Math.max(10, s.w! - dx); }
        if (resizing.corner.includes('s')) { newH = Math.max(10, s.h! + dy); }
        if (resizing.corner.includes('n')) { newY = s.y! + dy; newH = Math.max(10, s.h! - dy); }
        setShapes(prev => prev.map(sh => sh.id === s.id ? { ...sh, x: newX, y: newY, w: newW, h: newH } : sh));
      }
      return;
    }

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
    if (resizing) {
      setResizing(null);
      return;
    }

    if (tool === 'rect') {
      if (drawing && currentRect && currentRect.w > 5 && currentRect.h > 5) {
        const newShape: OcclusionShape = { id: crypto.randomUUID(), type: 'rect', ...currentRect, color: shapeColor };
        const newShapes = [...shapes, newShape];
        setShapes(newShapes);
        setSelectedId(newShape.id);
        autoSwitchColor(newShapes);
      }
      setDrawing(false);
      setStartPos(null);
      setCurrentRect(null);
    } else if (tool === 'freehand' && drawing) {
      if (currentPoints.length > 5) {
        const newShape: OcclusionShape = { id: crypto.randomUUID(), type: 'freehand', points: [...currentPoints], color: shapeColor };
        const newShapes = [...shapes, newShape];
        setShapes(newShapes);
        autoSwitchColor(newShapes);
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

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushHistory();
    setShapes(prev => prev.filter(r => r.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, pushHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, deleteSelected, undo]);

  // Dynamic visible colors
  const usedColorFills = new Set(shapes.map(s => s.color || COLORS[0].fill));
  const visibleColors = (() => {
    const visible: typeof COLORS = [];
    for (const c of COLORS) {
      if (usedColorFills.has(c.fill)) visible.push(c);
    }
    for (const c of COLORS) {
      if (!usedColorFills.has(c.fill)) {
        visible.push(c);
        break;
      }
    }
    if (visible.length < 2) {
      for (const c of COLORS) {
        if (!visible.includes(c)) { visible.push(c); break; }
      }
    }
    return visible;
  })();

  const cardCount = usedColorFills.size;

  const getCursorStyle = () => {
    if (tool === 'select') return 'default';
    if (tool === 'eraser') return 'pointer';
    return 'crosshair';
  };

  // Get selected shape for positioning trash button
  const selectedShape = selectedId ? shapes.find(s => s.id === selectedId) : null;
  const getShapeBottom = (s: OcclusionShape): { x: number; y: number } => {
    if (s.type === 'rect') {
      return { x: (s.x! + s.w! / 2) * scale, y: (s.y! + s.h!) * scale };
    }
    if (s.points && s.points.length > 0) {
      const xs = s.points.map(p => p.x);
      const ys = s.points.map(p => p.y);
      return { x: ((Math.min(...xs) + Math.max(...xs)) / 2) * scale, y: Math.max(...ys) * scale };
    }
    return { x: 0, y: 0 };
  };

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
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconUpload className="h-4 w-4" />}
              {uploading ? 'Enviando...' : 'Escolher imagem'}
            </span>
          </label>
        </div>
      </div>
    );
  }

  /* ─── Shape rendering ─── */
  const renderShape = (s: OcclusionShape) => {
    const isSelected = selectedId === s.id;
    const colorObj = getColorObj(s.color || COLORS[0].fill);
    const fillColor = previewOpaque
      ? colorObj.fill.replace(/[\d.]+\)$/, '1)')
      : colorObj.fill;

    if (s.type === 'rect') {
      return (
        <div key={s.id}>
          <div
            className="absolute pointer-events-auto"
            style={{
              left: s.x! * scale,
              top: s.y! * scale,
              width: s.w! * scale,
              height: s.h! * scale,
              backgroundColor: fillColor,
              border: `2px solid ${colorObj.border}`,
              borderRadius: 4,
              boxShadow: isSelected ? `0 0 0 2px ${colorObj.border}, 0 0 8px ${colorObj.fill}` : undefined,
              cursor: tool === 'select' ? 'move' : tool === 'eraser' ? 'pointer' : 'crosshair',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (tool === 'select' || tool === 'eraser') {
                setSelectedId(s.id);
              }
            }}
          />
          {/* Resize handles when selected */}
          {isSelected && tool === 'select' && (
            <>
              {['nw', 'ne', 'sw', 'se'].map(corner => {
                const left = corner.includes('w') ? s.x! * scale - 4 : (s.x! + s.w!) * scale - 4;
                const top = corner.includes('n') ? s.y! * scale - 4 : (s.y! + s.h!) * scale - 4;
                const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
                return (
                  <div
                    key={corner}
                    className="absolute z-20 pointer-events-auto"
                    style={{
                      left, top, width: 8, height: 8,
                      backgroundColor: '#fff',
                      border: `2px solid ${colorObj.border}`,
                      borderRadius: 2,
                      cursor,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      pushHistory();
                      setResizing({ corner, startX: toImgCoords(e.clientX, e.clientY).x, startY: toImgCoords(e.clientX, e.clientY).y, origShape: { ...s } });
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    }}
                  />
                );
              })}
            </>
          )}
        </div>
      );
    }

    if ((s.type === 'polygon' || s.type === 'freehand') && s.points && s.points.length > 1) {
      const pts = s.points.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
      return (
        <svg key={s.id} className="absolute inset-0 pointer-events-none" style={{ width: displaySize.w, height: displaySize.h }}>
          {s.type === 'polygon' ? (
            <polygon
              points={pts}
              fill={fillColor}
              stroke={colorObj.border}
              strokeWidth={isSelected ? 3 : 2}
              className="pointer-events-auto"
              style={{ cursor: tool === 'select' ? 'move' : tool === 'eraser' ? 'pointer' : 'crosshair' }}
              onClick={(e) => {
                e.stopPropagation();
                if (tool === 'select' || tool === 'eraser') setSelectedId(s.id);
              }}
            />
          ) : (
            <polyline
              points={pts}
              fill="none"
              stroke={colorObj.border}
              strokeWidth={isSelected ? 4 : 3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-auto"
              style={{ cursor: tool === 'select' ? 'move' : tool === 'eraser' ? 'pointer' : 'crosshair' }}
              onClick={(e) => {
                e.stopPropagation();
                if (tool === 'select' || tool === 'eraser') setSelectedId(s.id);
              }}
            />
          )}
        </svg>
      );
    }
    return null;
  };

  const drawTools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: 'select', icon: <IconCursor className="h-5 w-5" />, label: 'Selecionar' },
    { id: 'rect', icon: <IconRect active={tool === 'rect'} />, label: 'Retângulo' },
    { id: 'polygon', icon: <IconPolygon active={tool === 'polygon'} />, label: 'Polígono' },
    { id: 'freehand', icon: <IconFreehand active={tool === 'freehand'} />, label: 'Livre' },
    { id: 'eraser', icon: <IconEraser active={tool === 'eraser'} />, label: 'Borracha' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
        <button
          onClick={onCancel}
          className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors shrink-0"
        >
          <IconClose />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold text-foreground">Oclusão de imagem</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || shapes.length === 0}
          className="h-8 w-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30 transition-colors shrink-0"
        >
          <IconCheck />
        </button>
      </header>

      {/* ─── Content: toolbar + image + bottom bar ─── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden">
        
        {/* Drawing toolbar — above image */}
        <div className="shrink-0 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-xl border border-border/60 p-1 shadow-sm mb-2">
          {drawTools.map(t => (
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
          <div className="w-px h-6 bg-border mx-0.5" />
          <button
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20 transition-colors"
            onClick={undo}
            disabled={history.length === 0}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="h-5 w-5" />
          </button>
        </div>

        {/* Image canvas — centered, responsive */}
        <div
          ref={containerRef}
          className="relative flex items-center justify-center overflow-auto bg-muted/20 rounded-xl border border-border/30 flex-1 min-h-0 w-full"
          style={{ touchAction: 'none' }}
        >
          <div
            className="occlusion-img-wrapper relative inline-block"
            style={{
              width: displaySize.w || '100%',
              height: displaySize.h || 'auto',
              cursor: getCursorStyle(),
              userSelect: 'none',
              WebkitUserSelect: 'none',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              if (resizing) { setResizing(null); return; }
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

            {/* Trash button below selected shape */}
            {selectedId && selectedShape && tool === 'select' && (
              <div
                className="absolute z-30 pointer-events-auto"
                style={{
                  left: getShapeBottom(selectedShape).x - 14,
                  top: getShapeBottom(selectedShape).y + 6,
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSelected(); }}
                  className="h-7 w-7 flex items-center justify-center rounded-full bg-foreground/90 text-background shadow-lg hover:bg-destructive transition-colors"
                  title="Excluir"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

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

        {/* Polygon hint */}
        {tool === 'polygon' && currentPoints.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Clique para vértices. Feche no primeiro ponto. ({currentPoints.length} pt{currentPoints.length !== 1 ? 's' : ''})
          </p>
        )}

        {/* Bottom bar — below image */}
        <div className="shrink-0 flex items-center justify-center gap-2 mt-2 flex-wrap">
          {/* Eye toggle */}
          <button
            onClick={() => setPreviewOpaque(v => !v)}
            className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
              !previewOpaque ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={previewOpaque ? 'Opaco (escondido)' : 'Transparente (visível)'}
          >
            {previewOpaque ? <IconEyeClosed className="h-4 w-4" /> : <IconEyeOpen className="h-4 w-4" />}
          </button>

          {/* Color dots */}
          <div className="relative flex items-center gap-1">
            {visibleColors.map(c => {
              const isActive = shapeColor === c.fill;
              return (
                <button
                  key={c.label}
                  className={`rounded-full transition-all shrink-0 ${isActive ? 'ring-2 ring-offset-1 ring-foreground/40 scale-110' : 'hover:scale-110'}`}
                  style={{
                    backgroundColor: c.fill.replace(/[\d.]+\)$/, '1)'),
                    width: 20,
                    height: 20,
                  }}
                  onClick={() => setShapeColor(c.fill)}
                  title={c.label}
                />
              );
            })}
            <button
              onClick={() => setColorInfoOpen(v => !v)}
              className="h-5 w-5 shrink-0 flex items-center justify-center text-primary/70 hover:text-primary transition-colors"
              title="Como funcionam as cores"
            >
              <IconInfo className="h-3.5 w-3.5" />
            </button>

            {colorInfoOpen && (
              <div className="absolute left-0 bottom-full mb-2 z-50 w-72 rounded-xl bg-card border border-border shadow-lg p-3 space-y-2.5">
                <div className="flex items-start justify-between">
                  <p className="text-xs text-muted-foreground leading-relaxed pr-2">
                    Formas da mesma cor são agrupadas no mesmo cartão. Cores diferentes geram cartões diferentes.
                  </p>
                  <button onClick={() => setColorInfoOpen(false)} className="shrink-0 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-2 text-center space-y-1.5">
                    <p className="text-[10px] font-semibold text-foreground">Mesma cor = agrupadas</p>
                    <div className="mx-auto w-14 h-8 rounded bg-muted relative flex items-center justify-center gap-0.5">
                      <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[0].fill.replace(/[\d.]+\)$/, '1)') }} />
                      <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[0].fill.replace(/[\d.]+\)$/, '1)') }} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-2 text-center space-y-1.5">
                    <p className="text-[10px] font-semibold text-foreground">Cores diferentes = cards</p>
                    <div className="mx-auto w-14 h-8 rounded bg-muted relative flex items-center justify-center gap-0.5">
                      <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[0].fill.replace(/[\d.]+\)$/, '1)') }} />
                      <div className="w-4 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[1].fill.replace(/[\d.]+\)$/, '1)') }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-0.5">
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setZoom(z => Math.max(0.3, z - 0.25))}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M20 12a1 1 0 0 1-1 1H5a1 1 0 1 1 0-2h14a1 1 0 0 1 1 1" /></svg>
            </button>
            <span className="text-[10px] text-muted-foreground tabular-nums select-none w-8 text-center">{Math.round(zoom * 100)}%</span>
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M13 5a1 1 0 1 0-2 0v6H5a1 1 0 1 0 0 2h6v6a1 1 0 1 0 2 0v-6h6a1 1 0 1 0 0-2h-6z" /></svg>
            </button>
          </div>

          {/* Detect AI — animated gradient border */}
          <button
            onClick={handleDetectAI}
            disabled={isDetecting || !imgLoaded}
            className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 shrink-0 overflow-hidden"
            style={{ background: 'hsl(var(--card))' }}
          >
            {/* Animated gradient border */}
            <span className="absolute inset-0 rounded-full p-[1.5px] overflow-hidden" style={{ background: 'linear-gradient(90deg, #00B2FF, #3347FF, #FF306B, #FF9B23, #00B2FF)', backgroundSize: '200% 100%', animation: 'gradient-shift 3s linear infinite' }} >
              <span className="block w-full h-full rounded-full bg-card" />
            </span>
            <span className="relative flex items-center gap-1.5">
              {isDetecting ? <Loader2 className="h-4 w-4 animate-spin text-foreground" /> : <IconSparkle className="h-4 w-4 text-foreground" />}
              <span className="text-foreground font-semibold">Detectar com IA</span>
            </span>
          </button>
        </div>
      </div>

      {/* Info strip */}
      {shapes.length > 0 && (
        <div className="shrink-0 border-t border-border/40 px-3 py-1.5">
          <p className="text-[11px] text-muted-foreground text-center">
            {shapes.length} área{shapes.length !== 1 ? 's' : ''} · {cardCount} cartão{cardCount !== 1 ? 'ões' : ''}
            {onRemoveImage && (
              <>
                {' · '}
                <button className="text-destructive hover:text-destructive/80 font-medium" onClick={onRemoveImage}>
                  Remover imagem
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {/* Gradient animation keyframes */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
};

export default OcclusionEditor;
