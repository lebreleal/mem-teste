/**
 * Tag input component with autocomplete, hierarchy paths, and AI suggestions.
 */

import { useState, useRef, useEffect } from 'react';
import { X, Plus, Tag as TagIcon, BadgeCheck, Sparkles, Loader2, ChevronRight, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTagSearch, useTagSuggestions } from '@/hooks/useTags';
import type { Tag } from '@/types/tag';
import type { TagTreeNode } from '@/services/tagService';

interface TagInputProps {
  tags: Tag[];
  onAdd: (tag: Tag | string) => void;
  onRemove: (tagId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxTags?: number;
  aiContext?: { textContent?: string; deckName?: string };
}

export function TagInput({
  tags,
  onAdd,
  onRemove,
  disabled = false,
  placeholder = 'Adicionar tag...',
  maxTags = 20,
  aiContext,
}: TagInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: suggestions = [] } = useTagSearch(query);
  const aiSuggest = useTagSuggestions();

  const [aiSuggestions, setAiSuggestions] = useState<{ name: string; isExisting: boolean }[]>([]);

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
    // Stop propagation for all keys to prevent parent dialogs/sheets from intercepting
    e.stopPropagation();
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

  const [confirmAI, setConfirmAI] = useState(false);

  const handleAISuggest = async () => {
    if (!aiContext) return;
    setConfirmAI(false);
    try {
      const result = await aiSuggest.mutateAsync({
        textContent: aiContext.textContent,
        deckName: aiContext.deckName,
        existingTagNames: tags.map(t => t.name),
      });
      setAiSuggestions(result);
    } catch {
      // silently fail
    }
  };

  const handleAcceptAISuggestion = (name: string) => {
    const existing = suggestions.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      onAdd(existing);
    } else {
      onAdd(name);
    }
    setAiSuggestions(prev => prev.filter(s => s.name !== name));
  };

  const atLimit = tags.length >= maxTags;

  /** Render path segments with chevrons for hierarchy */
  const renderTagPath = (tag: TagTreeNode) => {
    if (!tag.pathLabel || !tag.pathLabel.includes(' > ')) {
      return <span className="truncate">{tag.name}</span>;
    }
    const segments = tag.pathLabel.split(' > ');
    return (
      <span className="flex items-center gap-0.5 truncate">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />}
            <span className={i === segments.length - 1 ? 'font-medium' : 'text-muted-foreground'}>
              {seg}
            </span>
          </span>
        ))}
      </span>
    );
  };

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
            <TagIcon className="h-3 w-3 opacity-50" />
            {tag.name}
            {tag.is_official && <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
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

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
            <Sparkles className="h-3 w-3 text-primary" /> Sugestões IA:
          </span>
          {aiSuggestions.map(s => (
            <button
              key={s.name}
              type="button"
              onClick={() => handleAcceptAISuggestion(s.name)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {s.name}
              {s.isExisting && <BadgeCheck className="h-3 w-3 text-blue-500" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAiSuggestions([])}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Input + AI button */}
      {!disabled && !atLimit && (
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
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
                    <TagIcon className="h-3 w-3 opacity-50 shrink-0" />
                    {renderTagPath(tag as TagTreeNode)}
                    {tag.is_official && <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
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

          {/* AI Suggest button */}
          {aiContext && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleAISuggest}
              disabled={aiSuggest.isPending}
              title="Sugerir tags com IA"
            >
              {aiSuggest.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
            </Button>
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
