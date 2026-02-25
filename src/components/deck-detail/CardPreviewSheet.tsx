/**
 * CardPreviewSheet – full-screen card browser opened when clicking a card in the list.
 * Shows front content; tap to reveal back. Navigate with arrows (desktop) or swipe (mobile).
 * Cloze cards: each cloze number (c1, c2...) is shown as a separate virtual card.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { X, ChevronLeft, ChevronRight, PenLine, MoreVertical, Trash2, ArrowUpRight, Flame } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useDeckDetail } from './DeckDetailContext';
import type { CardRow } from '@/types/deck';

/* ─── Cloze helpers ─── */

function renderClozePreview(html: string, revealed: boolean, targetNum?: number): string {
  return html.replace(/\{\{c(\d+)::(.+?)\}\}/g, (_, num, answer) => {
    const n = parseInt(num);
    if (targetNum !== undefined && n !== targetNum) return answer;
    if (revealed) return `<span class="cloze-revealed">${answer}</span>`;
    return `<span class="cloze-blank">[...]</span>`;
  });
}

/* ─── Virtual card types ─── */

interface VirtualCard {
  card: CardRow;
  clozeTarget?: number;
}

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

/* ─── Card content renderer ─── */

function CardContent({
  vc, revealed, onClick, className = '',
}: { vc: VirtualCard; revealed: boolean; onClick?: () => void; className?: string }) {
  const card = vc.card;
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  if (!card) return <div className="bg-card rounded-2xl border border-border/30 shadow-lg p-6 text-center text-muted-foreground">Cartão não encontrado</div>;

  const isCloze = card.card_type === 'cloze';
  const isMultiple = card.card_type === 'multiple_choice';
  const isOcclusion = card.card_type === 'image_occlusion';
  const clozeTarget = vc.clozeTarget;

  let occlusionData: { imageUrl?: string; allRects?: any[]; activeRectIds?: string[] } | null = null;
  if (isOcclusion) { try { occlusionData = JSON.parse(card.front_content); } catch {} }


  let mcOptions: string[] = [];
  let mcCorrectIdx = -1;
  if (isMultiple) {
    try { const p = JSON.parse(card.back_content); mcOptions = p.options || []; mcCorrectIdx = p.correctIndex ?? -1; } catch {}
  }

  const frontContent = (() => {
    try {
      if (isOcclusion && occlusionData?.imageUrl) {
        const rects = occlusionData.allRects || [];
        // Compute viewBox from image natural dimensions (rects are in pixel coords scaled to imageScale)
        // We use the bounding box of the rects + image to set a proper viewBox
        return (
          <div className="relative inline-block mx-auto">
            <img
              src={occlusionData.imageUrl}
              alt="Oclusão"
              className="max-w-full max-h-[50vh] rounded-lg object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
            {imgNatural && rects.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${imgNatural.w} ${imgNatural.h}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {rects.map((r: any, i: number) => {
                  // When not revealed, show all rects. When revealed, hide the active ones (reveal answer).
                  const isActive = occlusionData!.activeRectIds?.includes(r.id) ?? true;
                  if (revealed && isActive) return null;
                  return (
                    <rect
                      key={i}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      fill="rgba(59,130,246,0.85)"
                      rx="4"
                    />
                  );
                })}
              </svg>
            )}
          </div>
        );
      }
      if (isCloze) {
        const html = renderClozePreview(card.front_content, revealed, clozeTarget);
        return <div className="text-lg sm:text-xl leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
      }
      if (/<[a-z][\s\S]*>/i.test(card.front_content))
        return <div className="text-lg sm:text-xl leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front_content) }} />;
      return <p className="text-lg sm:text-xl leading-relaxed whitespace-pre-wrap">{card.front_content}</p>;
    } catch (e) {
      console.error('Error rendering front:', e);
      return <p className="text-lg text-destructive">Erro ao renderizar cartão</p>;
    }
  })();

  const backContent = (() => {
    try {
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
        return <div className="mt-6 pt-6 border-t border-border/30 text-base leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back_content) }} />;
      return <p className="mt-6 pt-6 border-t border-border/30 text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">{card.back_content}</p>;
    } catch (e) {
      console.error('Error rendering back:', e);
      return <p className="text-sm text-destructive mt-4">Erro ao renderizar resposta</p>;
    }
  })();

  return (
    <div className={`bg-card rounded-2xl border border-border/30 shadow-lg overflow-hidden cursor-pointer select-none ${className}`} onClick={onClick}>
      <div className="p-6 sm:p-8 min-h-[40vh] sm:min-h-[50vh] max-h-[70vh] overflow-y-auto flex flex-col items-center justify-center">
        <div className="w-full">
          {frontContent}
          {backContent}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */

interface Props {
  cards: CardRow[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

const CardPreviewSheet = ({ cards, initialIndex, open, onClose }: Props) => {
  const { openEdit, setDeleteId, setMoveCardId, isFrozenCard, unfreezeCard } = useDeckDetail();
  const isMobile = useIsMobile();

  const virtualCards = useMemo(() => {
    if (!cards || cards.length === 0) return [];
    return buildVirtualCards(cards);
  }, [cards]);

  const initialVirtualIndex = useMemo(() => {
    if (virtualCards.length === 0) return 0;
    if (initialIndex < 0 || initialIndex >= cards.length) return 0;
    const targetCard = cards[initialIndex];
    if (!targetCard) return 0;
    const found = virtualCards.findIndex(vc => vc.card.id === targetCard.id);
    return found >= 0 ? found : 0;
  }, [initialIndex, cards, virtualCards]);

  const [index, setIndex] = useState(initialVirtualIndex);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setIndex(initialVirtualIndex); setRevealed(false); }, [initialVirtualIndex]);

  // Clamp index to valid range
  const safeIndex = virtualCards.length > 0 ? Math.min(index, virtualCards.length - 1) : 0;
  const vc = virtualCards.length > 0 ? virtualCards[safeIndex] : null;
  const card = vc?.card ?? null;

  const goPrev = useCallback(() => {
    if (safeIndex > 0) { setIndex(i => i - 1); setRevealed(false); }
  }, [safeIndex]);

  const goNext = useCallback(() => {
    if (safeIndex < virtualCards.length - 1) { setIndex(i => i + 1); setRevealed(false); }
  }, [safeIndex, virtualCards.length]);

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

  /* ─── Mobile swipe gesture ─── */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  useEffect(() => {
    if (!open || !isMobile) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      swipedRef.current = false;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || swipedRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      const threshold = 60;
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipedRef.current = true;
        if (dx > 0) goPrev();
        else goNext();
      }
      touchStartRef.current = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [open, isMobile, goPrev, goNext]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !card) return null;

  const isCloze = card?.card_type === 'cloze';
  const clozeTarget = vc?.clozeTarget;


  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-card/80 shadow-sm" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border/50 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
            <span className="text-primary">{safeIndex + 1}</span>/{virtualCards.length}
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
              {isFrozenCard(card) && (
                <DropdownMenuItem onClick={() => { unfreezeCard(card.id); }}>
                  <Flame className="mr-2 h-4 w-4" /> Descongelar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { onClose(); setDeleteId(card.id); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0 px-4 sm:px-6">
        {/* Left arrow */}
        <Button
          variant="ghost" size="icon"
          className={`rounded-full bg-card/80 shadow-sm shrink-0 absolute left-2 sm:left-3 z-10 disabled:opacity-30 ${isMobile ? 'h-8 w-8' : 'h-10 w-10'}`}
          disabled={safeIndex === 0} onClick={goPrev}
        >
          <ChevronLeft className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
        </Button>

        <div className="w-full max-w-2xl mx-auto px-10 sm:px-14">
          {vc ? (
            <>
              <CardContent vc={vc} revealed={revealed} onClick={() => setRevealed(r => !r)} />
              {!revealed && (
                <p className="text-center text-xs text-muted-foreground mt-3 sm:mt-4 animate-pulse">
                  Toque para revelar
                </p>
              )}
            </>
          ) : (
            <div className="bg-card rounded-2xl border border-border/30 shadow-lg p-8 text-center text-muted-foreground">
              Cartão não disponível
            </div>
          )}
        </div>

        {/* Right arrow */}
        <Button
          variant="ghost" size="icon"
          className={`rounded-full bg-card/80 shadow-sm shrink-0 absolute right-2 sm:right-3 z-10 disabled:opacity-30 ${isMobile ? 'h-8 w-8' : 'h-10 w-10'}`}
          disabled={safeIndex === virtualCards.length - 1} onClick={goNext}
        >
          <ChevronRight className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
        </Button>
      </div>
    </div>
  );
};

export default CardPreviewSheet;
