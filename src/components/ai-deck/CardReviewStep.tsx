/**
 * Card review step: edit, delete, toggle type, and save generated cards.
 * Includes mandatory tag selection with AI suggestions before saving.
 * Card list and edit dialog match ManageDeck.tsx for consistency.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import LazyRichEditor from '@/components/LazyRichEditor';
import { ChevronLeft, Check, Pencil, Trash2, Loader2, Tag as TagIcon, Sparkles, Plus, X, MessageSquareText, CheckSquare, PenLine } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useTagSearch, useTagSuggestions } from '@/hooks/useTags';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
  onSaveEdit: (extraData?: { mcOptions?: string[]; mcCorrectIndex?: number }) => void;
  onCancelEdit: () => void;
  onDeleteCard: (i: number) => void;
  onToggleType: (i: number) => void;
  onSave: (selectedTags: (Tag | string)[]) => void;
  onBack?: (() => void) | undefined;
  isSaving: boolean;
  deckName?: string;
  textSample?: string;
}

/* Cloze preview colors */
const CLOZE_COLORS = [
  'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40',
  'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
  'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
];
const DOT_COLORS = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

const ClozePreview = ({ text }: { text: string }) => {
  const plainText = text.replace(/<[^>]*>/g, '');
  const clozeRegex = /\{\{c(\d+)::([^}]*)\}\}/g;
  const clozeNumbers = new Set<number>();
  let match;
  while ((match = clozeRegex.exec(plainText)) !== null) {
    clozeNumbers.add(parseInt(match[1]));
  }
  const sortedNumbers = Array.from(clozeNumbers).sort((a, b) => a - b);
  if (sortedNumbers.length === 0) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex2 = /\{\{c(\d+)::([^}]*)\}\}/g;
  let m;
  let key = 0;
  while ((m = regex2.exec(plainText)) !== null) {
    if (m.index > lastIndex) parts.push(<span key={key++}>{plainText.slice(lastIndex, m.index)}</span>);
    const num = parseInt(m[1]);
    const colorIdx = sortedNumbers.indexOf(num) % CLOZE_COLORS.length;
    parts.push(
      <span key={key++} className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 border font-medium ${CLOZE_COLORS[colorIdx]}`}>
        <span className="text-[9px] font-bold opacity-70">{num}</span>
        {m[2]}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < plainText.length) parts.push(<span key={key++}>{plainText.slice(lastIndex)}</span>);

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="p-3 text-sm leading-relaxed">{parts}</div>
      <div className="border-t border-border bg-muted/30 px-3 py-2 flex items-center gap-2 flex-wrap">
        {sortedNumbers.map((n, i) => (
          <span key={n} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
            Cloze {n}
          </span>
        ))}
        {sortedNumbers.length > 1 && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {sortedNumbers.length} cards vinculados
          </span>
        )}
      </div>
    </div>
  );
};

const getTypeBadge = (type: string) => {
  if (type === 'cloze') return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary">Cloze</span>;
  if (type === 'multiple_choice') return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-warning/40 bg-warning/10 text-warning">Múltipla</span>;
  return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-border">Básico</span>;
};

const CardReviewStep = ({
  cards, editingIdx, editFront, editBack,
  onEditFrontChange, onEditBackChange, onStartEdit, onSaveEdit, onCancelEdit,
  onDeleteCard, onToggleType, onSave, onBack, isSaving,
  deckName, textSample,
}: CardReviewStepProps) => {
  const { toast } = useToast();
  // Tag state
  const [selectedTags, setSelectedTags] = useState<(Tag | string)[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ name: string; isExisting: boolean }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showTagWarning, setShowTagWarning] = useState(false);

  // MC editing state for inline editing
  const [editMcOptions, setEditMcOptions] = useState<string[]>(['', '', '', '']);
  const [editMcCorrectIndex, setEditMcCorrectIndex] = useState(0);

  // Dialog open state
  const [dialogOpen, setDialogOpen] = useState(false);

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

  // Parse MC data when starting edit on MC card
  useEffect(() => {
    if (editingIdx !== null && cards[editingIdx]?.type === 'multiple_choice') {
      const card = cards[editingIdx];
      setEditMcOptions(card.options || ['', '', '', '']);
      setEditMcCorrectIndex(card.correctIndex ?? 0);
    }
  }, [editingIdx, cards]);

  // Open dialog when editing starts
  useEffect(() => {
    if (editingIdx !== null) {
      setDialogOpen(true);
    }
  }, [editingIdx]);

  const getTagName = (t: Tag | string) => typeof t === 'string' ? t : t.name;
  const getTagId = (t: Tag | string) => typeof t === 'string' ? t : t.id;

  const addTag = (tag: Tag | string) => {
    const name = getTagName(tag).toLowerCase();
    if (selectedTags.some(t => getTagName(t).toLowerCase() === name)) return;
    setSelectedTags(prev => [...prev, tag]);
    setTagQuery('');
    setTagDropdownOpen(false);
    setShowTagWarning(false);
    setAiSuggestions(prev => prev.filter(s => s.name.toLowerCase() !== name));
  };

  const removeTag = (idx: number) => {
    setSelectedTags(prev => prev.filter((_, i) => i !== idx));
  };

  const filteredSearch = searchResults.filter(
    s => !selectedTags.some(t => getTagName(t).toLowerCase() === s.name.toLowerCase())
  );

  const hasMinTags = selectedTags.length >= 1;

  const handleSaveClick = () => {
    if (!hasMinTags) {
      setShowTagWarning(true);
      toast({
        title: '🏷️ Selecione pelo menos 1 tag',
        description: 'Escolha uma das tags sugeridas ou crie a sua própria para categorizar o baralho.',
        variant: 'destructive',
      });
      return;
    }
    onSave(selectedTags);
  };

  const addMcOption = () => {
    if (editMcOptions.length < 6) setEditMcOptions([...editMcOptions, '']);
  };

  const removeMcOption = (idx: number) => {
    if (editMcOptions.length <= 2) return;
    const newOpts = editMcOptions.filter((_, i) => i !== idx);
    setEditMcOptions(newOpts);
    if (editMcCorrectIndex >= newOpts.length) setEditMcCorrectIndex(newOpts.length - 1);
    else if (editMcCorrectIndex === idx) setEditMcCorrectIndex(0);
    else if (editMcCorrectIndex > idx) setEditMcCorrectIndex(editMcCorrectIndex - 1);
  };

  const handleSaveEditClick = () => {
    if (editingIdx !== null && cards[editingIdx]?.type === 'multiple_choice') {
      onSaveEdit({ mcOptions: editMcOptions, mcCorrectIndex: editMcCorrectIndex });
    } else {
      onSaveEdit();
    }
    setDialogOpen(false);
  };

  const handleCancelEdit = () => {
    onCancelEdit();
    setDialogOpen(false);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      handleCancelEdit();
    }
    setDialogOpen(open);
  };

  /**
   * Renders the card editor form inside dialog — mirrors ManageDeck.tsx exactly
   */
  const renderCardEditor = () => {
    if (editingIdx === null) return null;
    const card = cards[editingIdx];
    if (!card) return null;

    if (card.type === 'multiple_choice') {
      return (
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Pergunta</Label>
            <LazyRichEditor
              content={editFront}
              onChange={onEditFrontChange}
              placeholder="Qual organela é responsável pela produção de energia?"
            />
          </div>
          <div className="space-y-2">
            <Label className="block">Opções</Label>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              {editMcOptions.map((opt, idx) => (
                <div
                  key={idx}
                  onClick={() => setEditMcCorrectIndex(idx)}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    editMcCorrectIndex === idx ? 'bg-success/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                    editMcCorrectIndex === idx ? 'border-success bg-success text-white' : 'border-muted-foreground/30'
                  }`}>
                    {editMcCorrectIndex === idx && <span className="text-[10px] font-bold">✓</span>}
                  </div>
                  <Input
                    value={opt}
                    onChange={e => {
                      e.stopPropagation();
                      const newOpts = [...editMcOptions];
                      newOpts[idx] = e.target.value;
                      setEditMcOptions(newOpts);
                    }}
                    onClick={e => e.stopPropagation()}
                    placeholder={`Opção ${idx + 1}`}
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto py-0"
                  />
                  {editMcOptions.length > 2 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); removeMcOption(idx); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {editMcOptions.length < 6 && (
              <Button variant="ghost" size="sm" onClick={addMcOption} className="gap-1 w-full text-muted-foreground hover:text-foreground">
                <Plus className="h-3 w-3" /> Adicionar opção
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground">Clique na linha para marcar a resposta correta</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
            <Button onClick={handleSaveEditClick}>Salvar</Button>
          </div>
        </div>
      );
    }

    if (card.type === 'cloze') {
      return (
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Texto com lacunas</Label>
            <LazyRichEditor
              content={editFront}
              onChange={onEditFrontChange}
              placeholder="A {{c1::mitocôndria}} é responsável pela respiração celular."
            />
          </div>
          <ClozePreview text={editFront} />
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Como usar</p>
            <p className="text-xs text-muted-foreground">
              Selecione o texto e clique em <code className="text-primary font-mono bg-primary/10 px-1 rounded">{'{ }'}</code> na barra de ferramentas
            </p>
            <p className="text-[11px] text-muted-foreground">
              Mesmo número (c1, c1) = mesma lacuna. Números diferentes (c1, c2) = cards separados vinculados.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
            <Button onClick={handleSaveEditClick}>Salvar</Button>
          </div>
        </div>
      );
    }

    // Basic (qa) — matches ManageDeck exactly
    return (
      <div className="space-y-4">
        <div>
          <Label className="mb-1.5 block">Frente</Label>
          <LazyRichEditor
            content={editFront}
            onChange={onEditFrontChange}
            placeholder="Qual é a capital da França?"
            hideCloze
          />
        </div>
        <div>
          <Label className="mb-1.5 block">Verso</Label>
          <LazyRichEditor
            content={editBack}
            onChange={onEditBackChange}
            placeholder="Paris"
            hideCloze
          />
        </div>
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleCancelEdit}>Cancelar</Button>
          <Button onClick={handleSaveEditClick}>Salvar</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{cards.length}</span> cartões gerados
        </p>
      </div>

      {/* ── Card list — compact like ManageDeck ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[45dvh] sm:max-h-[50vh]">
        <div className="space-y-3">
          {cards.map((card, idx) => (
            <div key={idx} className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getTypeBadge(card.type)}
                </div>
                <div
                  className="text-sm font-medium text-card-foreground line-clamp-1 prose prose-sm max-w-none [&_img]:max-h-20 [&_img]:rounded"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front) }}
                />
                {card.type === 'multiple_choice' && card.options ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {card.options.length} opções · Resposta: {card.options[card.correctIndex ?? 0]}
                  </p>
                ) : card.type === 'cloze' ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(() => {
                      const plain = card.front.replace(/<[^>]*>/g, '');
                      const nums = new Set<number>();
                      let m;
                      const re = /\{\{c(\d+)::/g;
                      while ((m = re.exec(plain)) !== null) nums.add(parseInt(m[1]));
                      return `${nums.size} lacuna${nums.size !== 1 ? 's' : ''}`;
                    })()}
                  </p>
                ) : card.back ? (
                  <div
                    className="mt-1 text-xs text-muted-foreground line-clamp-1 prose prose-xs max-w-none [&_img]:max-h-20 [&_img]:rounded"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back) }}
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStartEdit(idx)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDeleteCard(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Edit Dialog — matches ManageDeck ── */}
      <Dialog open={dialogOpen && editingIdx !== null} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Card</DialogTitle>
          </DialogHeader>
          {renderCardEditor()}
        </DialogContent>
      </Dialog>

      {/* ── Tag Selection (mandatory) ── */}
      <div className={`space-y-2.5 border-t pt-3 ${showTagWarning && !hasMinTags ? 'border-destructive' : 'border-border'}`}>
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Tags do baralho</p>
          <span className={`text-[10px] ${showTagWarning && !hasMinTags ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>(obrigatório)</span>
        </div>

        {showTagWarning && !hasMinTags && (
          <p className="text-xs text-destructive flex items-center gap-1">
            ⚠️ Selecione pelo menos 1 tag das sugestões abaixo ou crie a sua.
          </p>
        )}

        {/* Selected tags */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedTags.map((tag, idx) => (
              <span
                key={getTagId(tag)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
              >
                {getTagName(tag)}
                <button type="button" onClick={() => removeTag(idx)} className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
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
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {s.name}
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
            className={`h-9 text-sm ${showTagWarning && !hasMinTags ? 'border-destructive' : ''}`}
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
                  <TagIcon className="h-3 w-3 text-muted-foreground shrink-0" />
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
        {onBack && (
          <Button variant="outline" onClick={onBack} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" /> Reconfigurar
          </Button>
        )}
        <Button
          onClick={handleSaveClick}
          disabled={cards.length === 0 || isSaving}
          className="flex-1 gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar {cards.length} cartões
        </Button>
      </div>
    </div>
  );
};

export default CardReviewStep;
