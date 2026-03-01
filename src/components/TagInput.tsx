/**
 * Tag input component with autocomplete.
 * Used for associating tags to decks and cards.
 */

import { useState, useRef, useEffect } from 'react';
import { X, Plus, Tag as TagIcon, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTagSearch } from '@/hooks/useTags';
import type { Tag } from '@/types/tag';

interface TagInputProps {
  tags: Tag[];
  onAdd: (tag: Tag | string) => void;
  onRemove: (tagId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxTags?: number;
}

export function TagInput({
  tags,
  onAdd,
  onRemove,
  disabled = false,
  placeholder = 'Adicionar tag...',
  maxTags = 20,
}: TagInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: suggestions = [] } = useTagSearch(query);

  // Filter out already-added tags
  const filtered = suggestions.filter(
    (s) => !tags.some((t) => t.id === s.id)
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (tag: Tag) => {
    onAdd(tag);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleCreateNew = () => {
    if (!query.trim()) return;
    onAdd(query.trim());
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) {
        handleSelect(filtered[0]);
      } else if (query.trim()) {
        handleCreateNew();
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
    if (e.key === 'Backspace' && !query && tags.length > 0) {
      onRemove(tags[tags.length - 1].id);
    }
  };

  const atLimit = tags.length >= maxTags;

  return (
    <div ref={containerRef} className="relative">
      {/* Tags display */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="gap-1 pr-1 text-xs"
          >
            {tag.is_official && <Crown className="h-3 w-3 text-warning" />}
            <TagIcon className="h-3 w-3 opacity-50" />
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(tag.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>

      {/* Input */}
      {!disabled && !atLimit && (
        <div className="relative">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-8 text-sm"
          />

          {/* Dropdown */}
          {open && (query || filtered.length > 0) && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
              {filtered.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleSelect(tag)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  {tag.is_official && <Crown className="h-3 w-3 text-warning shrink-0" />}
                  <TagIcon className="h-3 w-3 opacity-50 shrink-0" />
                  <span className="truncate">{tag.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {tag.usage_count}
                  </span>
                </button>
              ))}

              {/* Create new option */}
              {query.trim() && !filtered.some(
                (t) => t.name.toLowerCase() === query.trim().toLowerCase()
              ) && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left border-t border-border"
                >
                  <Plus className="h-3 w-3 text-primary shrink-0" />
                  <span>
                    Criar "<span className="font-medium">{query.trim()}</span>"
                  </span>
                </button>
              )}

              {!query.trim() && filtered.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Nenhuma tag encontrada
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {atLimit && !disabled && (
        <p className="text-[10px] text-muted-foreground">
          Limite de {maxTags} tags atingido
        </p>
      )}
    </div>
  );
}
