/**
 * CardPreviewSheet – full-screen card browser opened when clicking a card in the list.
 * Shows front content; tap to reveal back. Navigate with arrows.
 * Cloze cards: each cloze number (c1, c2...) is shown as a separate virtual card.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, PenLine, MoreVertical, Trash2, ArrowUpRight } from 'lucide-react';
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

const CardPreviewSheet = ({ cards, initialIndex, open, onClose }: Props) => {
  const { openEdit, setDeleteId, setMoveCardId, deck } = useDeckDetail();

  const virtualCards = useMemo(() => buildVirtualCards(cards), [cards]);

  const initialVirtualIndex = useMemo(() => {
    if (initialIndex < 0 || initialIndex >= cards.length) return 0;
    const targetCard = cards[initialIndex];
    return virtualCards.findIndex(vc => vc.card.id === targetCard.id) || 0;
  }, [initialIndex, cards, virtualCards]);

  const [index, setIndex] = useState(initialVirtualIndex);
  const [revealed, setRevealed] = useState(false);

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

  // Swipe support for mobile
  useEffect(() => {
    if (!open) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) goPrev(); else goNext();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchend', onTouchEnd); };
  }, [open, goPrev, goNext]);

  if (!open || !card) return null;

  const isCloze = card.card_type === 'cloze';
  const isMultiple = card.card_type === 'multiple_choice';
  const isOcclusion = card.card_type === 'image_occlusion';
  const clozeTarget = vc.clozeTarget;

  // Parse occlusion
  let occlusionData: { imageUrl?: string } | null = null;
  if (isOcclusion) {
    try { occlusionData = JSON.parse(card.front_content); } catch {}
  }

  // Parse multiple choice
  let mcOptions: string[] = [];
  let mcCorrectIdx = -1;
  if (isMultiple) {
    try {
      const parsed = JSON.parse(card.back_content);
      mcOptions = parsed.options || [];
      mcCorrectIdx = parsed.correctIndex ?? -1;
    } catch {}
  }

  // Render front content
  const renderFront = () => {
    if (isOcclusion && occlusionData?.imageUrl) {
      return <img src={occlusionData.imageUrl} alt="Oclusão" className="max-w-full max-h-[50vh] rounded-lg object-contain mx-auto" />;
    }
    if (isCloze) {
      const html = renderClozePreview(card.front_content, revealed, clozeTarget);
      return <div className="text-lg sm:text-xl leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (/<[a-z][\s\S]*>/i.test(card.front_content)) {
      return <div className="text-lg sm:text-xl leading-relaxed" dangerouslySetInnerHTML={{ __html: card.front_content }} />;
    }
    return <p className="text-lg sm:text-xl leading-relaxed whitespace-pre-wrap">{card.front_content}</p>;
  };

  // Render back content
  const renderBack = () => {
    if (isCloze) return null;
    if (isMultiple) {
      return (
        <div className="space-y-2.5 mt-6">
          {mcOptions.map((opt, i) => (
            <div key={i} className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
              revealed && i === mcCorrectIdx
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                : revealed
                ? 'border-border/30 text-muted-foreground'
                : 'border-border/60 text-foreground'
            }`}>
              <span className="font-medium mr-2">{String.fromCharCode(65 + i)})</span> {opt}
            </div>
          ))}
        </div>
      );
    }
    if (!revealed) return null;
    if (/<[a-z][\s\S]*>/i.test(card.back_content)) {
      return <div className="mt-6 pt-6 border-t border-border/30 text-base leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.back_content }} />;
    }
    return <p className="mt-6 pt-6 border-t border-border/30 text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">{card.back_content}</p>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-muted/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-card/80 shadow-sm" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border/50 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
            <span className="text-primary">{index + 1}</span>/{virtualCards.length} cartões
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

      {/* Card area with side arrows */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0 px-2 sm:px-4">
        {/* Left arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:flex h-10 w-10 rounded-full bg-card/80 shadow-sm shrink-0 absolute left-3 z-10 disabled:opacity-30"
          disabled={index === 0}
          onClick={goPrev}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {/* Card */}
        <div
          className="w-full max-w-2xl mx-auto cursor-pointer select-none"
          onClick={() => setRevealed(r => !r)}
        >
          <div className="bg-card rounded-2xl border border-border/30 shadow-lg mx-2 sm:mx-14 overflow-hidden">
            <div className="p-6 sm:p-8 min-h-[40vh] sm:min-h-[50vh] max-h-[70vh] overflow-y-auto flex flex-col justify-center">
              {renderFront()}
              {renderBack()}
            </div>
          </div>
          {!revealed && (
            <p className="text-center text-xs text-muted-foreground mt-4 animate-pulse">
              Toque para revelar
            </p>
          )}
        </div>

        {/* Right arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:flex h-10 w-10 rounded-full bg-card/80 shadow-sm shrink-0 absolute right-3 z-10 disabled:opacity-30"
          disabled={index === virtualCards.length - 1}
          onClick={goNext}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile bottom nav */}
      <div className="sm:hidden flex items-center justify-between px-6 py-4 shrink-0">
        <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" disabled={index === 0} onClick={goPrev}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-xs text-muted-foreground font-medium">{deck?.name}</span>
        <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" disabled={index === virtualCards.length - 1} onClick={goNext}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default CardPreviewSheet;
