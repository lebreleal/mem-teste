/**
 * DeckDetailDialogs – all dialogs/modals extracted from DeckDetail page.
 */

import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LazyRichEditor from '@/components/LazyRichEditor';
import ImageOcclusion from '@/components/ImageOcclusion';
import AICreateDeckDialog from '@/components/AICreateDeckDialog';
import ImportCardsDialog from '@/components/ImportCardsDialog';
import AIModelSelector from '@/components/AIModelSelector';
import { TagInput } from '@/components/TagInput';
import { useCardTags, useCardTagMutations } from '@/hooks/useTags';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Sparkles, Loader2,
  RotateCcw, Copy, Brain, MessageSquareText, CheckSquare, PenLine, Image as ImageIcon, Crown,
  Tag as TagIcon,
} from 'lucide-react';

/** Tag editor for card edit dialog */
const CardTagEditor = ({ cardId }: { cardId: string }) => {
  const { data: tags = [] } = useCardTags(cardId);
  const { addTag, removeTag } = useCardTagMutations(cardId);
  return (
    <div className="space-y-1.5 border-t border-border/50 pt-3">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <TagIcon className="h-3 w-3" /> Tags do card
      </p>
      <TagInput
        tags={tags}
        onAdd={(tag) => addTag.mutate(tag)}
        onRemove={(tagId) => removeTag.mutate(tagId)}
        placeholder="Adicionar tag ao card..."
      />
    </div>
  );
};

const DeckDetailDialogs = () => {
  const ctx = useDeckDetail();

  return (
    <>
      {/* Card Editor Dialog */}
      <Dialog open={ctx.editorOpen && !ctx.occlusionModalOpen} onOpenChange={open => { if (!open) { ctx.setEditorOpen(false); ctx.resetForm(); } }}>
        <DialogContent className="max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">{ctx.editingId ? 'Editar Card' : 'Novo Card'}</DialogTitle>
          </DialogHeader>

          {!ctx.editingId && ctx.cardType === null ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecione o tipo do flashcard</p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: 'basic', label: 'Frente e Verso', icon: <MessageSquareText className="h-5 w-5 text-muted-foreground" />, desc: 'Pergunta na frente, resposta no verso' },
                  { value: 'multiple_choice', label: 'Múltipla escolha', icon: <CheckSquare className="h-5 w-5 text-muted-foreground" />, desc: 'Pergunta com alternativas' },
                  { value: 'cloze', label: 'Cloze', icon: <PenLine className="h-5 w-5 text-muted-foreground" />, desc: 'Texto com lacunas para preencher' },
                  { value: 'image_occlusion', label: 'Oclusão de imagem', icon: <ImageIcon className="h-5 w-5 text-muted-foreground" />, desc: 'Oculte partes de uma imagem' },
                ].map(type => (
                  <button key={type.value} onClick={() => ctx.setCardType(type.value)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">{type.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{type.label}</p>
                      <p className="text-[11px] text-muted-foreground">{type.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!ctx.editingId && (
                <button onClick={() => ctx.setCardType(null)} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-3 w-3" /> Alterar tipo
                </button>
              )}

              <div>
                <Label className="mb-1.5 block">
                  {ctx.cardType === 'multiple_choice' ? 'Pergunta' : ctx.cardType === 'image_occlusion' ? 'Frente (Pergunta)' : 'Frente'}
                </Label>
                <LazyRichEditor
                  content={ctx.front}
                  onChange={ctx.setFront}
                  placeholder={ctx.cardType === 'multiple_choice' ? 'Qual organela é responsável pela produção de energia?' : ctx.cardType === 'cloze' ? 'A {{c1::mitocôndria}} é responsável pela respiração celular.' : ctx.cardType === 'image_occlusion' ? 'Pergunta ou contexto (opcional)' : 'Pergunta, conceito ou texto com {{c1::lacunas}}...'}
                  onOcclusionPaste={ctx.cardType === 'image_occlusion' ? ctx.handleOcclusionPaste : undefined}
                  onOcclusionAttach={ctx.cardType === 'image_occlusion' ? ctx.handleOcclusionAttach : undefined}
                />
              </div>

              {ctx.cardType === 'image_occlusion' && (
                <div className="space-y-2">
                  <Label className="mb-1.5 block">Imagem de oclusão</Label>
                  {ctx.occlusionImageUrl ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => ctx.setOcclusionModalOpen(true)}
                        className="relative inline-block rounded-lg overflow-hidden border border-border"
                        title="Editar oclusões"
                      >
                        <img src={ctx.occlusionImageUrl} alt="Imagem de oclusão" className="h-14 w-14 object-cover rounded-lg" />
                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-primary/80 py-0.5">
                          <ImageIcon className="h-3 w-3 text-primary-foreground" />
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => { ctx.setOcclusionImageUrl(''); ctx.setOcclusionRects([]); ctx.setOcclusionModalOpen(false); }}
                        title="Remover imagem"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Use o ícone de oclusão na barra da Frente para anexar uma imagem.</p>
                  )}
                </div>
              )}

              {ctx.cardType === 'multiple_choice' && (
                <div className="space-y-2">
                  <Label className="block">Opções</Label>
                  <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                    {ctx.mcOptions.map((opt, idx) => (
                      <div key={idx} onClick={() => ctx.setMcCorrectIndex(idx)} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${ctx.mcCorrectIndex === idx ? 'bg-success/10' : 'hover:bg-muted/50'}`}>
                        <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${ctx.mcCorrectIndex === idx ? 'border-success bg-success text-white' : 'border-muted-foreground/30'}`}>
                          {ctx.mcCorrectIndex === idx && <span className="text-[10px] font-bold">✓</span>}
                        </div>
                        <Input value={opt} onChange={e => { e.stopPropagation(); const newOpts = [...ctx.mcOptions]; newOpts[idx] = e.target.value; ctx.setMcOptions(newOpts); }} onClick={e => e.stopPropagation()} placeholder={`Opção ${idx + 1}`} className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto py-0" />
                        {ctx.mcOptions.length > 2 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={(e) => {
                            e.stopPropagation();
                            const newOpts = ctx.mcOptions.filter((_, i) => i !== idx);
                            ctx.setMcOptions(newOpts);
                            if (ctx.mcCorrectIndex >= newOpts.length) ctx.setMcCorrectIndex(newOpts.length - 1);
                            else if (ctx.mcCorrectIndex === idx) ctx.setMcCorrectIndex(0);
                            else if (ctx.mcCorrectIndex > idx) ctx.setMcCorrectIndex(ctx.mcCorrectIndex - 1);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {ctx.mcOptions.length < 6 && (
                    <Button variant="ghost" size="sm" onClick={() => ctx.setMcOptions([...ctx.mcOptions, ''])} className="gap-1 w-full text-muted-foreground hover:text-foreground">
                      <Plus className="h-3 w-3" /> Adicionar opção
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">Clique na linha para marcar a resposta correta</p>
                </div>
              )}

              {ctx.cardType === 'cloze' && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <PenLine className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[11px] font-bold text-primary">Como usar Cloze</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 flex items-center justify-center h-5 w-5 rounded border border-primary/30 bg-card">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
                        </svg>
                      </span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Selecione o texto e clique para criar um <strong className="text-foreground">cloze</strong>. Clozes com mesmo número viram o <strong className="text-foreground">mesmo card</strong>.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 flex items-center justify-center h-5 w-5 rounded border border-primary/30 bg-card">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
                          <path d="M12 9v6" />
                          <path d="M9 12h6" />
                        </svg>
                      </span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Cria um cloze com <strong className="text-foreground">número novo</strong>, gerando um <strong className="text-foreground">card separado</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {(ctx.cardType === 'basic' || ctx.cardType === 'image_occlusion' || ctx.cardType === 'cloze') && (
                <div>
                  <Label className="mb-1.5 block">Verso (Resposta)</Label>
                  <LazyRichEditor content={ctx.back} onChange={ctx.setBack} placeholder="Resposta..." hideCloze />
                </div>
              )}

              {ctx.canImprove && (
                <Button variant="outline" onClick={ctx.handleImprove} disabled={ctx.isImproving} className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary">
                  {ctx.isImproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {ctx.isImproving ? 'Melhorando...' : 'Melhorar com IA'}
                  <span className="text-[10px] text-muted-foreground ml-auto">1 crédito</span>
                </Button>
              )}

              {/* Card Tags (only when editing existing card) */}
              {ctx.editingId && (
                <CardTagEditor cardId={ctx.editingId} />
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { ctx.setEditorOpen(false); ctx.resetForm(); }}>Cancelar</Button>
                {!ctx.editingId && (
                  <Button variant="secondary" onClick={() => ctx.handleSave(true)} disabled={ctx.isSaving}>
                    {ctx.isSaving ? 'Salvando...' : 'Salvar e Adicionar Outro'}
                  </Button>
                )}
                <Button onClick={() => ctx.handleSave(false)} disabled={ctx.isSaving}>
                  {ctx.isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Occlusion editor modal */}
      <Dialog open={ctx.occlusionModalOpen} onOpenChange={ctx.setOcclusionModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Oclusão de imagem</DialogTitle>
          </DialogHeader>

          {ctx.occlusionImageUrl ? (
            <div className="space-y-3">
              <ImageOcclusion imageUrl={ctx.occlusionImageUrl} initialRects={ctx.occlusionRects} onChange={(rects, meta) => { ctx.setOcclusionRects(rects); if (meta) ctx.setOcclusionCanvasSize({ w: meta.canvasWidth, h: meta.canvasHeight }); }} />
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => { ctx.setOcclusionImageUrl(''); ctx.setOcclusionRects([]); ctx.setOcclusionCanvasSize(null); ctx.setOcclusionModalOpen(false); }}>
                  Remover imagem
                </Button>
                <Button onClick={() => ctx.setOcclusionModalOpen(false)}>Concluir</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Adicione uma imagem pela barra de ferramentas da Frente para editar as oclusões.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Improve Preview Modal */}
      <Dialog open={ctx.improveModalOpen} onOpenChange={ctx.setImproveModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Melhoria sugerida
            </DialogTitle>
          </DialogHeader>
          {ctx.improvePreview && (
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{ctx.cardType === 'cloze' ? 'Texto melhorado' : 'Frente melhorada'}</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: ctx.improvePreview.front }} />
              </div>
              {ctx.cardType === 'multiple_choice' ? (() => {
                try {
                  const mcData = JSON.parse(ctx.improvePreview.back);
                  return (
                    <div>
                      <Label className="mb-1.5 block text-xs text-muted-foreground">Opções melhoradas</Label>
                      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                        {mcData.options?.map((opt: string, idx: number) => (
                          <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 ${idx === mcData.correctIndex ? 'bg-success/10' : ''}`}>
                            <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center ${idx === mcData.correctIndex ? 'border-success bg-success text-white' : 'border-muted-foreground/30'}`}>
                              {idx === mcData.correctIndex && <span className="text-[10px] font-bold">✓</span>}
                            </div>
                            <span className="text-sm">{opt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })() : ctx.cardType !== 'cloze' && (
                <div>
                  <Label className="mb-1.5 block text-xs text-muted-foreground">Verso melhorado</Label>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: ctx.improvePreview.back }} />
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
            <Button variant="outline" onClick={() => { ctx.setImproveModalOpen(false); ctx.setImprovePreview(null); }}>Descartar</Button>
            <Button onClick={ctx.applyImprovement} className="gap-2">Aplicar melhoria <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move card dialog */}
      <Dialog open={!!ctx.moveCardId} onOpenChange={open => { if (!open) { ctx.setMoveCardId(null); ctx.setMoveTargetDeck(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Mover Card</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mover para o baralho:</Label>
              <Select value={ctx.moveTargetDeck} onValueChange={ctx.setMoveTargetDeck}>
                <SelectTrigger><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
                <SelectContent>{ctx.otherDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => ctx.setMoveCardId(null)}>Cancelar</Button>
              <Button onClick={ctx.handleMoveCard} disabled={!ctx.moveTargetDeck}>Mover</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk move dialog */}
      <Dialog open={ctx.bulkMoveOpen} onOpenChange={open => { if (!open) { ctx.setBulkMoveOpen(false); ctx.setMoveTargetDeck(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Mover {ctx.selectedCards.size} card{ctx.selectedCards.size > 1 ? 's' : ''}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mover para o baralho:</Label>
              <Select value={ctx.moveTargetDeck} onValueChange={ctx.setMoveTargetDeck}>
                <SelectTrigger><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
                <SelectContent>{ctx.otherDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => ctx.setBulkMoveOpen(false)}>Cancelar</Button>
              <Button onClick={ctx.handleBulkMove} disabled={!ctx.moveTargetDeck}>Mover</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!ctx.deleteId} onOpenChange={open => !open && ctx.setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir card?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={ctx.handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Algorithm change modal */}
      <Dialog open={ctx.algorithmModalOpen} onOpenChange={v => { ctx.setAlgorithmModalOpen(v); if (!v) ctx.setAlgorithmConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Algoritmo de Aprendizagem</DialogTitle></DialogHeader>
          {!ctx.algorithmConfirm ? (
            <>
              <p className="text-sm text-muted-foreground">Selecione o algoritmo de estudo para este baralho.</p>
              <div className="space-y-2 pt-2">
                {[
                  { value: 'fsrs', label: 'FSRS-6', desc: 'Algoritmo avançado com retenção otimizada' },
                  { value: 'quick_review', label: 'Revisão Rápida', desc: 'Modo manual, sem agendamento' },
                ].map(algo => {
                  const isActive = (ctx.deck as any)?.algorithm_mode === algo.value;
                  return (
                    <button key={algo.value} disabled={isActive} className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${isActive ? 'border-primary bg-primary/5 cursor-default' : 'border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer'}`} onClick={() => { if (!isActive) ctx.setAlgorithmConfirm({ value: algo.value, label: algo.label }); }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{algo.label}</span>
                          {isActive && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Atual</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{algo.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button variant="ghost" className="w-full mt-1" onClick={() => ctx.setAlgorithmModalOpen(false)}>Cancelar</Button>
            </>
          ) : (
          (() => {
              // Switching to/from quick_review changes the system entirely, so "manter progresso" doesn't make sense
              const isCurrentQuickReview = (ctx.deck as any)?.algorithm_mode === 'quick_review';
              const isTargetQuickReview = ctx.algorithmConfirm.value === 'quick_review';
              const canKeepProgress = !isCurrentQuickReview && !isTargetQuickReview;

              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    Trocar para <span className="font-semibold text-foreground">{ctx.algorithmConfirm.label}</span>. Como deseja prosseguir?
                  </p>
                  <div className="space-y-2 pt-2">
                    <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={() => ctx.handleAlgorithmChange(true)}>
                      <RotateCcw className="h-4 w-4 shrink-0" />
                      <div className="text-left">
                        <p className="font-medium">Trocar e redefinir progresso</p>
                        <p className="text-xs text-muted-foreground">Todos os cards voltam ao estado "novo"</p>
                      </div>
                    </Button>
                    {canKeepProgress && (
                      <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={() => ctx.handleAlgorithmChange(false)}>
                        <RotateCcw className="h-4 w-4 shrink-0" />
                        <div className="text-left">
                          <p className="font-medium">Trocar e manter progresso</p>
                          <p className="text-xs text-muted-foreground">O progresso atual será preservado</p>
                        </div>
                      </Button>
                    )}
                    <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={ctx.handleAlgorithmCopy}>
                      <Copy className="h-4 w-4 shrink-0" />
                      <div className="text-left">
                        <p className="font-medium">Criar cópia com {ctx.algorithmConfirm.label}</p>
                        <p className="text-xs text-muted-foreground">Novo sub-baralho, o atual permanece intacto</p>
                      </div>
                    </Button>
                  </div>
                  <Button variant="ghost" className="w-full mt-1" onClick={() => ctx.setAlgorithmConfirm(null)}>Voltar</Button>
                </>
              );
            })()
          )}
        </DialogContent>
      </Dialog>

      {/* Exam creation modal */}
      <Dialog open={ctx.examModalOpen} onOpenChange={v => { if (!ctx.examGenerating) ctx.setExamModalOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" /> Criar Prova com IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              A prova será gerada em segundo plano a partir do baralho <span className="font-medium text-foreground">{(ctx.deck as any)?.name}</span>.
            </p>
            <div>
              <Label className="text-sm font-semibold">Título (opcional)</Label>
              <Input className="mt-1" placeholder="Ex: Prova de Anatomia" value={ctx.examTitle} onChange={e => ctx.setExamTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Total questões</Label>
                <Input type="number" min={1} max={50} className="mt-1" value={ctx.examTotalQuestions} onChange={e => ctx.setExamTotalQuestions(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-sm font-semibold">Dissertativas</Label>
                <Input type="number" min={0} max={ctx.examTotalQuestions} className="mt-1" value={ctx.examWrittenCount} onChange={e => ctx.setExamWrittenCount(Math.min(Number(e.target.value), ctx.examTotalQuestions))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Alternativas</Label>
                <Select value={String(ctx.examOptionsCount)} onValueChange={v => ctx.setExamOptionsCount(Number(v) as 4 | 5)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 opções</SelectItem>
                    <SelectItem value="5">5 opções</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-semibold">Tempo (min)</Label>
                <Input type="number" min={0} max={300} className="mt-1" placeholder="0 = sem limite" value={ctx.examTimeLimit || ''} onChange={e => ctx.setExamTimeLimit(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">Custo</span>
              <span className="text-sm font-bold text-foreground">{ctx.examTotalQuestions * 2} créditos IA</span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => ctx.setExamModalOpen(false)} disabled={ctx.examGenerating}>Cancelar</Button>
              <Button className="flex-1 gap-2" disabled={ctx.examGenerating || ctx.energy < ctx.examTotalQuestions * 2} onClick={ctx.handleGenerateExam}>
                <Sparkles className="h-4 w-4" />
                {ctx.examGenerating ? 'Gerando...' : 'Gerar Prova'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Create Cards Dialog */}
      <AICreateDeckDialog open={ctx.aiAddCardsOpen} onOpenChange={ctx.setAiAddCardsOpen} existingDeckId={ctx.deckId} existingDeckName={(ctx.deck as any)?.name} />

      {/* Import Cards Dialog */}
      <ImportCardsDialog open={ctx.importOpen} onOpenChange={ctx.setImportOpen} onImport={ctx.handleImportCards} loading={false} />
    </>
  );
};

export default DeckDetailDialogs;
