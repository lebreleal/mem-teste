import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Square, Circle, Hexagon, Type, ZoomIn, ZoomOut, Group, Ungroup, Eye, EyeOff, Trash2, MousePointer } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type ShapeType = 'rect' | 'ellipse' | 'polygon' | 'text';
type ToolMode = ShapeType | 'select';

interface OcclusionShape {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  type: ShapeType;
  groupId?: string;
  text?: string;
  points?: { x: number; y: number }[];
}

interface ImageOcclusionProps {
  imageUrl: string;
  initialRects?: OcclusionShape[];
  onChange: (rects: OcclusionShape[]) => void;
}

const FILL_SOLID = 'rgba(59, 130, 246, 0.85)';
const FILL_TRANSLUCENT = 'rgba(59, 130, 246, 0.35)';
const STROKE_COLOR = 'rgba(59, 130, 246, 1)';
const FILL_DRAWING = 'rgba(59, 130, 246, 0.25)';

const ImageOcclusion = ({ imageUrl, initialRects = [], onChange }: ImageOcclusionProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [shapes, setShapes] = useState<OcclusionShape[]>(initialRects);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentShape, setCurrentShape] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<ToolMode>('rect');
  const [translucent, setTranslucent] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  // Drag-to-move state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const nextGroupId = useRef(1);

  const hitTest = useCallback((pos: { x: number; y: number }, shapeList: OcclusionShape[]): OcclusionShape | null => {
    // Iterate in reverse so top shapes are hit first
    for (let i = shapeList.length - 1; i >= 0; i--) {
      const s = shapeList[i];
      if (s.type === 'ellipse') {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        const rx = Math.abs(s.w / 2), ry = Math.abs(s.h / 2);
        if (rx > 0 && ry > 0) {
          const val = ((pos.x - cx) ** 2) / (rx ** 2) + ((pos.y - cy) ** 2) / (ry ** 2);
          if (val <= 1) return s;
        }
      } else if (s.type === 'polygon' && s.points && s.points.length >= 3) {
        if (pointInPolygon(pos, s.points)) return s;
      } else {
        if (pos.x >= s.x && pos.x <= s.x + s.w && pos.y >= s.y && pos.y <= s.y + s.h) return s;
      }
    }
    return null;
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0, img.naturalWidth * imageScale, img.naturalHeight * imageScale);

    const fill = translucent ? FILL_TRANSLUCENT : FILL_SOLID;

    shapes.forEach((shape, i) => {
      const isSelected = selectedIds.has(shape.id);
      ctx.fillStyle = fill;
      ctx.strokeStyle = isSelected ? '#facc15' : STROKE_COLOR;
      ctx.lineWidth = isSelected ? 3 : 2;

      if (shape.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(shape.x + shape.w / 2, shape.y + shape.h / 2, Math.abs(shape.w / 2), Math.abs(shape.h / 2), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (shape.type === 'polygon' && shape.points && shape.points.length > 2) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (shape.type === 'text') {
        ctx.font = 'bold 18px sans-serif';
        const textW = ctx.measureText(shape.text || '').width + 16;
        const textH = 30;
        ctx.fillStyle = fill;
        ctx.fillRect(shape.x, shape.y, textW, textH);
        ctx.strokeRect(shape.x, shape.y, textW, textH);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(shape.text || '', shape.x + 8, shape.y + textH / 2);
      } else {
        ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
        ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      }

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = shape.type === 'polygon' && shape.points ? shape.points.reduce((s, p) => s + p.x, 0) / shape.points.length : shape.x + shape.w / 2;
      const cy = shape.type === 'polygon' && shape.points ? shape.points.reduce((s, p) => s + p.y, 0) / shape.points.length : shape.y + shape.h / 2;
      if (shape.type !== 'text') ctx.fillText(`${i + 1}`, cx, cy);
    });

    // Drawing preview
    if (currentShape && (tool === 'rect' || tool === 'ellipse')) {
      ctx.fillStyle = FILL_DRAWING;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      if (tool === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(currentShape.x + currentShape.w / 2, currentShape.y + currentShape.h / 2, Math.abs(currentShape.w / 2), Math.abs(currentShape.h / 2), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(currentShape.x, currentShape.y, currentShape.w, currentShape.h);
        ctx.strokeRect(currentShape.x, currentShape.y, currentShape.w, currentShape.h);
      }
      ctx.setLineDash([]);
    }

    // Polygon preview
    if (tool === 'polygon' && polygonPoints.length > 0) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      polygonPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      polygonPoints.forEach(p => {
        ctx.fillStyle = STROKE_COLOR;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();
  }, [shapes, currentShape, imageScale, zoom, panOffset, translucent, selectedIds, tool, polygonPoints]);

  const loadImage = useCallback(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const maxW = container.clientWidth;
      const maxH = 450;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setImageScale(s);
      canvas.width = Math.round(img.naturalWidth * s * zoom);
      canvas.height = Math.round(img.naturalHeight * s * zoom);
      drawCanvas();
    };
    img.src = imageUrl;
  }, [imageUrl, drawCanvas, zoom]);

  useEffect(() => { loadImage(); }, [loadImage]);
  useEffect(() => { drawCanvas(); }, [drawCanvas]);
  useEffect(() => {
    const h = () => loadImage();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [loadImage]);

  const toCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const pixelRatioX = canvas.width / rect.width;
    const pixelRatioY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * pixelRatioX - panOffset.x) / zoom,
      y: ((e.clientY - rect.top) * pixelRatioY - panOffset.y) / zoom,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Pan with middle button or alt+click
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    const pos = toCanvasCoords(e);

    // Select mode: click to select, drag to move
    if (tool === 'select') {
      const hit = hitTest(pos, shapes);
      if (hit) {
        // Toggle selection with ctrl/cmd, otherwise replace
        if (e.ctrlKey || e.metaKey) {
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(hit.id) ? next.delete(hit.id) : next.add(hit.id);
            return next;
          });
        } else if (!selectedIds.has(hit.id)) {
          setSelectedIds(new Set([hit.id]));
        }
        // Start dragging
        setDraggingId(hit.id);
        setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
      } else {
        setSelectedIds(new Set());
      }
      return;
    }

    if (tool === 'polygon' || tool === 'text') return;

    setDrawing(true);
    setStartPos(pos);
    setCurrentShape(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    // Dragging selected shapes
    if (draggingId && tool === 'select') {
      const pos = toCanvasCoords(e);
      const dx = pos.x - dragOffset.x;
      const dy = pos.y - dragOffset.y;
      const dragShape = shapes.find(s => s.id === draggingId);
      if (!dragShape) return;
      const offsetX = dx - dragShape.x;
      const offsetY = dy - dragShape.y;

      // Move all selected shapes (or just the one being dragged)
      const idsToMove = selectedIds.has(draggingId) ? selectedIds : new Set([draggingId]);
      const updated = shapes.map(s => {
        if (!idsToMove.has(s.id)) return s;
        const moved = { ...s, x: s.x + offsetX, y: s.y + offsetY };
        if (moved.points) {
          moved.points = moved.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
        }
        return moved;
      });
      setShapes(updated);
      // Don't call onChange on every move, will call on mouseUp
      return;
    }

    if (!drawing || !startPos) return;
    const pos = toCanvasCoords(e);
    setCurrentShape({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (isPanning) { setIsPanning(false); return; }

    if (draggingId) {
      setDraggingId(null);
      onChange(shapes); // Commit position
      return;
    }

    if (!drawing || !currentShape) { setDrawing(false); return; }
    if (currentShape.w > 10 && currentShape.h > 10) {
      const newShape: OcclusionShape = { ...currentShape, id: crypto.randomUUID(), type: tool as ShapeType };
      const updated = [...shapes, newShape];
      setShapes(updated);
      onChange(updated);
    }
    setDrawing(false);
    setStartPos(null);
    setCurrentShape(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'polygon') {
      const pos = toCanvasCoords(e);
      setPolygonPoints(prev => [...prev, pos]);
      return;
    }
    if (tool === 'text') {
      const pos = toCanvasCoords(e);
      setTextPos(pos);
      return;
    }
  };

  const handleCanvasDblClick = () => {
    if (tool === 'polygon' && polygonPoints.length >= 3) {
      const xs = polygonPoints.map(p => p.x);
      const ys = polygonPoints.map(p => p.y);
      const newShape: OcclusionShape = {
        id: crypto.randomUUID(),
        type: 'polygon',
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
        points: [...polygonPoints],
      };
      const updated = [...shapes, newShape];
      setShapes(updated);
      onChange(updated);
      setPolygonPoints([]);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.3, Math.min(5, prev + (e.deltaY > 0 ? -0.1 : 0.1))));
  };

  const addTextShape = () => {
    if (!textPos || !textInput.trim()) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.font = 'bold 18px sans-serif';
    const tw = (ctx?.measureText(textInput).width ?? 80) + 16;
    const newShape: OcclusionShape = { id: crypto.randomUUID(), type: 'text', x: textPos.x, y: textPos.y, w: tw, h: 30, text: textInput };
    const updated = [...shapes, newShape];
    setShapes(updated);
    onChange(updated);
    setTextInput('');
    setTextPos(null);
  };

  const groupSelected = () => {
    if (selectedIds.size < 2) return;
    const gid = `g${nextGroupId.current++}`;
    const updated = shapes.map(s => selectedIds.has(s.id) ? { ...s, groupId: gid } : s);
    setShapes(updated);
    onChange(updated);
    setSelectedIds(new Set());
  };

  const ungroupSelected = () => {
    const updated = shapes.map(s => selectedIds.has(s.id) ? { ...s, groupId: undefined } : s);
    setShapes(updated);
    onChange(updated);
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    const updated = shapes.filter(s => !selectedIds.has(s.id));
    setShapes(updated);
    onChange(updated);
    setSelectedIds(new Set());
  };

  const clearAll = () => { setShapes([]); onChange([]); setSelectedIds(new Set()); setPolygonPoints([]); };
  const zoomIn = () => setZoom(prev => Math.min(5, prev + 0.25));
  const zoomOut = () => setZoom(prev => Math.max(0.3, prev - 0.25));

  // Group colors
  const groupColors: Record<string, string> = {};
  const palette = ['#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  let ci = 0;
  shapes.forEach(s => { if (s.groupId && !groupColors[s.groupId]) groupColors[s.groupId] = palette[ci++ % palette.length]; });

  const cursor = tool === 'select' ? (draggingId ? 'grabbing' : 'default') : 'crosshair';

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Toolbar */}
        <div className="flex items-center gap-1 flex-wrap rounded-lg border border-border bg-muted/30 p-1.5">
          {/* Select tool */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={tool === 'select' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
                onClick={() => { setTool('select'); setPolygonPoints([]); setTextPos(null); }}>
                <MousePointer className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Selecionar / Mover</p></TooltipContent>
          </Tooltip>

          <div className="h-5 w-px bg-border mx-0.5" />

          {/* Shape tools */}
          {([
            { t: 'rect' as ToolMode, icon: <Square className="h-4 w-4" />, tip: 'Retângulo' },
            { t: 'ellipse' as ToolMode, icon: <Circle className="h-4 w-4" />, tip: 'Elipse' },
            { t: 'polygon' as ToolMode, icon: <Hexagon className="h-4 w-4" />, tip: 'Polígono (duplo clique fecha)' },
            { t: 'text' as ToolMode, icon: <Type className="h-4 w-4" />, tip: 'Texto' },
          ]).map(item => (
            <Tooltip key={item.t}>
              <TooltipTrigger asChild>
                <Button variant={tool === item.t ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
                  onClick={() => { setTool(item.t); setPolygonPoints([]); setTextPos(null); }}>
                  {item.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{item.tip}</p></TooltipContent>
            </Tooltip>
          ))}

          <div className="h-5 w-px bg-border mx-0.5" />

          {/* Zoom */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut}><ZoomOut className="h-4 w-4" /></Button>
          <span className="text-xs text-muted-foreground w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn}><ZoomIn className="h-4 w-4" /></Button>

          <div className="h-5 w-px bg-border mx-0.5" />

          {/* Translucency */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={translucent ? 'default' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setTranslucent(v => !v)}>
                {translucent ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{translucent ? 'Translúcido (ativo)' : 'Ativar translucidez'}</p></TooltipContent>
          </Tooltip>

          <div className="h-5 w-px bg-border mx-0.5" />

          {/* Group/Ungroup */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={groupSelected} disabled={selectedIds.size < 2}>
                <Group className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Agrupar</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={ungroupSelected} disabled={selectedIds.size === 0}>
                <Ungroup className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Desagrupar</p></TooltipContent>
          </Tooltip>

          {selectedIds.size > 0 && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={deleteSelected}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-xs h-8"><RotateCcw className="h-3 w-3" /> Limpar</Button>
        </div>

        {/* Text input */}
        {textPos && tool === 'text' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <input autoFocus className="flex-1 rounded bg-muted px-2 py-1 text-sm text-foreground outline-none"
              placeholder="Texto da oclusão..." value={textInput} onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTextShape(); if (e.key === 'Escape') setTextPos(null); }} />
            <Button size="sm" className="h-7" onClick={addTextShape}>OK</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setTextPos(null)}>✕</Button>
          </div>
        )}

        {/* Canvas */}
        <div ref={containerRef} className="relative rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center">
          <canvas ref={canvasRef} className="block max-w-full" style={{ maxHeight: '450px', cursor }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isPanning) setIsPanning(false); if (draggingId) { setDraggingId(null); onChange(shapes); } }}
            onClick={handleCanvasClick} onDoubleClick={handleCanvasDblClick} onWheel={handleWheel} />
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground">
          {shapes.length} área(s). Use 🖱️ Selecionar para clicar e mover. Ctrl+clique para multi-seleção. Alt+arraste para pan. Scroll para zoom.
        </p>

        {/* Shape chips */}
        {shapes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {shapes.map((s, i) => (
              <button key={s.id}
                onClick={() => {
                  setTool('select');
                  setSelectedIds(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; });
                }}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                  selectedIds.has(s.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                }`}
                style={s.groupId ? { borderColor: groupColors[s.groupId], borderWidth: 2 } : undefined}
              >
                {i + 1}
                <span className="text-[10px] opacity-60">
                  {s.type === 'rect' ? '▭' : s.type === 'ellipse' ? '◯' : s.type === 'polygon' ? '⬡' : 'T'}
                </span>
                {s.groupId && <span className="text-[10px]" style={{ color: groupColors[s.groupId] }}>●</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

// Point-in-polygon ray casting
function pointInPolygon(p: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export default ImageOcclusion;
