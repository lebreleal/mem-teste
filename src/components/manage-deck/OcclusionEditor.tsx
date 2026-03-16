/**
 * Occlusion Editor — supports rectangles, polygons, freehand, and touch.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, ZoomIn, ZoomOut, RotateCcw, Trash2, Image, Loader2, Square, Pentagon, Pen, Move, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUtils';

type Tool = 'rect' | 'polygon' | 'freehand' | 'select';

interface OcclusionShape {
  id: string;
  type: 'rect' | 'polygon' | 'freehand';
  // rect: x, y, w, h
  x?: number; y?: number; w?: number; h?: number;
  // polygon / freehand: points
  points?: { x: number; y: number }[];
}

interface OcclusionEditorProps {
  initialFront: string;
  onSave: (front: string, back: string) => void;
  onCancel: () => void;
  onRemoveImage?: () => void;
  isSaving: boolean;
}

const OcclusionEditor = ({ initialFront, onSave, onCancel, onRemoveImage, isSaving }: OcclusionEditorProps) => {
  const [imageUrl, setImageUrl] = useState('');
  const [shapes, setShapes] = useState<OcclusionShape[]>([]);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('rect');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingNaturalShapes = useRef<OcclusionShape[] | null>(null);

  // Legacy compat: convert old rects to shapes
  useEffect(() => {
    if (initialFront) {
      try {
        const data = JSON.parse(initialFront);
        if (data.imageUrl) setImageUrl(data.imageUrl);
        if (data.allRects) {
          // Check if they're already shapes (have .type) or legacy rects
          const converted: OcclusionShape[] = data.allRects.map((r: any) => ({
            id: r.id || crypto.randomUUID(),
            type: r.type || 'rect',
            ...(r.type === 'polygon' || r.type === 'freehand'
              ? { points: r.points }
              : { x: r.x, y: r.y, w: r.w, h: r.h }),
            ...(r.points && !r.type ? {} : {}),
          }));
          pendingNaturalShapes.current = converted;
        }
      } catch {}
    }
  }, [initialFront]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0, img.naturalWidth * imageScale, img.naturalHeight * imageScale);

    const drawShape = (s: OcclusionShape, idx: number) => {
      const isSelected = selectedId === s.id;
      ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.7)';
      ctx.strokeStyle = isSelected ? '#facc15' : 'rgba(59,130,246,1)';
      ctx.lineWidth = isSelected ? 3 : 2;

      if (s.type === 'rect' && s.x != null) {
        ctx.fillRect(s.x, s.y!, s.w!, s.h!);
        ctx.strokeRect(s.x, s.y!, s.w!, s.h!);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${idx + 1}`, s.x + s.w! / 2, s.y! + s.h! / 2);
      } else if ((s.type === 'polygon' || s.type === 'freehand') && s.points && s.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
        if (s.type === 'polygon') ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Label
        const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length;
        const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${idx + 1}`, cx, cy);
      }
    };

    shapes.forEach((s, i) => drawShape(s, i));

    // Draw in-progress rect
    if (currentRect && tool === 'rect') {
      ctx.fillStyle = 'rgba(59,130,246,0.25)';
      ctx.strokeStyle = 'rgba(59,130,246,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.setLineDash([]);
    }

    // Draw in-progress polygon/freehand
    if (currentPoints.length > 0) {
      ctx.strokeStyle = 'rgba(59,130,246,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash(tool === 'polygon' ? [5, 5] : []);
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Draw points for polygon
      if (tool === 'polygon') {
        currentPoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#3b82f6';
          ctx.fill();
        });
      }
    }

    ctx.restore();
  }, [shapes, currentRect, currentPoints, imageScale, zoom, selectedId, tool]);

  const loadImage = useCallback((url: string) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const maxW = container.clientWidth;
      const maxH = 400;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setImageScale(s);
      canvas.width = Math.round(img.naturalWidth * s * zoom);
      canvas.height = Math.round(img.naturalHeight * s * zoom);
      if (pendingNaturalShapes.current) {
        const scaled = pendingNaturalShapes.current.map(shape => {
          if (shape.type === 'rect') {
            return { ...shape, x: shape.x! * s, y: shape.y! * s, w: shape.w! * s, h: shape.h! * s };
          } else {
            return { ...shape, points: shape.points?.map(p => ({ x: p.x * s, y: p.y * s })) };
          }
        });
        setShapes(scaled);
        pendingNaturalShapes.current = null;
      }
    };
    img.src = url;
  }, [zoom]);

  useEffect(() => { if (imageUrl) loadImage(imageUrl); }, [imageUrl, loadImage]);
  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = Math.round(img.naturalWidth * imageScale * zoom);
    canvas.height = Math.round(img.naturalHeight * imageScale * zoom);
    drawCanvas();
  }, [zoom, imageScale, drawCanvas]);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * (canvas.width / rect.width)) / zoom,
      y: ((clientY - rect.top) * (canvas.height / rect.height)) / zoom,
    };
  };

  const hitTest = (pos: { x: number; y: number }) => {
    return [...shapes].reverse().find(s => {
      if (s.type === 'rect') return pos.x >= s.x! && pos.x <= s.x! + s.w! && pos.y >= s.y! && pos.y <= s.y! + s.h!;
      if (s.points && s.points.length > 2) {
        // Simple bounding box test for polygon/freehand
        const xs = s.points.map(p => p.x);
        const ys = s.points.map(p => p.y);
        return pos.x >= Math.min(...xs) && pos.x <= Math.max(...xs) && pos.y >= Math.min(...ys) && pos.y <= Math.max(...ys);
      }
      return false;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = toCanvasCoords(e.clientX, e.clientY);

    if (tool === 'select') {
      const hit = hitTest(pos);
      setSelectedId(hit?.id ?? null);
      return;
    }

    if (tool === 'rect') {
      const hit = hitTest(pos);
      if (hit) { setSelectedId(hit.id); return; }
      setSelectedId(null);
      setDrawing(true);
      setStartPos(pos);
    } else if (tool === 'polygon') {
      // Close polygon if clicking near first point
      if (currentPoints.length >= 3) {
        const first = currentPoints[0];
        const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
        if (dist < 12) {
          setShapes(prev => [...prev, { id: crypto.randomUUID(), type: 'polygon', points: [...currentPoints] }]);
          setCurrentPoints([]);
          return;
        }
      }
      setCurrentPoints(prev => [...prev, pos]);
    } else if (tool === 'freehand') {
      setDrawing(true);
      setCurrentPoints([pos]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const pos = toCanvasCoords(e.clientX, e.clientY);
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
      if (drawing && currentRect && currentRect.w > 10 && currentRect.h > 10) {
        setShapes(prev => [...prev, { id: crypto.randomUUID(), type: 'rect', ...currentRect }]);
      }
      setDrawing(false);
      setStartPos(null);
      setCurrentRect(null);
    } else if (tool === 'freehand' && drawing) {
      if (currentPoints.length > 5) {
        setShapes(prev => [...prev, { id: crypto.randomUUID(), type: 'freehand', points: [...currentPoints] }]);
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
    } catch (err: any) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl || shapes.length === 0) return;
    const scale = imageScale || 1;
    const normalizedShapes = shapes.map(s => {
      if (s.type === 'rect') {
        return { ...s, x: s.x! / scale, y: s.y! / scale, w: s.w! / scale, h: s.h! / scale };
      } else {
        return { ...s, points: s.points?.map(p => ({ x: p.x / scale, y: p.y / scale })) };
      }
    });
    const frontContent = JSON.stringify({
      imageUrl,
      allRects: normalizedShapes,
      activeRectIds: normalizedShapes.map(s => s.id),
    });
    onSave(frontContent, '');
  };

  const tools: { id: Tool; icon: typeof Square; label: string }[] = [
    { id: 'rect', icon: Square, label: 'Retângulo' },
    { id: 'polygon', icon: Pentagon, label: 'Polígono' },
    { id: 'freehand', icon: Pen, label: 'Livre' },
    { id: 'select', icon: Move, label: 'Selecionar' },
  ];

  if (!imageUrl) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-3">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Envie uma imagem</p>
          <p className="text-xs text-muted-foreground max-w-xs">Selecione a imagem e depois marque as áreas que serão ocultadas durante o estudo.</p>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <span className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Enviando...' : 'Escolher imagem'}
            </span>
          </label>
        </div>
        <div className="flex justify-end"><Button variant="outline" onClick={onCancel}>Cancelar</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap rounded-lg border border-border bg-muted/30 p-1.5">
        {/* Drawing tools */}
        {tools.map(t => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              variant={tool === t.id ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setTool(t.id); setSelectedId(null); setCurrentPoints([]); }}
              title={t.label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
        <div className="h-5 w-px bg-border mx-1" />
        {/* Zoom */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.3, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
        <span className="text-xs text-muted-foreground w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
        <div className="h-5 w-px bg-border mx-1" />
        {selectedId && (<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={deleteSelected} title="Excluir seleção"><Trash2 className="h-4 w-4" /></Button>)}
        <Button variant="ghost" size="sm" onClick={() => { setShapes([]); setSelectedId(null); setCurrentPoints([]); }} className="gap-1 text-xs h-8 ml-auto"><RotateCcw className="h-3 w-3" /> Limpar</Button>
      </div>

      {/* Polygon helper */}
      {tool === 'polygon' && currentPoints.length > 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
          Clique para adicionar vértices. Clique perto do primeiro ponto para fechar o polígono ({currentPoints.length} ponto{currentPoints.length !== 1 ? 's' : ''}).
        </p>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="relative rounded-lg border border-border overflow-auto bg-muted/30 max-h-[400px] touch-none">
        <canvas ref={canvasRef} className="block" style={{ cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
          onPointerLeave={() => { if (drawing && tool !== 'polygon') { setDrawing(false); setStartPos(null); setCurrentRect(null); setCurrentPoints([]); } }}
        />
      </div>

      <p className="text-xs text-muted-foreground">{shapes.length} área(s) marcada(s).</p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {onRemoveImage && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1" onClick={onRemoveImage}>
            <ImageOff className="h-3.5 w-3.5" /> Remover imagem
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={isSaving || shapes.length === 0}>
          {isSaving ? 'Salvando...' : `Salvar (${shapes.length})`}
        </Button>
      </div>
    </div>
  );
};

export default OcclusionEditor;
