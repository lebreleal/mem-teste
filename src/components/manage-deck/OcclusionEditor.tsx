/**
 * Occlusion Editor — full-screen on mobile, supports rect, polygon, freehand, eraser, pan.
 * Colors group shapes: same color = same card, different color = different cards.
 * Layout matches reference: tools on left, zoom+hand on right, bottom bar with eye/AI/toggle.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { compressImage } from '@/lib/imageUtils';
import { useToast } from '@/hooks/use-toast';

type Tool = 'rect' | 'polygon' | 'freehand' | 'eraser' | 'pan';

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
const IconHand = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-6 w-6">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11.5V14m0-2.5v-6a1.5 1.5 0 1 1 3 0m-3 6a1.5 1.5 0 0 0-3 0v2C6 17 7 21 12 21s6-4 6-7.5v-6a1.5 1.5 0 0 0-3 0m-3-2V11m0-5.5v-1a1.5 1.5 0 0 1 3 0v3m0 0V11" />
  </svg>
);
const IconEyeOpen = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-5 w-5">
    <path fill="currentColor" fillRule="evenodd" d="M12 5c7 0 10 7 10 7s-3 7-10 7S2 12 2 12s3-7 10-7m0 2c-2.764 0-4.77 1.364-6.16 2.86a12.4 12.4 0 0 0-1.543 2.07L4.255 12l.042.07a12.4 12.4 0 0 0 1.544 2.07C7.23 15.636 9.236 17 12 17s4.77-1.364 6.16-2.86a12.4 12.4 0 0 0 1.543-2.07l.042-.07-.042-.07a12.4 12.4 0 0 0-1.544-2.07C16.77 8.365 14.764 7 12 7m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6" clipRule="evenodd" />
  </svg>
);
const IconEyeClosed = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-5 w-5">
    <rect width="2" height="24.106" x="2.833" y="4.246" fill="currentColor" rx="1" transform="rotate(-45 2.833 4.246)" />
    <path fill="currentColor" fillRule="evenodd" d="M4.319 8.561C2.733 10.291 2 12 2 12s3 7 10 7c.88 0 1.697-.11 2.453-.304l-1.728-1.728A8 8 0 0 1 12 17c-2.764 0-4.77-1.364-6.16-2.86a12.4 12.4 0 0 1-1.543-2.07L4.255 12l.042-.07a12.4 12.4 0 0 1 1.437-1.953zm13.947 5.462a12.4 12.4 0 0 0 1.437-1.952l.042-.071-.042-.07a12.4 12.4 0 0 0-1.544-2.07C16.77 8.365 14.764 7 12 7q-.372 0-.725.032L9.547 5.304A9.9 9.9 0 0 1 12 5c7 0 10 7 10 7s-.733 1.71-2.318 3.439z" clipRule="evenodd" />
  </svg>
);
const IconSparkle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" className="h-4 w-4">
    <path fill="currentColor" fillRule="evenodd" d="m5.745 3.156.242.483c.08.161.211.292.373.373l.483.241a.833.833 0 0 1 0 1.49l-.483.242a.83.83 0 0 0-.373.373l-.242.483a.833.833 0 0 1-1.49 0l-.242-.483a.83.83 0 0 0-.373-.373l-.483-.241a.833.833 0 0 1 0-1.49l.483-.242a.83.83 0 0 0 .373-.373l.242-.483a.833.833 0 0 1 1.49 0m6.25 1.47a.833.833 0 0 0-1.49 0l-.881 1.762a5.83 5.83 0 0 1-2.61 2.609l-1.762.881a.833.833 0 0 0 0 1.49l1.763.882a5.83 5.83 0 0 1 2.609 2.609l.88 1.762a.833.833 0 0 0 1.491 0l.882-1.762a5.83 5.83 0 0 1 2.608-2.609l1.763-.881a.833.833 0 0 0 0-1.49l-1.763-.882a5.83 5.83 0 0 1-2.608-2.609z" clipRule="evenodd" />
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
  const [previewOpaque, setPreviewOpaque] = useState(false);
  const [hideAllGuessOne, setHideAllGuessOne] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shapeColor, setShapeColor] = useState(COLORS[0].fill);
  // Pan state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);

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

    if (tool === 'pan') {
      setPanStart({ x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

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

    if (tool === 'pan' && panStart) {
      setPanOffset({
        x: panStart.ox + (e.clientX - panStart.x),
        y: panStart.oy + (e.clientY - panStart.y),
      });
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
    if (tool === 'pan') {
      setPanStart(null);
      return;
    }

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
      hideAllGuessOne,
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
      </div>
    );
  }

  /* ─── Shape rendering ─── */
  const renderShape = (s: OcclusionShape) => {
    const isSelected = selectedId === s.id;
    const colorObj = getColorObj(s.color || COLORS[0].fill);
    const opacity = previewOpaque ? 1 : undefined;

    if (s.type === 'rect') {
      const fillColor = previewOpaque
        ? colorObj.fill.replace(/[\d.]+\)$/, '1)')
        : colorObj.fill;
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
            backgroundColor: fillColor,
            border: `2px solid ${isSelected ? '#facc15' : colorObj.border}`,
            borderRadius: 4,
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
        />
      );
    }

    if ((s.type === 'polygon' || s.type === 'freehand') && s.points && s.points.length > 1) {
      const pts = s.points.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
      const fillColor = previewOpaque
        ? colorObj.fill.replace(/[\d.]+\)$/, '1)')
        : colorObj.fill;
      return (
        <svg key={s.id} className="absolute inset-0 pointer-events-none" style={{ width: displaySize.w, height: displaySize.h }}>
          {s.type === 'polygon' ? (
            <polygon
              points={pts}
              fill={fillColor}
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

  const drawTools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: 'rect', icon: <IconRect active={tool === 'rect'} />, label: 'Retângulo' },
    { id: 'polygon', icon: <IconPolygon active={tool === 'polygon'} />, label: 'Polígono' },
    { id: 'freehand', icon: <IconFreehand active={tool === 'freehand'} />, label: 'Livre' },
    { id: 'eraser', icon: <IconEraser active={tool === 'eraser'} />, label: 'Borracha' },
  ];

  const usedColorFills = new Set(shapes.map(s => s.color || COLORS[0].fill));
  const cardCount = usedColorFills.size;

  const getCursorStyle = () => {
    if (tool === 'pan') return panStart ? 'grabbing' : 'grab';
    return 'crosshair';
  };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
        <button
          onClick={onCancel}
          className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M16.293 17.707a1 1 0 0 0 1.414-1.414L13.414 12l4.293-4.293a1 1 0 0 0-1.414-1.414L12 10.586 7.707 6.293a1 1 0 0 0-1.414 1.414L10.586 12l-4.293 4.293a1 1 0 1 0 1.414 1.414L12 13.414z" clipRule="evenodd" />
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
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M20.707 6.299a1 1 0 0 1 0 1.414L9.713 18.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414l4.293 4.293L19.293 6.299a1 1 0 0 1 1.414 0" clipRule="evenodd" />
          </svg>
        </button>
      </header>

      {/* ─── Main area: canvas with side controls ─── */}
      <div className="flex-1 min-h-0 flex relative">

        {/* Left floating tools — drawing tools + undo */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 bg-card/90 backdrop-blur-sm rounded-xl border border-border/60 p-1 shadow-sm">
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
          <div className="h-px w-6 bg-border my-0.5" />
          <button
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20 transition-colors"
            onClick={undo}
            disabled={history.length === 0}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="h-5 w-5" />
          </button>
        </div>

        {/* Right floating controls — hand + zoom */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 bg-card/90 backdrop-blur-sm rounded-xl border border-border/60 p-1 shadow-sm">
          {/* Hand / Pan tool */}
          <button
            className={`h-10 w-10 flex items-center justify-center rounded-lg transition-colors ${
              tool === 'pan'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            onClick={() => { setTool('pan'); setSelectedId(null); setCurrentPoints([]); }}
            title="Mover"
          >
            <IconHand />
          </button>

          <div className="h-px w-6 bg-border my-0.5" />

          {/* Zoom in */}
          <button
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            title="Zoom in"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M13 5a1 1 0 1 0-2 0v6H5a1 1 0 1 0 0 2h6v6a1 1 0 1 0 2 0v-6h6a1 1 0 1 0 0-2h-6z" />
            </svg>
          </button>

          {/* Zoom level */}
          <span className="text-[10px] text-muted-foreground tabular-nums select-none leading-none py-0.5">
            {Math.round(zoom * 100)}%
          </span>

          {/* Zoom out */}
          <button
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => setZoom(z => Math.max(0.3, z - 0.25))}
            title="Zoom out"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M20 12a1 1 0 0 1-1 1H5a1 1 0 1 1 0-2h14a1 1 0 0 1 1 1" />
            </svg>
          </button>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 relative overflow-auto bg-muted/10"
          style={{ touchAction: tool === 'pan' ? 'none' : 'none' }}
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
              if (tool === 'pan') { setPanStart(null); return; }
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

        {/* Polygon hint — floating */}
        {tool === 'polygon' && currentPoints.length > 0 && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10">
            <p className="text-[11px] text-muted-foreground bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border/40 shadow-sm">
              Clique para vértices. Feche no primeiro ponto. ({currentPoints.length} pt{currentPoints.length !== 1 ? 's' : ''})
            </p>
          </div>
        )}
      </div>

      {/* ─── Bottom bar ─── */}
      <div className="shrink-0 border-t border-border/40 px-3 py-2.5 space-y-2.5">
        {/* Row 1: Eye + Color gradient button with AI detect + info */}
        <div className="flex items-center gap-2">
          {/* Eye toggle */}
          <button
            onClick={() => setPreviewOpaque(v => !v)}
            className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
              previewOpaque ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
            title={previewOpaque ? 'Mostrar transparência' : 'Prévia opaca'}
          >
            {previewOpaque ? <IconEyeOpen /> : <IconEyeClosed />}
          </button>

          {/* Color selector + Detect AI button */}
          <div className="flex-1 flex items-center gap-1.5">
            {/* Color dots — inline, all visible */}
            <div className="flex items-center gap-1">
              {COLORS.map(c => {
                const isActive = shapeColor === c.fill;
                return (
                  <button
                    key={c.label}
                    className={`rounded-full transition-all shrink-0 ${isActive ? 'ring-2 ring-offset-1 ring-foreground/40 scale-110' : 'hover:scale-110'}`}
                    style={{
                      backgroundColor: c.fill.replace(/[\d.]+\)$/, '1)'),
                      width: 18,
                      height: 18,
                    }}
                    onClick={() => setShapeColor(c.fill)}
                    title={c.label}
                  />
                );
              })}
            </div>

            {/* Spacer */}
            <div className="w-px h-5 bg-border/60 mx-1" />

            {/* Detect AI */}
            <button
              onClick={handleDetectAI}
              disabled={isDetecting || !imgLoaded}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 shrink-0"
            >
              {isDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IconSparkle />}
              Detectar com IA
            </button>
          </div>
        </div>

        {/* Row 2: "Esconda tudo e adivinhe um" toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">Esconda tudo e adivinhe um</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-4 w-4 text-primary/70">
              <path fill="currentColor" d="M11 17a1 1 0 1 0 2 0 1 1 0 0 0-2 0m1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-14a4 4 0 0 0-3.841 2.885c-.174.6.347 1.115.971 1.115.48 0 .854-.407 1.056-.842A2 2 0 0 1 14 10c0 1.77-2.348 1.778-2.89 4.007-.13.537.338.993.89.993s.977-.47 1.217-.968C13.907 12.607 16 12.088 16 10a4 4 0 0 0-4-4" />
            </svg>
          </div>
          <button
            onClick={() => setHideAllGuessOne(v => !v)}
            className="relative shrink-0"
            style={{ width: 48, height: 28 }}
          >
            <div
              className="absolute inset-0 rounded-full transition-colors"
              style={{ backgroundColor: hideAllGuessOne ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}
            />
            <div
              className="absolute top-1 rounded-full bg-white shadow-sm transition-transform"
              style={{
                width: 20,
                height: 20,
                transform: hideAllGuessOne ? 'translateX(24px)' : 'translateX(4px)',
              }}
            />
          </button>
        </div>

        {/* Info strip */}
        {shapes.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
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
        )}
      </div>
    </div>
  );
};

export default OcclusionEditor;
