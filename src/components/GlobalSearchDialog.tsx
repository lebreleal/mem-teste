/**
 * GlobalSearchDialog — Full-Text Search modal using cmdk.
 * Unified card-centric results: each result shows deck hierarchy + card snippet.
 * Inline preview via eye icon; click result to navigate to deck.
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
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import type { SearchResult } from '@/types/search';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
}

/* ─── Inline Card Preview ─── */

function CardPreviewInline({ result, onClose }: { result: SearchResult; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);

  const isCloze = result.card_type === 'cloze' || (result.front_content && /\{\{c\d+::.+?\}\}/.test(result.front_content));

  const frontHtml = useMemo(() => {
    if (!result.front_content) return '';
    if (isCloze) {
      return result.front_content.replace(
        /\{\{c(\d+)::(.+?)\}\}/g,
        (_, _num, answer) => revealed
          ? `<span style="color:hsl(var(--primary));font-weight:600">${answer}</span>`
          : `<span style="background:hsl(var(--primary)/0.15);color:hsl(var(--primary));padding:1px 6px;border-radius:4px">[...]</span>`,
      );
    }
    return result.front_content;
  }, [result.front_content, isCloze, revealed]);

  const showBack = revealed && !isCloze && result.back_content;

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
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(result.back_content!) }}
        />
      )}

      {!revealed && (
        <p className="text-[11px] text-muted-foreground/60 text-center">Toque para revelar</p>
      )}
    </div>
  );
}

/* ─── Main dialog ─── */

const GlobalSearchDialog = ({ open, onOpenChange, folderId }: GlobalSearchDialogProps) => {
  const [query, setQuery] = useState('');
  const [previewResult, setPreviewResult] = useState<SearchResult | null>(null);
  const { results, isLoading, hasQuery } = useGlobalSearch(query, { folderId });
  const navigate = useNavigate();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setPreviewResult(null);
    }
  }, [open]);

  const handleNavigate = useCallback((deckId: string) => {
    onOpenChange(false);
    navigate(`/decks/${deckId}`);
  }, [navigate, onOpenChange]);

  const handlePreview = useCallback((e: React.MouseEvent, result: SearchResult) => {
    e.stopPropagation();
    setPreviewResult(prev => prev?.card_id === result.card_id && prev?.deck_id === result.deck_id ? null : result);
  }, []);

  const renderBreadcrumb = (result: SearchResult) => {
    const parts: string[] = [];
    if (result.folder_name) parts.push(result.folder_name);
    if (result.parent_deck_name) parts.push(result.parent_deck_name);
    parts.push(result.deck_name);
    return parts.join(' › ');
  };

  // Merge deck-only and card results into a unified list
  // For deck-only results (no card_id), show just the deck row
  // For card results, show deck hierarchy + snippet

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Buscar decks e cartões..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {hasQuery && !isLoading && results.length === 0 && (
          <CommandEmpty>Nenhum resultado para "{query}"</CommandEmpty>
        )}

        {!hasQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Search className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Digite para buscar nos seus decks e cartões
          </div>
        )}

        {isLoading && hasQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Buscando...
          </div>
        )}

        {results.length > 0 && (
          <CommandGroup heading="Resultados">
            {results.map((result) => {
              const key = result.card_id
                ? `card-${result.card_id}`
                : `deck-${result.deck_id}`;
              const isPreviewOpen = previewResult?.card_id === result.card_id
                && previewResult?.deck_id === result.deck_id;

              return (
                <div key={key}>
                  <CommandItem
                    onSelect={() => handleNavigate(result.deck_id)}
                    className="flex items-start gap-3 py-2.5 group"
                  >
                    <IconDeck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      {/* Deck hierarchy breadcrumb */}
                      <p className="text-xs font-medium text-muted-foreground truncate">
                        {renderBreadcrumb(result)}
                      </p>

                      {/* Card snippet (for card results) */}
                      {result.card_id && result.snippet && (
                        <p
                          className="text-sm leading-relaxed line-clamp-2 mt-0.5 [&_b]:font-bold [&_b]:text-primary"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                      )}

                      {/* Deck name highlight (for deck-only results) */}
                      {!result.card_id && (
                        <p
                          className="text-sm font-medium mt-0.5 [&_b]:font-bold [&_b]:text-primary"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                      )}
                    </div>

                    {/* Preview button (only for card results) */}
                    {result.card_id && result.front_content && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 transition-opacity"
                        onClick={(e) => handlePreview(e, result)}
                        title="Pré-visualizar cartão"
                      >
                        <Eye className={`h-4 w-4 ${isPreviewOpen ? 'text-primary' : 'text-muted-foreground'}`} />
                      </Button>
                    )}
                  </CommandItem>

                  {/* Inline card preview */}
                  {isPreviewOpen && result.front_content && (
                    <CardPreviewInline
                      result={result}
                      onClose={() => setPreviewResult(null)}
                    />
                  )}
                </div>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

export default GlobalSearchDialog;
