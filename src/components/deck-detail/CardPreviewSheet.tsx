/**
 * CardPreviewSheet – full-screen card browser opened when clicking a card in the list.
 * Shows front content; tap to reveal back. Navigate with arrows.
 * Cloze cards: each cloze number (c1, c2...) is shown as a separate virtual card.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, PenLine, MoreVertical, Trash2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeckDetail } from './DeckDetailContext';
import type { CardRow } from '@/types/deck';

/** Render cloze for preview: hide target cloze, show others as plain text */
function renderClozePreview(html: string, revealed: boolean, targetNum?: number): string {
  return html.replace(/\{\{c(\d+)::(.+?)\}\}/g, (_, num, answer) => {
    const n = parseInt(num);
    if (targetNum !== undefined && n !== targetNum) return answer;
    if (revealed) return `<span style="color:hsl(var(--primary));font-weight:600">${answer}</span>`;
    return `<span style="background:hsl(var(--primary));color:hsl(var(--primary));border-radius:4px;padding:0 4px">[...]</span>`;
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
      // Group key is front_content for cloze cards
      const groupKey = card.front_content;
      if (processedClozeGroups.has(groupKey)) return;
      processedClozeGroups.add(groupKey);

      // Find all siblings with same front_content
      const siblings = cards.filter(c => c.card_type === 'cloze' && c.front_content === groupKey);
      
      // Extract cloze targets from each sibling and create virtual cards
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

  // Map initial flat index to virtual index
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
      return <img src={occlusionData.imageUrl} alt="Oclusão" className="max-w-full max-h-[60vh] rounded-lg object-contain mx-auto" />;
    }
    if (isCloze) {
      const html = renderClozePreview(card.front_content, revealed, clozeTarget);
      return <div className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (/<[a-z][\s\S]*>/i.test(card.front_content)) {
      return <div className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: card.front_content }} />;
    }
    return <p className="text-base leading-relaxed whitespace-pre-wrap">{card.front_content}</p>;
  };

  // Render back content
  const renderBack = () => {
    if (isCloze) return null; // cloze reveals inline
    if (isMultiple) {
      return (
        <div className="space-y-2 mt-4">
          {mcOptions.map((opt, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${
              revealed && i === mcCorrectIdx
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                : revealed
                ? 'border-border/40 text-muted-foreground'
                : 'border-border/60 text-foreground'
            }`}>
              {String.fromCharCode(65 + i)}) {opt}
            </div>
          ))}
        </div>
      );
    }
    if (!revealed) return null;
    if (/<[a-z][\s\S]*>/i.test(card.back_content)) {
      return <div className="mt-4 pt-4 border-t border-border/40 text-sm leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.back_content }} />;
    }
    return <p className="mt-4 pt-4 border-t border-border/40 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{card.back_content}</p>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {index + 1}/{virtualCards.length} cartões
          {isCloze && clozeTarget && (
            <span className="ml-1 text-primary font-semibold">· c{clozeTarget}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { onClose(); openEdit(card); }}>
            <PenLine className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { onClose(); setMoveCardId(card.id); }}>
                <ArrowUpRight className="mr-2 h-4 w-4" /> Mover
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => { onClose(); setDeleteId(card.id); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card content */}
      <div className="flex-1 overflow-auto relative" onClick={() => setRevealed(r => !r)}>
        <div className="max-w-lg mx-auto px-5 py-8">
          <div className="bg-card rounded-2xl border border-border/40 shadow-sm p-6 min-h-[200px]">
            {renderFront()}
            {renderBack()}
          </div>
          {!revealed && (
            <p className="text-center text-xs text-muted-foreground mt-4">Toque para revelar</p>
          )}
        </div>
      </div>

      {/* Navigation arrows */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" disabled={index === 0} onClick={goPrev}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-xs text-muted-foreground">{deck?.name}</span>
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" disabled={index === virtualCards.length - 1} onClick={goNext}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default CardPreviewSheet;