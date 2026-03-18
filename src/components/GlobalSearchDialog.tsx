/**
 * GlobalSearchDialog — Full-Text Search modal using cmdk.
 * Shows decks and cards matching the query with highlighted snippets.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Layers } from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
}

const GlobalSearchDialog = ({ open, onOpenChange, folderId }: GlobalSearchDialogProps) => {
  const [query, setQuery] = useState('');
  const { decks, cards, isLoading, hasQuery } = useGlobalSearch(query, { folderId });
  const navigate = useNavigate();

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const handleSelect = useCallback((resultType: string, deckId: string, cardId?: string | null) => {
    onOpenChange(false);
    if (resultType === 'deck') {
      navigate(`/decks/${deckId}`);
    } else if (cardId) {
      navigate(`/decks/${deckId}/manage`);
    }
  }, [navigate, onOpenChange]);

  const renderBreadcrumb = (deckName: string, parentDeckName?: string | null, folderName?: string | null) => {
    const parts: string[] = [];
    if (folderName) parts.push(folderName);
    if (parentDeckName) parts.push(parentDeckName);
    parts.push(deckName);
    return parts.join(' › ');
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Buscar decks e cartões..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {hasQuery && !isLoading && decks.length === 0 && cards.length === 0 && (
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

        {decks.length > 0 && (
          <CommandGroup heading="Decks">
            {decks.map((result) => (
              <CommandItem
                key={`deck-${result.deck_id}`}
                onSelect={() => handleSelect('deck', result.deck_id)}
                className="flex items-start gap-3 py-2.5"
              >
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                  {(result.parent_deck_name || result.folder_name) && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {renderBreadcrumb(result.deck_name, result.parent_deck_name, result.folder_name)}
                    </p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {cards.length > 0 && (
          <CommandGroup heading="Cartões">
            {cards.map((result) => (
              <CommandItem
                key={`card-${result.card_id}`}
                onSelect={() => handleSelect('card', result.deck_id, result.card_id)}
                className="flex items-start gap-3 py-2.5"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm leading-relaxed line-clamp-2 [&_b]:font-bold [&_b]:text-primary"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    em {renderBreadcrumb(result.deck_name, result.parent_deck_name, result.folder_name)}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

export default GlobalSearchDialog;
