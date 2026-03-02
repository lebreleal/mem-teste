/**
 * Card review step: edit, delete, toggle type, and save generated cards.
 * Includes mandatory tag selection with AI suggestions before saving.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import LazyRichEditor from '@/components/LazyRichEditor';
import { ChevronLeft, Check, Pencil, Trash2, Loader2, Tag as TagIcon, Sparkles, Plus, Crown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { sanitizeHtml } from '@/lib/sanitize';
import { useTagSearch, useTagSuggestions } from '@/hooks/useTags';
import type { Tag } from '@/types/tag';
import type { TagTreeNode } from '@/services/tagService';
import type { GeneratedCard } from './types';

interface CardReviewStepProps {
  cards: GeneratedCard[];
  editingIdx: number | null;
  editFront: string;
  editBack: string;
  onEditFrontChange: (v: string) => void;
  onEditBackChange: (v: string) => void;
  onStartEdit: (i: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteCard: (i: number) => void;
  onToggleType: (i: number) => void;
  onSave: (selectedTags: (Tag | string)[]) => void;
  onBack: () => void;
  isSaving: boolean;
  deckName?: string;
  textSample?: string;
}

const CardReviewStep = ({
  cards, editingIdx, editFront, editBack,
  onEditFrontChange, onEditBackChange, onStartEdit, onSaveEdit, onCancelEdit,
  onDeleteCard, onToggleType, onSave, onBack, isSaving,
  deckName, textSample,
}: CardReviewStepProps) => {
  // Tag state
  const [selectedTags, setSelectedTags] = useState<(Tag | string)[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ name: string; isExisting: boolean }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const { data: searchResults = [] } = useTagSearch(tagQuery);
  const aiSuggest = useTagSuggestions();

  // Auto-trigger AI suggestions on mount
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!deckName && !textSample) return;
      setAiLoading(true);
      try {
        const result = await aiSuggest.mutateAsync({
          textContent: textSample,
          deckName: deckName,
          existingTagNames: [],
        });
        setAiSuggestions(result);
      } catch {
        // silently fail
      } finally {
        setAiLoading(false);
      }
    };
    fetchSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTagName = (t: Tag | string) => typeof t === 'string' ? t : t.name;
  const getTagId = (t: Tag | string) => typeof t === 'string' ? t : t.id;

  const addTag = (tag: Tag | string) => {
    const name = getTagName(tag).toLowerCase();
    if (selectedTags.some(t => getTagName(t).toLowerCase() === name)) return;
    setSelectedTags(prev => [...prev, tag]);
    setTagQuery('');
    setTagDropdownOpen(false);
    // Remove from AI suggestions
    setAiSuggestions(prev => prev.filter(s => s.name.toLowerCase() !== name));
  };

  const removeTag = (idx: number) => {
    setSelectedTags(prev => prev.filter((_, i) => i !== idx));
  };

  const filteredSearch = searchResults.filter(
    s => !selectedTags.some(t => getTagName(t).toLowerCase() === s.name.toLowerCase())
  );

  const hasMinTags = selectedTags.length >= 1;

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{cards.length}</span> cartões gerados
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[45dvh] sm:max-h-[50vh]">
        <div className="space-y-2">
          {cards.map((card, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-2">
              {editingIdx === idx ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frente</Label>
                    <LazyRichEditor
                      content={editFront}
                      onChange={onEditFrontChange}
                      placeholder="Frente do cartão"
                      hideCloze={card.type !== 'cloze'}
                    />
                  </div>
                  {card.type !== 'multiple_choice' && card.type !== 'cloze' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Verso</Label>
                      <LazyRichEditor
                        content={editBack}
                        onChange={onEditBackChange}
                        placeholder="Verso do cartão"
                        hideCloze
                      />
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancelar</Button>
                    <Button size="sm" onClick={onSaveEdit} className="gap-1"><Check className="h-3 w-3" /> Salvar</Button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-bold text-foreground leading-snug [&_img]:max-h-20 [&_img]:rounded"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front) }}
                    />
                    {card.type === 'multiple_choice' && card.options ? (
                      <div className="mt-1 space-y-0.5">
                        {card.options.map((opt, oi) => (
                          <div key={oi} className={`text-[10px] leading-snug ${oi === card.correctIndex ? 'text-success font-bold' : 'text-muted-foreground'}`}>
                            {oi === card.correctIndex ? '✓ ' : '  '}
                            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
                          </div>
                        ))}
                      </div>
                    ) : (card.type !== 'cloze' && card.back) ? (
                      <div
                        className="text-xs text-muted-foreground mt-1 leading-snug [&_img]:max-h-20 [&_img]:rounded"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back) }}
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onToggleType(idx)}
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border transition-colors ${
                        card.type === 'cloze' ? 'border-primary/40 bg-primary/10 text-primary'
                        : card.type === 'multiple_choice' ? 'border-warning/40 bg-warning/10 text-warning'
                        : 'border-border hover:bg-muted'
                      }`}>
                      {card.type === 'cloze' ? 'Cloze' : card.type === 'multiple_choice' ? 'Múltipla' : 'Básico'}
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onStartEdit(idx)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteCard(idx)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tag Selection (mandatory) ── */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Tags do baralho</p>
          <span className="text-[10px] text-muted-foreground">(obrigatório)</span>
        </div>

        {/* Selected tags */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedTags.map((tag, idx) => (
              <Badge key={getTagId(tag)} variant="secondary" className="gap-1 pr-1 text-xs">
                <TagIcon className="h-3 w-3 opacity-50" />
                {getTagName(tag)}
                <button type="button" onClick={() => removeTag(idx)} className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* AI Suggestions chips */}
        {(aiSuggestions.length > 0 || aiLoading) && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
              <Sparkles className="h-3 w-3 text-primary" /> Sugestões:
            </span>
            {aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              aiSuggestions.map(s => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => addTag(s.name)}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {s.name}
                  {s.isExisting && <Crown className="h-2.5 w-2.5 text-warning" />}
                </button>
              ))
            )}
          </div>
        )}

        {/* Free-form tag input */}
        <div className="relative">
          <Input
            value={tagQuery}
            onChange={e => { setTagQuery(e.target.value); setTagDropdownOpen(true); }}
            onFocus={() => setTagDropdownOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredSearch.length > 0) addTag(filteredSearch[0]);
                else if (tagQuery.trim()) addTag(tagQuery.trim());
              }
              if (e.key === 'Escape') setTagDropdownOpen(false);
            }}
            placeholder="Buscar ou criar tag..."
            className="h-8 text-sm"
          />
          {tagDropdownOpen && (tagQuery || filteredSearch.length > 0) && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-36 overflow-y-auto">
              {filteredSearch.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                >
                  {tag.is_official && <Crown className="h-3 w-3 text-warning shrink-0" />}
                  <TagIcon className="h-3 w-3 opacity-50 shrink-0" />
                  <span className="truncate">{(tag as TagTreeNode).pathLabel || tag.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">{tag.usage_count}</span>
                </button>
              ))}
              {tagQuery.trim() && !filteredSearch.some(t => t.name.toLowerCase() === tagQuery.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => addTag(tagQuery.trim())}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left border-t border-border"
                >
                  <Plus className="h-3 w-3 text-primary shrink-0" />
                  <span>Criar "<span className="font-medium">{tagQuery.trim()}</span>"</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Reconfigurar
        </Button>
        <Button
          onClick={() => onSave(selectedTags)}
          disabled={cards.length === 0 || isSaving || !hasMinTags}
          className="flex-1 gap-2"
          title={!hasMinTags ? 'Selecione pelo menos 1 tag' : undefined}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar {cards.length} cartões
        </Button>
      </div>
    </div>
  );
};

export default CardReviewStep;
