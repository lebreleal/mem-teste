/**
 * Extracted from ManageDeck.tsx — Occlusion Editor component for image occlusion cards.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, ZoomIn, ZoomOut, RotateCcw, Trash2, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUtils';

interface OcclusionRect {
  x: number; y: number; w: number; h: number; id: string;
}

interface OcclusionEditorProps {
  initialFront: string;
  onSave: (front: string, back: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const OcclusionEditor = ({ initialFront, onSave, onCancel, isSaving }: OcclusionEditorProps) => {
  const [imageUrl, setImageUrl] = useState('');
  const [rects, setRects] = useState<OcclusionRect[]>([]);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingNaturalRects = useRef<OcclusionRect[] | null>(null);

  useEffect(() => {
    if (initialFront) {
      try {
        const data = JSON.parse(initialFront);
        if (data.imageUrl) setImageUrl(data.imageUrl);
        if (data.allRects) pendingNaturalRects.current = data.allRects;
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

    rects.forEach((r, i) => {
      ctx.fillStyle = selectedId === r.id ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.75)';
      ctx.strokeStyle = selectedId === r.id ? '#facc15' : 'rgba(59,130,246,1)';
      ctx.lineWidth = selectedId === r.id ? 3 : 2;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, r.x + r.w / 2, r.y + r.h / 2);
    });

    if (currentRect) {
      ctx.fillStyle = 'rgba(59,130,246,0.25)';
      ctx.strokeStyle = 'rgba(59,130,246,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }, [rects, currentRect, imageScale, zoom, selectedId]);

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
      if (pendingNaturalRects.current) {
        const scaled = pendingNaturalRects.current.map(r => ({
          ...r, x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s,
        }));
        setRects(scaled);
        pendingNaturalRects.current = null;
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

  const toCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * (canvas.width / rect.width)) / zoom,
      y: ((e.clientY - rect.top) * (canvas.height / rect.height)) / zoom,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = toCanvasCoords(e);
    const hit = [...rects].reverse().find(r => pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h);
    if (hit) { setSelectedId(hit.id); return; }
    setSelectedId(null);
    setDrawing(true);
    setStartPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) return;
    const pos = toCanvasCoords(e);
    setCurrentRect({
      x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x), h: Math.abs(pos.y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (!drawing || !currentRect) { setDrawing(false); return; }
    if (currentRect.w > 10 && currentRect.h > 10) {
      setRects(prev => [...prev, { ...currentRect, id: crypto.randomUUID() }]);
    }
    setDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setRects(prev => prev.filter(r => r.id !== selectedId));
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
      setRects([]);
    } catch (err: any) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl || rects.length === 0) return;
    const scale = imageScale || 1;
    const normalizedRects = rects.map(r => ({
      ...r, x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale,
    }));
    const frontContent = JSON.stringify({
      imageUrl,
      allRects: normalizedRects,
      activeRectIds: normalizedRects.map(r => r.id),
    });
    onSave(frontContent, '');
  };

  if (!imageUrl) {
    return (
      <div className="space-y-4">
        {!initialFront && (
          <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            <Image className="h-4 w-4" /> Oclusão de imagem
          </button>
        )}
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
      {!initialFront && (
        <button onClick={() => { setImageUrl(''); setRects([]); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" />
          <Image className="h-4 w-4" /> Trocar imagem
        </button>
      )}
      <div className="flex items-center gap-1 flex-wrap rounded-lg border border-border bg-muted/30 p-1.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.3, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
        <span className="text-xs text-muted-foreground w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
        <div className="h-5 w-px bg-border mx-1" />
        {selectedId && (<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={deleteSelected}><Trash2 className="h-4 w-4" /></Button>)}
        <Button variant="ghost" size="sm" onClick={() => { setRects([]); setSelectedId(null); }} className="gap-1 text-xs h-8 ml-auto"><RotateCcw className="h-3 w-3" /> Limpar</Button>
      </div>
      <div ref={containerRef} className="relative rounded-lg border border-border overflow-auto bg-muted/30 max-h-[400px]">
        <canvas ref={canvasRef} className="block" style={{ cursor: 'crosshair' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (drawing) { setDrawing(false); setStartPos(null); setCurrentRect(null); } }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{rects.length} área(s) marcada(s). Desenhe retângulos sobre as partes que deseja ocultar.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={isSaving || rects.length === 0}>
          {isSaving ? 'Salvando...' : `Salvar (${rects.length} área${rects.length !== 1 ? 's' : ''})`}
        </Button>
      </div>
    </div>
  );
};

export default OcclusionEditor;
