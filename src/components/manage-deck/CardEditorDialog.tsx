import React, { useState } from 'react';
import { MessageSquareText, CheckSquare, PenLine, Image, ArrowLeft, Plus, Trash2, Sparkles, Loader2, Upload, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LazyRichEditor from '@/components/LazyRichEditor';
import { CardTagEditor } from './CardTagWidgets';
import { sanitizeHtml } from '@/lib/sanitize';
import type { EditorCardType } from '@/hooks/useManageDeck';
import OcclusionEditor from '@/components/manage-deck/OcclusionEditor';

const CARD_TYPE_ICONS: Record<EditorCardType, React.ReactNode> = {
  basic: <MessageSquareText className="h-5 w-5 text-muted-foreground" />,
  cloze: <PenLine className="h-5 w-5 text-muted-foreground" />,
  image_occlusion: <Image className="h-5 w-5 text-muted-foreground" />,
};

const CARD_TYPES_UI = [
  { value: 'basic' as EditorCardType, label: 'Texto', desc: 'Pergunta na frente, resposta no verso' },
  { value: 'cloze' as EditorCardType, label: 'Cloze', desc: 'Texto com lacunas para preencher' },
  { value: 'image_occlusion' as EditorCardType, label: 'Oclusão de imagem', desc: 'Oculte partes de uma imagem' },
];
/* ─── Inline SVG icons matching the toolbar ─── */
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
          {/* Step 1: Create cloze */}
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card border border-border shadow-sm">
              <ClozeIcon />
            </span>
            <div>
              <p className="font-semibold text-foreground mb-0.5">Criar oclusão</p>
              <p><span className="text-foreground font-medium">Selecione</span> a palavra ou trecho e clique neste ícone. O texto vira uma lacuna oculta no cartão. Se clicar de novo no mesmo ícone, a próxima seleção terá o <span className="text-foreground font-medium">mesmo número</span> — ou seja, as duas lacunas viram <span className="text-foreground font-medium">o mesmo cartão</span>.</p>
            </div>
          </div>

          {/* Step 2: New cloze number */}
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card border border-border shadow-sm">
              <ClozePlusIcon />
            </span>
            <div>
              <p className="font-semibold text-foreground mb-0.5">Nova oclusão (número diferente)</p>
              <p><span className="text-foreground font-medium">Selecione</span> o trecho e clique neste ícone com <span className="text-foreground font-medium">+</span>. Ele cria uma lacuna com um <span className="text-foreground font-medium">número novo</span>, gerando um <span className="text-foreground font-medium">cartão separado</span>.</p>
            </div>
          </div>

          {/* Step 3: Remove */}
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card border border-border shadow-sm text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="font-semibold text-foreground mb-0.5">Remover oclusão</p>
              <p>Coloque o cursor dentro da lacuna e clique no ícone <span className="inline-flex align-middle mx-0.5"><ClozeIcon /></span> novamente. A oclusão é removida e o texto volta ao normal.</p>
            </div>
          </div>

          {/* Tip */}
          <div className="rounded-md bg-primary/5 border border-primary/20 px-2.5 py-2 text-[11px]">
            <span className="font-semibold text-primary">Dica:</span> Lacunas com o mesmo número (ex: <span className="font-mono text-primary">c1</span>) viram um único cartão. Use números diferentes para gerar cartões separados.
          </div>
        </div>
      )}
    </div>
  );
};


interface CardEditorDialogProps {
  editorOpen: boolean;
  setEditorOpen: (v: boolean) => void;
  editingId: string | null;
  editorType: EditorCardType | null;
  setEditorType: (v: EditorCardType | null) => void;
  front: string;
  setFront: (v: string) => void;
  back: string;
  setBack: (v: string) => void;
  mcOptions: string[];
  setMcOptions: (v: string[]) => void;
  mcCorrectIndex: number;
  setMcCorrectIndex: (v: number) => void;
  isSaving: boolean;
  isImproving: boolean;
  occlusionModalOpen: boolean;
  setOcclusionModalOpen: (v: boolean) => void;
  resetForm: () => void;
  handleSave: (addAnother: boolean) => void;
  handleImprove: () => void;
  addMcOption: () => void;
  removeMcOption: (idx: number) => void;
}

export const CardEditorDialog = ({
  editorOpen, setEditorOpen, editingId, editorType, setEditorType,
  front, setFront, back, setBack,
  mcOptions, setMcOptions, mcCorrectIndex, setMcCorrectIndex,
  isSaving, isImproving,
  occlusionModalOpen, setOcclusionModalOpen,
  resetForm, handleSave, handleImprove, addMcOption, removeMcOption,
}: CardEditorDialogProps) => {
  const canImprove = editorType && editorType !== 'image_occlusion';

  const renderTypeSelector = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Selecione o tipo do flashcard</p>
      <div className="grid grid-cols-1 gap-2">
        {CARD_TYPES_UI.map(type => (
          <button
            key={type.value}
            onClick={() => {
              setEditorType(type.value);
              if (type.value === 'image_occlusion') setOcclusionModalOpen(true);
            }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {CARD_TYPE_ICONS[type.value]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{type.label}</p>
              <p className="text-[11px] text-muted-foreground">{type.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderClozePreview = () => {
    let textSource = front;
    // For image_occlusion, extract frontText from JSON
    if (editorType === 'image_occlusion') {
      try { textSource = JSON.parse(front)?.frontText || ''; } catch {}
    }
    const plainText = textSource.replace(/<[^>]*>/g, '');
    const clozeRegex = /\{\{c(\d+)::([^}]*)\}\}/g;
    const clozeNumbers = new Set<number>();
    let match;
    while ((match = clozeRegex.exec(plainText)) !== null) clozeNumbers.add(parseInt(match[1]));
    const sortedNumbers = Array.from(clozeNumbers).sort((a, b) => a - b);

    if (sortedNumbers.length > 0) {
      const CLOZE_COLORS = [
        'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40',
        'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40',
        'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
        'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
        'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
      ];
      const DOT_COLORS = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

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

    return <ClozeHelpToggle />;
  };

  const renderEditor = () => (
    <div className="space-y-4">
      {!editingId && (
        <button onClick={() => setEditorType(null)} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" />
          {editorType && CARD_TYPE_ICONS[editorType]}{' '}
          {CARD_TYPES_UI.find(t => t.value === editorType)?.label}
        </button>
      )}

      {editorType === 'image_occlusion' ? (
        <>
          <div>
            <Label className="mb-1.5 block">Frente (Pergunta)</Label>
            <LazyRichEditor
              content={(() => { try { const d = JSON.parse(front); return d.frontText || ''; } catch { return front; } })()}
              onChange={(v) => {
                try { const d = JSON.parse(front); d.frontText = v; setFront(JSON.stringify(d)); }
                catch { setFront(v); }
              }}
              placeholder="Pergunta ou contexto (opcional)"
              onOcclusionPaste={() => setOcclusionModalOpen(true)}
              onOcclusionAttach={() => setOcclusionModalOpen(true)}
            />
            {(() => {
              // Show cloze preview if frontText has cloze markers
              let frontText = '';
              try { frontText = JSON.parse(front)?.frontText || ''; } catch {}
              const plainText = frontText.replace(/<[^>]*>/g, '');
              if (/\{\{c\d+::/.test(plainText)) {
                return renderClozePreview();
              }
              return null;
            })()}
            {(() => {
              let occData: { imageUrl?: string } | null = null;
              try { occData = JSON.parse(front); } catch {}
              if (occData?.imageUrl) {
                return (
                  <div className="mt-2 inline-flex">
                    <button type="button" onClick={() => setOcclusionModalOpen(true)} className="relative group inline-block rounded-lg overflow-hidden border border-border">
                      <img src={occData.imageUrl} alt="Oclusão" className="h-14 w-14 object-cover rounded-lg" />
                      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-primary/80 py-0.5">
                        <Image className="h-3 w-3 text-primary-foreground" />
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFront(''); }} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground/80 text-background flex items-center justify-center text-[10px] font-bold hover:bg-destructive transition-colors">×</button>
                    </button>
                  </div>
                );
              }
              return (
                <button type="button" onClick={() => setOcclusionModalOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  <Upload className="h-3.5 w-3.5" /> Enviar imagem para oclusão
                </button>
              );
            })()}
          </div>
          <div>
            <Label className="mb-1.5 block">Verso</Label>
            <LazyRichEditor content={back} onChange={setBack} placeholder="Resposta / nota extra" hideCloze />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEditorOpen(false); resetForm(); }}>Cancelar</Button>
            {!editingId && <Button variant="secondary" onClick={() => handleSave(true)} disabled={isSaving || !front}>{isSaving ? 'Salvando...' : 'Salvar e Adicionar Outro'}</Button>}
            <Button onClick={() => handleSave(false)} disabled={isSaving || !front}>{isSaving ? 'Salvando...' : 'Salvar e Fechar'}</Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <Label className="mb-1.5 block">Frente</Label>
            <LazyRichEditor
              content={front} onChange={setFront}
              placeholder="Qual é a capital da França?"
              hideCloze={editorType !== 'cloze'}
              onOcclusionPaste={editorType === 'cloze' ? () => { setEditorType('image_occlusion'); setOcclusionModalOpen(true); } : undefined}
              onOcclusionAttach={editorType === 'cloze' ? () => { setEditorType('image_occlusion'); setOcclusionModalOpen(true); } : undefined}
            />
          </div>

          {editorType === 'cloze' ? (
            <>
              {renderClozePreview()}
              <div>
                <Label className="mb-1.5 block">Verso (Resposta)</Label>
                <LazyRichEditor content={back} onChange={setBack} placeholder="Resposta ou informação adicional" hideCloze />
              </div>
            </>
          ) : (
            <div>
              <Label className="mb-1.5 block">Verso (Resposta)</Label>
              <LazyRichEditor content={back} onChange={setBack} placeholder="Paris" hideCloze />
            </div>
          )}

          {canImprove && (
            <Button variant="outline" onClick={handleImprove} disabled={isImproving}
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary">
              {isImproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isImproving ? 'Melhorando...' : 'Melhorar com IA'}
              <span className="text-[10px] text-muted-foreground ml-auto">1 crédito</span>
            </Button>
          )}

          {editingId && <CardTagEditor cardId={editingId} />}

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEditorOpen(false); resetForm(); }}>Cancelar</Button>
            {!editingId && <Button variant="secondary" onClick={() => handleSave(true)} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar e Adicionar Outro'}</Button>}
            <Button onClick={() => handleSave(false)} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar e Fechar'}</Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={editorOpen && !occlusionModalOpen} onOpenChange={open => { if (!open) { setEditorOpen(false); resetForm(); } }}>
        <DialogContent className="max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingId ? 'Editar Cartão' : editorType ? CARD_TYPES_UI.find(t => t.value === editorType)?.label : 'Novo Cartão'}
            </DialogTitle>
          </DialogHeader>
          {editorType === null ? renderTypeSelector() : renderEditor()}
        </DialogContent>
      </Dialog>

      {/* Occlusion Editor Modal */}
      <Dialog open={occlusionModalOpen} onOpenChange={setOcclusionModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Image className="h-5 w-5 text-primary" /> Oclusão de Imagem
            </DialogTitle>
          </DialogHeader>
          <OcclusionEditor
            initialFront={front}
            onSave={(frontContent) => {
              try {
                const existing = JSON.parse(front);
                if (existing.frontText) {
                  const newData = JSON.parse(frontContent);
                  newData.frontText = existing.frontText;
                  setFront(JSON.stringify(newData));
                } else { setFront(frontContent); }
              } catch { setFront(frontContent); }
              setOcclusionModalOpen(false);
            }}
            onCancel={() => setOcclusionModalOpen(false)}
            isSaving={false}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
