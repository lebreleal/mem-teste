import React from 'react';
import { MessageSquareText, CheckSquare, PenLine, Image, ArrowLeft, Plus, Trash2, Sparkles, Loader2, Upload, ArrowRight } from 'lucide-react';
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
    const plainText = front.replace(/<[^>]*>/g, '');
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

    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
        <p className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center gap-1.5">
          <PenLine className="h-3 w-3" /> Como usar Cloze
        </p>
        <p className="text-xs text-muted-foreground">
          Selecione o texto e clique para criar um <span className="font-semibold text-foreground">cloze</span>. Clozes com mesmo número viram o <span className="font-semibold text-foreground">mesmo card</span>.
        </p>
        <p className="text-[11px] text-muted-foreground">
          Cria um cloze com <span className="font-semibold text-primary">número novo</span>, gerando um <span className="font-semibold text-foreground">card separado</span>.
        </p>
      </div>
    );
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
              placeholder="Pergunta ou contexto (opcional)" hideCloze
            />
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
            <Label className="mb-1.5 block">{editorType === 'multiple_choice' ? 'Pergunta' : 'Frente'}</Label>
            <LazyRichEditor
              content={front} onChange={setFront}
              placeholder={editorType === 'multiple_choice' ? 'Qual organela é responsável pela produção de energia?' : 'Qual é a capital da França?'}
              hideCloze={editorType !== 'cloze'}
            />
          </div>

          {editorType === 'multiple_choice' ? (
            <div className="space-y-2">
              <Label className="block">Opções</Label>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {mcOptions.map((opt, idx) => (
                  <div key={idx} onClick={() => setMcCorrectIndex(idx)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${mcCorrectIndex === idx ? 'bg-success/10' : 'hover:bg-muted/50'}`}>
                    <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${mcCorrectIndex === idx ? 'border-success bg-success text-white' : 'border-muted-foreground/30'}`}>
                      {mcCorrectIndex === idx && <span className="text-[10px] font-bold">✓</span>}
                    </div>
                    <Input value={opt} onChange={e => { e.stopPropagation(); const newOpts = [...mcOptions]; newOpts[idx] = e.target.value; setMcOptions(newOpts); }}
                      onClick={e => e.stopPropagation()} placeholder={`Opção ${idx + 1}`}
                      className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto py-0" />
                    {mcOptions.length > 2 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeMcOption(idx); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          ) : editorType === 'cloze' ? (
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
              {editingId ? 'Editar Card' : editorType ? CARD_TYPES_UI.find(t => t.value === editorType)?.label : 'Novo Card'}
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
