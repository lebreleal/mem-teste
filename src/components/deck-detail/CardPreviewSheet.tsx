/**
 * CardPreviewSheet – full-screen card browser opened when clicking a card in the list.
 * Shows front content; tap to reveal back. Navigate with arrows.
 * Cloze cards: each cloze number (c1, c2...) is shown as a separate virtual card.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, PenLine, MoreVertical, Trash2, ArrowUpRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useDeckDetail } from './DeckDetailContext';
import type { CardRow } from '@/types/deck';

/** Render cloze for preview: hide target cloze, show others as plain text */
function renderClozePreview(html: string, revealed: boolean, targetNum?: number): string {
  return html.replace(/\{\{c(\d+)::(.+?)\}\}/g, (_, num, answer) => {
    const n = parseInt(num);
    if (targetNum !== undefined && n !== targetNum) return answer;
    if (revealed) return `<span class="cloze-revealed">${answer}</span>`;
    return `<span class="cloze-blank">[...]</span>`;
  });
}

interface VirtualCard {
  card: CardRow;
  clozeTarget?: number;
}

/** Build virtual card list: each cloze number becomes a separate entry */
function buildVirtualCards(cards: CardRow[]): VirtualCard[] {
  const result: VirtualCard[] = [];
  const processedClozeGroups = new Set<string>();

  cards.forEach(card => {
    if (card.card_type === 'cloze') {
      const groupKey = card.front_content;
      if (processedClozeGroups.has(groupKey)) return;
      processedClozeGroups.add(groupKey);

      const siblings = cards.filter(c => c.card_type === 'cloze' && c.front_content === groupKey);
      siblings.forEach(sibling => {
        let clozeTarget = 1;
        try {
          const parsed = JSON.parse(sibling.back_content);
          if (typeof parsed.clozeTarget === 'number') clozeTarget = parsed.clozeTarget;
        } catch {}
        result.push({ card: sibling, clozeTarget });
      });
    } else {
      result.push({ card });
    }
  });

  return result;
}

interface Props {
  cards: CardRow[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

/** Render a single card's content (extracted for reuse in peek cards) */
function CardContent({
  vc, revealed, onClick, className = '',
}: { vc: VirtualCard; revealed: boolean; onClick?: () => void; className?: string }) {
  const card = vc.card;
  const isCloze = card.card_type === 'cloze';
  const isMultiple = card.card_type === 'multiple_choice';
  const isOcclusion = card.card_type === 'image_occlusion';
  const clozeTarget = vc.clozeTarget;

  let occlusionData: { imageUrl?: string } | null = null;
  if (isOcclusion) { try { occlusionData = JSON.parse(card.front_content); } catch {} }

  let mcOptions: string[] = [];
  let mcCorrectIdx = -1;
  if (isMultiple) {
    try { const p = JSON.parse(card.back_content); mcOptions = p.options || []; mcCorrectIdx = p.correctIndex ?? -1; } catch {}
  }

  const front = () => {
    if (isOcclusion && occlusionData?.imageUrl)
      return <img src={occlusionData.imageUrl} alt="Oclusão" className="max-w-full max-h-[50vh] rounded-lg object-contain mx-auto" />;
    if (isCloze) {
      const html = renderClozePreview(card.front_content, revealed, clozeTarget);
      return <div className="text-lg sm:text-xl leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (/<[a-z][\s\S]*>/i.test(card.front_content))
      return <div className="text-lg sm:text-xl leading-relaxed" dangerouslySetInnerHTML={{ __html: card.front_content }} />;
    return <p className="text-lg sm:text-xl leading-relaxed whitespace-pre-wrap">{card.front_content}</p>;
  };

  const back = () => {
    if (isCloze) return null;
    if (isMultiple) {
      return (
        <div className="space-y-2.5 mt-6">
          {mcOptions.map((opt, i) => (
            <div key={i} className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
              revealed && i === mcCorrectIdx ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
              : revealed ? 'border-border/30 text-muted-foreground' : 'border-border/60 text-foreground'
            }`}>
              <span className="font-medium mr-2">{String.fromCharCode(65 + i)})</span> {opt}
            </div>
          ))}
        </div>
      );
    }
    if (!revealed) return null;
    if (/<[a-z][\s\S]*>/i.test(card.back_content))
      return <div className="mt-6 pt-6 border-t border-border/30 text-base leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.back_content }} />;
    return <p className="mt-6 pt-6 border-t border-border/30 text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">{card.back_content}</p>;
  };

  return (
    <div className={`bg-card rounded-2xl border border-border/30 shadow-lg overflow-hidden cursor-pointer select-none ${className}`} onClick={onClick}>
      <div className="p-6 sm:p-8 min-h-[40vh] sm:min-h-[50vh] max-h-[70vh] overflow-y-auto flex flex-col justify-center">
        {front()}
        {back()}
      </div>
    </div>
  );
}

const CardPreviewSheet = ({ cards, initialIndex, open, onClose }: Props) => {
  const { openEdit, setDeleteId, setMoveCardId } = useDeckDetail();
  const isMobile = useIsMobile();

  const virtualCards = useMemo(() => buildVirtualCards(cards), [cards]);

  const initialVirtualIndex = useMemo(() => {
    if (initialIndex < 0 || initialIndex >= cards.length) return 0;
    const targetCard = cards[initialIndex];
    return virtualCards.findIndex(vc => vc.card.id === targetCard.id) || 0;
  }, [initialIndex, cards, virtualCards]);

  const [index, setIndex] = useState(initialVirtualIndex);
  const [revealed, setRevealed] = useState(false);

  // Mobile swipe state — use refs for drag position to avoid re-renders during drag
  const dragXRef = useRef(0);
  const [snapDirection, setSnapDirection] = useState<'none' | 'left' | 'right'>('none');
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => { setIndex(initialVirtualIndex); setRevealed(false); }, [initialVirtualIndex]);

  const vc = virtualCards[index];
  const card = vc?.card;

  const goPrev = useCallback(() => {
    if (index > 0) { setIndex(i => i - 1); setRevealed(false); }
  }, [index]);

  const goNext = useCallback(() => {
    if (index < virtualCards.length - 1) { setIndex(i => i + 1); setRevealed(false); }
  }, [index, virtualCards.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setRevealed(r => !r); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext, onClose]);

  // Mobile touch-drag — manipulate DOM directly for fluid 60fps dragging
  useEffect(() => {
    if (!open || !isMobile) return;
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isDraggingRef.current = false;
      dragXRef.current = 0;
      // Remove transition during drag for instant response
      container.style.transition = 'none';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      if (!isDraggingRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        e.preventDefault();
        dragXRef.current = dx;
        // Direct DOM manipulation — no React re-render
        container.style.transform = `translateX(${dx}px)`;
      }
    };

    const onTouchEnd = () => {
      if (!dragStartRef.current) return;
      const dx = dragXRef.current;
      const threshold = window.innerWidth * 0.2;

      // Snap back with transition
      container.style.transition = 'transform 0.25s ease-out';
      container.style.transform = 'translateX(0px)';

      if (dx > threshold) {
        goPrev();
      } else if (dx < -threshold) {
        goNext();
      }

      dragStartRef.current = null;
      isDraggingRef.current = false;
      dragXRef.current = 0;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [open, isMobile, goPrev, goNext]);

  if (!open || !card) return null;

  const isCloze = card.card_type === 'cloze';
  const clozeTarget = vc.clozeTarget;

  const prevVc = index > 0 ? virtualCards[index - 1] : null;
  const nextVc = index < virtualCards.length - 1 ? virtualCards[index + 1] : null;

  return (
    <div className="fixed inset-0 z-50 bg-muted/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-card/80 shadow-sm" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border/50 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
            <span className="text-primary">{index + 1}</span>/{virtualCards.length}
          </span>
          {isCloze && clozeTarget && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              c{clozeTarget}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-card/80 shadow-sm" onClick={() => { onClose(); openEdit(card); }}>
            <PenLine className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-card/80 shadow-sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { onClose(); setMoveCardId(card.id); }}>
                <ArrowUpRight className="mr-2 h-4 w-4" /> Mover
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { onClose(); setDeleteId(card.id); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0">
        {isMobile ? (
          /* ── Mobile: carousel with peek ── */
          <div
            ref={containerRef}
            className="flex items-center w-full h-full px-3"
          >
            {/* Prev peek */}
            <div className="w-10 shrink-0 -mr-2 opacity-40 scale-[0.85] pointer-events-none">
              {prevVc && (
                <div className="bg-card rounded-2xl border border-border/30 shadow p-4 min-h-[30vh] flex items-center justify-center overflow-hidden">
                  <p className="text-xs text-muted-foreground line-clamp-3 text-center">
                    {prevVc.card.front_content.replace(/<[^>]*>/g, '').replace(/\{\{c\d+::(.+?)\}\}/g, '[...]').slice(0, 60)}
                  </p>
                </div>
              )}
            </div>

            {/* Current card */}
            <div className="flex-1 min-w-0 mx-1">
              <CardContent vc={vc} revealed={revealed} onClick={() => setRevealed(r => !r)} />
              {!revealed && (
                <p className="text-center text-xs text-muted-foreground mt-3 animate-pulse">
                  Toque para revelar
                </p>
              )}
            </div>

            {/* Next peek */}
            <div className="w-10 shrink-0 -ml-2 opacity-40 scale-[0.85] pointer-events-none">
              {nextVc && (
                <div className="bg-card rounded-2xl border border-border/30 shadow p-4 min-h-[30vh] flex items-center justify-center overflow-hidden">
                  <p className="text-xs text-muted-foreground line-clamp-3 text-center">
                    {nextVc.card.front_content.replace(/<[^>]*>/g, '').replace(/\{\{c\d+::(.+?)\}\}/g, '[...]').slice(0, 60)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Desktop/Tablet: arrows ── */
          <>
            <Button
              variant="ghost" size="icon"
              className="h-10 w-10 rounded-full bg-card/80 shadow-sm shrink-0 absolute left-3 z-10 disabled:opacity-30"
              disabled={index === 0} onClick={goPrev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="w-full max-w-2xl mx-14">
              <CardContent vc={vc} revealed={revealed} onClick={() => setRevealed(r => !r)} />
              {!revealed && (
                <p className="text-center text-xs text-muted-foreground mt-4 animate-pulse">
                  Toque para revelar
                </p>
              )}
            </div>

            <Button
              variant="ghost" size="icon"
              className="h-10 w-10 rounded-full bg-card/80 shadow-sm shrink-0 absolute right-3 z-10 disabled:opacity-30"
              disabled={index === virtualCards.length - 1} onClick={goNext}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default CardPreviewSheet;
