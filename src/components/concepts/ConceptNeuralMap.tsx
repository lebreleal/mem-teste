/**
 * ConceptNeuralMap — 2D pannable/zoomable neural network canvas.
 * Concepts are nodes positioned spatially, connected by SVG lines.
 * Draggable like a game map — pan with touch/mouse, pinch to zoom.
 */
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { CheckCircle2, Lock, Circle, Loader2, ZoomIn, ZoomOut, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConceptNeuralMapProps {
  concepts: GlobalConcept[];
  lockedIds: Set<string>;
  onStartStudy?: (concept: GlobalConcept) => void;
  onNodeTap?: (concept: GlobalConcept) => void;
}

// ── Layout constants ──
const NODE_W = 120;
const NODE_H = 56;
const H_GAP = 60;
const V_GAP = 80;

// ── Position types ──
interface NodePos {
  concept: GlobalConcept;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

// ── Tree layout algorithm ──
// Assigns (x,y) positions to each concept in a tree-like 2D layout
function layoutGraph(concepts: GlobalConcept[]): { nodes: NodePos[]; edges: Edge[]; width: number; height: number } {
  if (concepts.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const byId = new Map(concepts.map(c => [c.id, c]));
  const childrenMap = new Map<string, string[]>();
  const edges: Edge[] = [];

  for (const c of concepts) {
    if (c.parent_concept_id && byId.has(c.parent_concept_id)) {
      const arr = childrenMap.get(c.parent_concept_id) ?? [];
      arr.push(c.id);
      childrenMap.set(c.parent_concept_id, arr);
      edges.push({ from: c.parent_concept_id, to: c.id });
    }
  }

  // Find roots
  const roots = concepts.filter(c => !c.parent_concept_id || !byId.has(c.parent_concept_id));

  // Sort roots by category then name
  roots.sort((a, b) => {
    const catA = a.category ?? '';
    const catB = b.category ?? '';
    if (catA !== catB) return catA.localeCompare(catB);
    return a.name.localeCompare(b.name);
  });

  const positions = new Map<string, { x: number; y: number }>();

  // Measure subtree width (number of leaf-level slots)
  const subtreeWidth = new Map<string, number>();
  function measureWidth(id: string): number {
    const kids = childrenMap.get(id) ?? [];
    if (kids.length === 0) {
      subtreeWidth.set(id, 1);
      return 1;
    }
    const w = kids.reduce((sum, kid) => sum + measureWidth(kid), 0);
    subtreeWidth.set(id, w);
    return w;
  }

  for (const r of roots) measureWidth(r.id);

  // Place nodes using recursive layout
  let globalCol = 0;

  function placeNode(id: string, depth: number) {
    const kids = childrenMap.get(id) ?? [];
    if (kids.length === 0) {
      positions.set(id, {
        x: globalCol * (NODE_W + H_GAP),
        y: depth * (NODE_H + V_GAP),
      });
      globalCol++;
      return;
    }

    // Place children first
    const startCol = globalCol;
    for (const kid of kids) placeNode(kid, depth + 1);
    const endCol = globalCol;

    // Center parent over children
    const firstChild = positions.get(kids[0])!;
    const lastChild = positions.get(kids[kids.length - 1])!;
    positions.set(id, {
      x: (firstChild.x + lastChild.x) / 2,
      y: depth * (NODE_H + V_GAP),
    });
  }

  for (const r of roots) {
    placeNode(r.id, 0);
    globalCol += 0.5; // gap between trees
  }

  // Build node positions array
  const nodes: NodePos[] = [];
  let maxX = 0, maxY = 0;

  for (const c of concepts) {
    const pos = positions.get(c.id);
    if (pos) {
      nodes.push({ concept: c, x: pos.x, y: pos.y });
      maxX = Math.max(maxX, pos.x + NODE_W);
      maxY = Math.max(maxY, pos.y + NODE_H);
    } else {
      // Orphan nodes without position — place them at the bottom
      nodes.push({ concept: c, x: globalCol * (NODE_W + H_GAP), y: 0 });
      maxX = Math.max(maxX, globalCol * (NODE_W + H_GAP) + NODE_W);
      globalCol++;
    }
  }

  return { nodes, edges, width: maxX + 40, height: maxY + 40 };
}

// ── Node colors ──
function getNodeStyle(state: number, isLocked: boolean) {
  if (isLocked) return {
    bg: 'hsl(var(--muted) / 0.6)',
    border: 'hsl(var(--border) / 0.4)',
    text: 'hsl(var(--muted-foreground) / 0.5)',
    glow: 'none',
  };
  switch (state) {
    case 2: return {
      bg: 'hsl(150 60% 45% / 0.15)',
      border: 'hsl(150 60% 45% / 0.6)',
      text: 'hsl(150 60% 35%)',
      glow: '0 0 12px hsl(150 60% 45% / 0.3)',
    };
    case 1: case 3: return {
      bg: 'hsl(40 80% 55% / 0.12)',
      border: 'hsl(40 80% 55% / 0.6)',
      text: 'hsl(40 80% 40%)',
      glow: '0 0 8px hsl(40 80% 55% / 0.2)',
    };
    default: return {
      bg: 'hsl(var(--card))',
      border: 'hsl(var(--border) / 0.7)',
      text: 'hsl(var(--foreground))',
      glow: 'none',
    };
  }
}

function getEdgeColor(fromState: number, toState: number, isToLocked: boolean) {
  if (isToLocked) return 'hsl(var(--border) / 0.3)';
  if (fromState === 2 && toState === 2) return 'hsl(150 60% 45% / 0.5)';
  if (fromState === 2) return 'hsl(150 60% 45% / 0.35)';
  return 'hsl(var(--border) / 0.5)';
}

// ── Main Component ──
export default function ConceptNeuralMap({
  concepts,
  lockedIds,
  onStartStudy,
  onNodeTap,
}: ConceptNeuralMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastTouchDist = useRef(0);

  // Layout
  const { nodes, edges, width, height } = useMemo(() => layoutGraph(concepts), [concepts]);
  const byId = useMemo(() => new Map(concepts.map(c => [c.id, c])), [concepts]);

  // Center on mount
  useEffect(() => {
    if (containerRef.current && nodes.length > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const fitScale = Math.min(rect.width / (width + 40), rect.height / (height + 40), 1);
      const s = Math.max(0.3, Math.min(fitScale, 0.8));
      setPan({
        x: (rect.width - width * s) / 2,
        y: 20,
      });
      setScale(s);
    }
  }, [nodes.length, width, height]);

  // Mouse/touch handlers for panning
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.max(0.2, Math.min(2, s * delta)));
  }, []);

  // Touch zoom (pinch)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastTouchDist.current > 0) {
        const ratio = dist / lastTouchDist.current;
        setScale(s => Math.max(0.2, Math.min(2, s * ratio)));
      }
      lastTouchDist.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastTouchDist.current = 0;
  }, []);

  const zoomIn = () => setScale(s => Math.min(2, s * 1.3));
  const zoomOut = () => setScale(s => Math.max(0.2, s / 1.3));
  const resetView = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const fitScale = Math.min(rect.width / (width + 40), rect.height / (height + 40), 1);
      const s = Math.max(0.3, Math.min(fitScale, 0.8));
      setPan({ x: (rect.width - width * s) / 2, y: 20 });
      setScale(s);
    }
  };

  // Stats
  const totalDominated = concepts.filter(c => c.state === 2).length;
  const totalConcepts = concepts.length;

  if (concepts.length === 0) return null;

  return (
    <div className="relative rounded-xl border border-border/60 bg-muted/20 overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
        <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm" onClick={zoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm" onClick={zoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm" onClick={resetView}>
          <Locate className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-2 left-2 z-20 rounded-lg bg-card/90 backdrop-blur-sm border border-border/40 px-3 py-1.5 shadow-sm">
        <p className="text-[11px] font-semibold text-foreground">
          🧠 {totalDominated}/{totalConcepts} dominados
        </p>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            width: width,
            height: height,
            position: 'relative',
          }}
        >
          {/* SVG edges layer */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={width}
            height={height}
            style={{ overflow: 'visible' }}
          >
            {edges.map(edge => {
              const fromNode = nodes.find(n => n.concept.id === edge.from);
              const toNode = nodes.find(n => n.concept.id === edge.to);
              if (!fromNode || !toNode) return null;

              const x1 = fromNode.x + NODE_W / 2;
              const y1 = fromNode.y + NODE_H;
              const x2 = toNode.x + NODE_W / 2;
              const y2 = toNode.y;

              const fromConcept = byId.get(edge.from);
              const toConcept = byId.get(edge.to);
              const color = getEdgeColor(
                fromConcept?.state ?? 0,
                toConcept?.state ?? 0,
                lockedIds.has(edge.to)
              );

              // Bezier curve for smooth connection
              const midY = (y1 + y2) / 2;

              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray={lockedIds.has(edge.to) ? '4 4' : 'none'}
                  />
                  {/* Small dot at connection point */}
                  <circle cx={x2} cy={y2} r={3} fill={color} />
                </g>
              );
            })}
          </svg>

          {/* Nodes layer */}
          {nodes.map(node => {
            const c = node.concept;
            const isLocked = lockedIds.has(c.id);
            const style = getNodeStyle(c.state, isLocked);
            const isDominated = c.state === 2;
            const isLearning = c.state === 1 || c.state === 3;

            return (
              <div
                key={c.id}
                data-node
                className="absolute transition-shadow duration-200 select-none"
                style={{
                  left: node.x,
                  top: node.y,
                  width: NODE_W,
                  height: NODE_H,
                }}
                onClick={() => onNodeTap?.(c)}
              >
                <div
                  className="w-full h-full rounded-xl border-2 flex flex-col items-center justify-center p-1.5 cursor-pointer hover:scale-105 transition-transform"
                  style={{
                    background: style.bg,
                    borderColor: style.border,
                    boxShadow: style.glow,
                  }}
                >
                  {/* State icon */}
                  <div className="mb-0.5">
                    {isDominated ? (
                      <CheckCircle2 className="h-4 w-4" style={{ color: style.text }} />
                    ) : isLocked ? (
                      <Lock className="h-3.5 w-3.5" style={{ color: style.text }} />
                    ) : isLearning ? (
                      <Loader2 className="h-3.5 w-3.5" style={{ color: style.text }} />
                    ) : (
                      <Circle className="h-3.5 w-3.5" style={{ color: style.text }} />
                    )}
                  </div>
                  {/* Name */}
                  <p
                    className="text-[10px] font-semibold leading-tight text-center line-clamp-2 px-1"
                    style={{ color: style.text }}
                  >
                    {c.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
