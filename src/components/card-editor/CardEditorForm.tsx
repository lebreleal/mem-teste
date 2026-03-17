/**
 * CardEditorForm — Single shared card editing form used across the entire app.
 * Supports: basic, cloze, multiple_choice, and image_occlusion card types.
 * 
 * This is a **presentational** component. The parent owns all state and handlers.
 * Wrap it in a Dialog, Sheet, or inline layout as needed.
 */
import React, { useState } from 'react';
import { Trash2, Sparkles, Loader2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LazyRichEditor from '@/components/LazyRichEditor';
import { IconImage, IconSwap, IconInfo } from '@/components/icons';
import cartaoInvertidoResposta from '@/assets/cartao-invertido-resposta.png';
import cartaoInvertidoPergunta from '@/assets/cartao-invertido-pergunta.png';

export type CardEditorType = 'basic' | 'cloze' | 'multiple_choice' | 'image_occlusion';

export interface CardEditorFormProps {
  front: string;
  onFrontChange: (v: string) => void;
  back: string;
  onBackChange: (v: string) => void;

  /** If omitted, auto-detected from content */
  cardType?: CardEditorType;

  /** Multiple choice */
  mcOptions?: string[];
  onMcOptionsChange?: (v: string[]) => void;
  mcCorrectIndex?: number;
  onMcCorrectIndexChange?: (v: number) => void;

  /** Image occlusion – pass imageUrl extracted from front JSON */
  occlusionImageUrl?: string;
  onOpenOcclusion?: () => void;
  onRemoveOcclusion?: () => void;
  /** Called when user attaches/pastes an occlusion image via toolbar */
  onOcclusionImageReady?: (imageUrl: string) => void;

  /** AI improve */
  onImprove?: () => void;
  isImproving?: boolean;

  /** AI Creator — generate card from a template prompt */
  onAICreate?: (templatePrompt: string) => void;
  isAICreating?: boolean;

  /** Actions */
  onSave: () => void;
  onSaveAndAdd?: () => void;
  onCancel: () => void;
  isSaving?: boolean;

  /** Extra content rendered after back editor (e.g. CardTagEditor) */
  extraContent?: React.ReactNode;

  /** Hide cloze tools in RichEditor */
  hideCloze?: boolean;

  /** Compact mode — smaller spacing */
  compact?: boolean;
}

/* ─── Inline SVG icons ─── */
const ClozeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
  </svg>
);
const ClozePlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
    <path d="M12 9v6" />
    <path d="M9 12h6" />
  </svg>
);

/* ─── Cloze Help Toggle ─── */
const ClozeHelpToggle = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-primary hover:bg-muted/40 transition-colors"
      >
        <span className="underline underline-offset-2">Como usar Oclusão de Texto</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-xs text-muted-foreground border-t border-border/50 pt-2.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card border border-border shadow-sm">
              <ClozeIcon />
            </span>
            <div>
              <p className="font-semibold text-foreground mb-0.5">Criar oclusão</p>
              <p><span className="text-foreground font-medium">Selecione</span> a palavra ou trecho e clique neste ícone. O texto vira uma lacuna oculta no cartão. Se clicar de novo no mesmo ícone, a próxima seleção terá o <span className="text-foreground font-medium">mesmo número</span> — ou seja, as duas lacunas viram <span className="text-foreground font-medium">o mesmo cartão</span>.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card border border-border shadow-sm">
              <ClozePlusIcon />
            </span>
            <div>
              <p className="font-semibold text-foreground mb-0.5">Nova oclusão (número diferente)</p>
              <p><span className="text-foreground font-medium">Selecione</span> o trecho e clique neste ícone com <span className="text-foreground font-medium">+</span>. Ele cria uma lacuna com um <span className="text-foreground font-medium">número novo</span>, gerando um <span className="text-foreground font-medium">cartão separado</span>.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card border border-border shadow-sm text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="font-semibold text-foreground mb-0.5">Remover oclusão</p>
              <p>Coloque o cursor dentro da lacuna e clique no ícone <span className="inline-flex align-middle mx-0.5"><ClozeIcon /></span> novamente. A oclusão é removida e o texto volta ao normal.</p>
            </div>
          </div>
          <div className="rounded-md bg-primary/5 border border-primary/20 px-2.5 py-2 text-[11px]">
            <span className="font-semibold text-primary">Dica:</span> Lacunas com o mesmo número (ex: <span className="font-mono text-primary">c1</span>) viram um único cartão. Use números diferentes para gerar cartões separados.
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Cloze Preview ─── */
const CLOZE_COLORS = [
  'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40',
  'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
  'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
];
const DOT_COLORS = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

function ClozePreview({ text }: { text: string }) {
  const plainText = text.replace(/<[^>]*>/g, '');
  const clozeRegex = /\{\{c(\d+)::([^}]*)\}\}/g;
  const clozeNumbers = new Set<number>();
  let match;
  while ((match = clozeRegex.exec(plainText)) !== null) clozeNumbers.add(parseInt(match[1]));
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
        <span className="text-[9px] font-bold opacity-70">{num}</span>{m[2]}
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
            <span className={`h-2 w-2 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />Cloze {n}
          </span>
        ))}
        {sortedNumbers.length > 1 && <span className="text-[10px] text-muted-foreground ml-auto">{sortedNumbers.length} cards vinculados</span>}
      </div>
    </div>
  );
}

/* ─── Reversed Cards Toggle ─── */
const ReversedCardsToggle = () => {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <IconSwap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Cartões invertidos</span>
          <button
            type="button"
            onClick={() => setInfoOpen(v => !v)}
            className="h-5 w-5 shrink-0 flex items-center justify-center text-primary/60 hover:text-primary transition-colors"
          >
            <IconInfo className="h-4 w-4" />
          </button>
        </div>
        {/* Toggle switch (visual only for now) */}
        <button type="button" className="relative shrink-0" style={{ width: 44, height: 24 }}>
          <div className="absolute inset-0 rounded-full transition-colors bg-muted" />
          <div className="absolute top-0.5 rounded-full bg-white shadow-sm transition-transform" style={{ width: 20, height: 20, transform: 'translateX(2px)' }} />
        </button>
      </div>

      {/* Info popover */}
      {infoOpen && (
        <div className="mt-2 rounded-xl border border-border bg-card shadow-lg p-4 space-y-3 animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground leading-relaxed pr-2">
              "Cartões invertidos" ajuda você a estudar os cartões em ambas as direções. Quando o modo é ativado, cada cartão terá uma cópia no formato invertido.
            </p>
            <button type="button" onClick={() => setInfoOpen(false)} className="shrink-0 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="rounded-xl border border-border bg-background p-2 flex-1 flex items-center justify-center">
              <img src={cartaoInvertidoResposta} alt="Cartão normal" className="h-28 w-auto rounded-lg object-contain" />
            </div>
            <span className="text-xl text-primary font-bold select-none shrink-0">+</span>
            <div className="rounded-xl border border-border bg-background p-2 flex-1 flex items-center justify-center">
              <img src={cartaoInvertidoPergunta} alt="Cartão invertido" className="h-28 w-auto rounded-lg object-contain" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Saiba mais sobre "Cartões invertidos" no <a href="#" className="text-primary font-medium hover:underline">Guia de suporte</a>.
          </p>
        </div>
      )}
    </div>
  );
};

/* ─── Main Component ─── */
export const CardEditorForm = ({
  front, onFrontChange, back, onBackChange,
  cardType,
  mcOptions = [], onMcOptionsChange, mcCorrectIndex = 0, onMcCorrectIndexChange,
  occlusionImageUrl, onOpenOcclusion, onRemoveOcclusion,
  onImprove, isImproving = false,
  onAICreate, isAICreating = false,
  onSave, onSaveAndAdd, onCancel, isSaving = false,
  extraContent, hideCloze = false, compact = false,
}: CardEditorFormProps) => {

  // Auto-detect card type from content
  const resolvedType: CardEditorType = cardType ?? (() => {
    // Check occlusion
    try {
      const d = JSON.parse(front);
      if (d && typeof d === 'object' && ('imageUrl' in d || 'allRects' in d)) return 'image_occlusion';
    } catch {}
    // Check cloze
    if (/\{\{c\d+::/.test(front.replace(/<[^>]*>/g, ''))) return 'cloze';
    // Check MC
    if (mcOptions.length > 0 && onMcOptionsChange) return 'multiple_choice';
    return 'basic';
  })();

  // For image_occlusion, front JSON may contain frontText
  const isImageMode = resolvedType === 'image_occlusion' || (() => {
    try {
      const d = JSON.parse(front);
      return d && typeof d === 'object' && ('imageUrl' in d || 'allRects' in d);
    } catch { return false; }
  })();

  const editorContent = isImageMode
    ? (() => { try { return JSON.parse(front)?.frontText || ''; } catch { return front; } })()
    : front;

  const editorOnChange = isImageMode
    ? (v: string) => {
        try { const d = JSON.parse(front); d.frontText = v; onFrontChange(JSON.stringify(d)); }
        catch { onFrontChange(v); }
      }
    : onFrontChange;

  const frontTextContent = isImageMode
    ? (() => { try { return JSON.parse(front)?.frontText || ''; } catch { return ''; } })()
    : front;

  const hasCloze = /\{\{c\d+::/.test(frontTextContent.replace(/<[^>]*>/g, ''));
  const canImprove = onImprove && !isImageMode;

  const addMcOption = () => {
    if (mcOptions.length < 6 && onMcOptionsChange) onMcOptionsChange([...mcOptions, '']);
  };
  const removeMcOption = (idx: number) => {
    if (mcOptions.length <= 2 || !onMcOptionsChange) return;
    const newOpts = mcOptions.filter((_, i) => i !== idx);
    onMcOptionsChange(newOpts);
    if (onMcCorrectIndexChange) {
      if (mcCorrectIndex >= newOpts.length) onMcCorrectIndexChange(newOpts.length - 1);
      else if (mcCorrectIndex === idx) onMcCorrectIndexChange(0);
      else if (mcCorrectIndex > idx) onMcCorrectIndexChange(mcCorrectIndex - 1);
    }
  };

  const gap = compact ? 'space-y-3' : 'space-y-4';

  return (
    <div className={gap}>
      {/* Front */}
      <div>
        <Label className="mb-1.5 block">Frente</Label>
        <LazyRichEditor
          content={editorContent}
          onChange={editorOnChange}
          placeholder="Pergunta, texto com lacunas, ou contexto"
          hideCloze={hideCloze}
          onOcclusionPaste={onOpenOcclusion}
          onOcclusionAttach={onOpenOcclusion}
          onAICreate={onAICreate}
          isAICreating={isAICreating}
        />
      </div>

      {/* Cloze preview */}
      {hasCloze && <ClozePreview text={frontTextContent} />}
      {!hasCloze && !isImageMode && resolvedType !== 'multiple_choice' && <ClozeHelpToggle />}

      {/* Multiple choice options */}
      {resolvedType === 'multiple_choice' && onMcOptionsChange && onMcCorrectIndexChange && (
        <div className="space-y-2">
          <Label className="block">Opções</Label>
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {mcOptions.map((opt, idx) => (
              <div
                key={idx}
                onClick={() => onMcCorrectIndexChange(idx)}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  mcCorrectIndex === idx ? 'bg-success/10' : 'hover:bg-muted/50'
                }`}
              >
                <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                  mcCorrectIndex === idx ? 'border-success bg-success text-white' : 'border-muted-foreground/30'
                }`}>
                  {mcCorrectIndex === idx && <span className="text-[10px] font-bold">✓</span>}
                </div>
                <Input
                  value={opt}
                  onChange={e => {
                    e.stopPropagation();
                    const newOpts = [...mcOptions];
                    newOpts[idx] = e.target.value;
                    onMcOptionsChange(newOpts);
                  }}
                  onClick={e => e.stopPropagation()}
                  placeholder={`Opção ${idx + 1}`}
                  className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto py-0"
                />
                {mcOptions.length > 2 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); removeMcOption(idx); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {mcOptions.length < 6 && (
            <Button variant="ghost" size="sm" onClick={addMcOption} className="gap-1 w-full text-muted-foreground hover:text-foreground">
              <Plus className="h-3 w-3" /> Adicionar opção
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">Clique na linha para marcar a resposta correta</p>
        </div>
      )}

      {/* Back (not shown for cloze-only) */}
      {resolvedType !== 'cloze' && (
        <div>
          <Label className="mb-1.5 block">Verso (Resposta)</Label>
          <LazyRichEditor content={back} onChange={onBackChange} placeholder="Resposta ou informação adicional" hideCloze />
        </div>
      )}

      {/* AI Improve */}
      {canImprove && (
        <Button variant="outline" onClick={onImprove} disabled={isImproving}
          className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary">
          {isImproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isImproving ? 'Melhorando...' : 'Melhorar com IA'}
          <span className="text-[10px] text-muted-foreground ml-auto">1 crédito</span>
        </Button>
      )}

      {extraContent}

      {/* Cartões invertidos */}
      <ReversedCardsToggle />

      {/* Bottom bar: image occlusion (left) + actions (right) */}
      <div className="flex items-end gap-2 pt-2">
        {/* Image occlusion – bottom left */}
        {onOpenOcclusion && (
          <div className="flex-shrink-0">
            {isImageMode && occlusionImageUrl ? (
              <button type="button" onClick={onOpenOcclusion} className="relative group inline-block rounded-lg overflow-hidden border border-border">
                <img src={occlusionImageUrl} alt="Oclusão" className="h-16 w-16 object-cover rounded-lg" />
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-primary/80 py-0.5">
                  <IconImage className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
                {onRemoveOcclusion && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveOcclusion(); }}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground/80 text-background flex items-center justify-center text-[10px] font-bold hover:bg-destructive transition-colors">×</button>
                )}
              </button>
            ) : (
              <button type="button" onClick={onOpenOcclusion} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                <IconImage className="h-3.5 w-3.5" /> Imagem
              </button>
            )}
          </div>
        )}

        {/* Actions – right */}
        <div className="flex flex-1 justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          {onSaveAndAdd && (
            <Button variant="secondary" size="sm" onClick={onSaveAndAdd} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar +'}
            </Button>
          )}
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CardEditorForm;
