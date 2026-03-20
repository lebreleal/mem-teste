/**
 * GlobalSearchDialog — Full-Text Search + Recent Cards modal.
 * Unified card-centric results with deck hierarchy, inline preview.
 * When no query: shows recent cards grouped by time (Notion-style).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, X } from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { sanitizeHtml } from '@/lib/sanitize';
import { IconDeck } from '@/components/icons';
import { useGlobalSearch, useRecentCards } from '@/hooks/useGlobalSearch';
import type { SearchResult, RecentCard } from '@/types/search';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
}

/* ─── Helpers ─── */

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function renderBreadcrumb(folderName?: string | null, parentDeckName?: string | null, deckName?: string) {
  const parts: string[] = [];
  if (folderName) parts.push(folderName);
  if (parentDeckName) parts.push(parentDeckName);
  if (deckName) parts.push(deckName);
  return parts.join(' › ');
}

/* ─── Time grouping for recent cards ─── */

interface TimeGroup {
  label: string;
  items: RecentCard[];
}

function groupByTime(cards: RecentCard[]): TimeGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; items: RecentCard[] }[] = [
    { label: 'Hoje', items: [] },
    { label: 'Ontem', items: [] },
    { label: 'Última semana', items: [] },
    { label: 'Último mês', items: [] },
    { label: 'Mais antigos', items: [] },
  ];

  for (const card of cards) {
    const d = new Date(card.updated_at);
    if (d >= today) groups[0].items.push(card);
    else if (d >= yesterday) groups[1].items.push(card);
    else if (d >= weekAgo) groups[2].items.push(card);
    else if (d >= monthAgo) groups[3].items.push(card);
    else groups[4].items.push(card);
  }

  return groups.filter(g => g.items.length > 0);
}

/* ─── Inline Card Preview ─── */

function CardPreviewInline({ front, back, cardType, onClose }: {
  front: string;
  back: string;
  cardType: string;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const isCloze = cardType === 'cloze' || /\{\{c\d+::.+?\}\}/.test(front);

  const frontHtml = useMemo(() => {
    if (isCloze) {
      return front.replace(
        /\{\{c(\d+)::(.+?)\}\}/g,
        (_, _num, answer) => revealed
          ? `<span style="color:hsl(var(--primary));font-weight:600">${answer}</span>`
          : `<span style="background:hsl(var(--primary)/0.15);color:hsl(var(--primary));padding:1px 6px;border-radius:4px">[...]</span>`,
      );
    }
    return front;
  }, [front, isCloze, revealed]);

  const showBack = revealed && !isCloze && back;

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Pré-visualização</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        className="text-sm leading-relaxed cursor-pointer select-none"
        onClick={() => setRevealed(r => !r)}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(frontHtml) }}
      />
      {showBack && (
        <div
          className="text-sm leading-relaxed text-muted-foreground border-t border-border/40 pt-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(back) }}
        />
      )}
      {!revealed && (
        <p className="text-[11px] text-muted-foreground/60 text-center">Toque para revelar</p>
      )}
    </div>
  );
}

/* ─── Card Row (shared between search results and recent) ─── */

interface CardRowProps {
  cardId: string;
  deckId: string;
  deckName: string;
  parentDeckName?: string | null;
  folderName?: string | null;
  displayText: string; // snippet HTML or plain text
  isHtml?: boolean;
  frontContent?: string | null;
  backContent?: string | null;
  cardType?: string | null;
  previewCardId: string | null;
  onNavigate: (deckId: string) => void;
  onPreview: (e: React.MouseEvent, cardId: string) => void;
}

function SearchCardRow({
  cardId, deckId, deckName, parentDeckName, folderName,
  displayText, isHtml, frontContent, backContent, cardType,
  previewCardId, onNavigate, onPreview,
}: CardRowProps) {
  const isPreviewOpen = previewCardId === cardId;

  return (
    <div>
      <CommandItem
        onSelect={() => onNavigate(deckId)}
        className="flex items-start gap-3 py-2.5 group"
      >
        <IconDeck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate">
            {renderBreadcrumb(folderName, parentDeckName, deckName)}
          </p>
          {isHtml ? (
            <p
              className="text-sm leading-relaxed line-clamp-2 mt-0.5 [&_b]:font-bold [&_b]:text-primary"
              dangerouslySetInnerHTML={{ __html: displayText }}
            />
          ) : (
            <p className="text-sm leading-relaxed line-clamp-2 mt-0.5 text-foreground">
              {displayText}
            </p>
          )}
        </div>
        {frontContent && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 transition-opacity"
            onClick={(e) => onPreview(e, cardId)}
            title="Pré-visualizar cartão"
          >
            <Eye className={`h-4 w-4 ${isPreviewOpen ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
        )}
      </CommandItem>
      {isPreviewOpen && frontContent && (
        <CardPreviewInline
          front={frontContent}
          back={backContent ?? ''}
          cardType={cardType ?? 'basic'}
          onClose={() => onPreview({ stopPropagation: () => {} } as React.MouseEvent, '')}
        />
      )}
    </div>
  );
}

/* ─── Main dialog ─── */

const GlobalSearchDialog = ({ open, onOpenChange, folderId }: GlobalSearchDialogProps) => {
  const [query, setQuery] = useState('');
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const { results, isLoading, hasQuery } = useGlobalSearch(query, { folderId });
  const { recentCards, isLoading: recentLoading } = useRecentCards({ folderId, enabled: open });
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPreviewCardId(null);
    }
  }, [open]);

  const handleNavigate = useCallback((deckId: string) => {
    onOpenChange(false);
    navigate(`/decks/${deckId}`);
  }, [navigate, onOpenChange]);

  const handlePreview = useCallback((e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    setPreviewCardId(prev => prev === cardId ? null : cardId);
  }, []);

  const timeGroups = useMemo(() => {
    if (hasQuery) return [];
    return groupByTime(recentCards);
  }, [recentCards, hasQuery]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Buscar decks e cartões..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Search results mode */}
        {hasQuery && !isLoading && results.length === 0 && (
          <CommandEmpty>Nenhum resultado para "{query}"</CommandEmpty>
        )}

        {isLoading && hasQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Buscando...
          </div>
        )}

        {hasQuery && results.length > 0 && (
          <CommandGroup heading="Resultados">
            {results.map((result) => {
              const cardId = result.card_id ?? `deck-${result.deck_id}`;
              return (
                <SearchCardRow
                  key={cardId}
                  cardId={cardId}
                  deckId={result.deck_id}
                  deckName={result.deck_name}
                  parentDeckName={result.parent_deck_name}
                  folderName={result.folder_name}
                  displayText={result.snippet}
                  isHtml
                  frontContent={result.front_content}
                  backContent={result.back_content}
                  cardType={result.card_type}
                  previewCardId={previewCardId}
                  onNavigate={handleNavigate}
                  onPreview={handlePreview}
                />
              );
            })}
          </CommandGroup>
        )}

        {/* Recent cards mode (no query) */}
        {!hasQuery && recentLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Carregando recentes...
          </div>
        )}

        {!hasQuery && !recentLoading && timeGroups.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Search className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum cartão encontrado
          </div>
        )}

        {!hasQuery && timeGroups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((card) => (
              <SearchCardRow
                key={card.card_id}
                cardId={card.card_id}
                deckId={card.deck_id}
                deckName={card.deck_name}
                parentDeckName={card.parent_deck_name}
                folderName={card.folder_name}
                displayText={truncate(stripHtml(card.front_content))}
                frontContent={card.front_content}
                backContent={card.back_content}
                cardType={card.card_type}
                previewCardId={previewCardId}
                onNavigate={handleNavigate}
                onPreview={handlePreview}
              />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};

export default GlobalSearchDialog;
