/**
 * CardPreviewSheet – full-screen card browser opened when clicking a card in the list.
 * Shows front content; tap to reveal back. Navigate with arrows.
 */

import { useState, useEffect, useCallback } from 'react';
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

interface Props {
  cards: CardRow[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

const CardPreviewSheet = ({ cards, initialIndex, open, onClose }: Props) => {
  const { openEdit, setDeleteId, setMoveCardId, deck } = useDeckDetail();
  const [index, setIndex] = useState(initialIndex);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setIndex(initialIndex); setRevealed(false); }, [initialIndex]);

  const card = cards[index];

  const goPrev = useCallback(() => {
    if (index > 0) { setIndex(i => i - 1); setRevealed(false); }
  }, [index]);

  const goNext = useCallback(() => {
    if (index < cards.length - 1) { setIndex(i => i + 1); setRevealed(false); }
  }, [index, cards.length]);

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

  // Parse cloze target
  let clozeTarget: number | undefined;
  if (isCloze) {
    try {
      const parsed = JSON.parse(card.back_content);
      if (typeof parsed.clozeTarget === 'number') clozeTarget = parsed.clozeTarget;
    } catch {}
  }

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
    // Check if HTML
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
          {index + 1}/{cards.length} cartões
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
          {!revealed && !isCloze && (
            <p className="text-center text-xs text-muted-foreground mt-4">Toque para revelar</p>
          )}
          {!revealed && isCloze && (
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
        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" disabled={index === cards.length - 1} onClick={goNext}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default CardPreviewSheet;
