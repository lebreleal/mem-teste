import { useState, useRef } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQueryClient } from '@tanstack/react-query';
import { Snowflake, Pencil, Sparkles, Loader2, ArrowLeft, Plus, Trash2, MessageSquareText, CheckSquare, PenLine, MessageCircle, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import LazyRichEditor from '@/components/LazyRichEditor';
import { supabase } from '@/integrations/supabase/client';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import * as cardService from '@/services/cardService';

interface StudyCardActionsProps {
  card: {
    id: string;
    front_content: string;
    back_content: string;
    card_type: string;
    deck_id: string;
  };
  onCardUpdated: (updatedFields: { front_content: string; back_content: string }) => void;
  onCardFrozen: () => void;
  /** Called after cloze sibling edits so Study.tsx can update all siblings in localQueue */
  onSiblingsUpdated?: (updates: { id: string; front_content: string; back_content: string }[], deletedIds: string[]) => void;
  onOpenChat?: () => void;
  chatHasMessages?: boolean;
}

type EditorCardType = 'basic' | 'cloze' | 'multiple_choice';

const StudyCardActions = ({ card, onCardUpdated, onCardFrozen, onSiblingsUpdated, onOpenChat, chatHasMessages }: StudyCardActionsProps) => {
  const queryClient = useQueryClient();
  const { energy, spendEnergy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editorType, setEditorType] = useState<EditorCardType>('basic');
  const [mcOptions, setMcOptions] = useState<string[]>(['', '', '', '']);
  const [mcCorrectIndex, setMcCorrectIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Store original front_content to find siblings
  const originalFrontRef = useRef<string>('');

  // AI improve state
  const [isImproving, setIsImproving] = useState(false);
  const [improvePreview, setImprovePreview] = useState<{ front: string; back: string } | null>(null);
  const [improveModalOpen, setImproveModalOpen] = useState(false);

  const openEdit = async () => {
    setEditLoading(true);
    // Preload the RichEditor chunk before opening the dialog
    try {
      await import('@/components/RichEditor');
    } catch {}
    setFront(card.front_content);
    originalFrontRef.current = card.front_content;
    if (card.card_type === 'multiple_choice') {
      setEditorType('multiple_choice');
      try {
        const data = JSON.parse(card.back_content);
        setMcOptions(data.options || ['', '', '', '']);
        setMcCorrectIndex(data.correctIndex ?? 0);
      } catch {
        setBack(card.back_content);
      }
    } else if (card.card_type === 'cloze') {
      setEditorType('cloze');
      try {
        const parsed = JSON.parse(card.back_content);
        if (typeof parsed.clozeTarget === 'number') {
          setBack(parsed.extra || '');
        } else {
          setBack(card.back_content);
        }
      } catch {
        setBack(card.back_content);
      }
    } else {
      setEditorType('basic');
      setBack(card.back_content);
    }
    setEditLoading(false);
    setEditOpen(true);
  };

  const handleFreeze = async () => {
    try {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 100);
      const { error } = await supabase
        .from('cards')
        .update({ scheduled_date: farFuture.toISOString(), state: 2 })
        .eq('id', card.id);
      if (error) throw error;
      toast({ title: '❄️ Card congelado', description: 'Este card não aparecerá mais nas revisões.' });
      setFreezeConfirmOpen(false);
      onCardFrozen();
    } catch {
      toast({ title: 'Erro ao congelar card', variant: 'destructive' });
    }
  };

  const addMcOption = () => {
    if (mcOptions.length < 6) setMcOptions([...mcOptions, '']);
  };

  const removeMcOption = (idx: number) => {
    if (mcOptions.length <= 2) return;
    const newOpts = mcOptions.filter((_, i) => i !== idx);
    setMcOptions(newOpts);
    if (mcCorrectIndex >= newOpts.length) setMcCorrectIndex(newOpts.length - 1);
    else if (mcCorrectIndex === idx) setMcCorrectIndex(0);
    else if (mcCorrectIndex > idx) setMcCorrectIndex(mcCorrectIndex - 1);
  };

  const handleSave = async () => {
    if (!front.trim()) {
      toast({ title: 'Preencha a pergunta', variant: 'destructive' });
      return;
    }

    // Multiple choice save
    if (editorType === 'multiple_choice') {
      const filledOptions = mcOptions.filter(o => o.trim());
      if (filledOptions.length < 2) {
        toast({ title: 'Adicione pelo menos 2 opções', variant: 'destructive' });
        return;
      }
      const backContent = JSON.stringify({ options: mcOptions.filter(o => o.trim()), correctIndex: mcCorrectIndex });
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from('cards')
          .update({ front_content: front, back_content: backContent })
          .eq('id', card.id);
        if (error) throw error;
        toast({ title: 'Card atualizado!' });
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: ['study-queue'] });
        queryClient.invalidateQueries({ queryKey: ['cards'] });
        onCardUpdated({ front_content: front, back_content: backContent });
      } catch {
        toast({ title: 'Erro ao salvar', variant: 'destructive' });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Cloze save with sibling logic
    if (editorType === 'cloze') {
      setIsSaving(true);
      try {
        // Extract unique cloze numbers from edited front
        const plainForNumbers = front.replace(/<[^>]*>/g, '');
        const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
        const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

        // Fetch all cloze siblings from DB (same front_content as original)
        const { data: siblings } = await supabase
          .from('cards')
          .select('id, front_content, back_content, card_type')
          .eq('deck_id', card.deck_id)
          .eq('card_type', 'cloze')
          .eq('front_content', originalFrontRef.current);

        const allSiblingCards = siblings || [];

        // Map existing cloze targets to card IDs
        const existingTargets = new Map<number, string>();
        allSiblingCards.forEach(c => {
          try {
            const parsed = JSON.parse(c.back_content);
            if (typeof parsed.clozeTarget === 'number') {
              existingTargets.set(parsed.clozeTarget, c.id);
              return;
            }
          } catch {}
          const assignedNum = uniqueNums.find(n => !existingTargets.has(n)) ?? 1;
          existingTargets.set(assignedNum, c.id);
        });

        const existingNums = [...existingTargets.keys()];
        const numsToKeep = uniqueNums.filter(n => existingTargets.has(n));
        const numsToAdd = uniqueNums.filter(n => !existingTargets.has(n));
        const numsToRemove = existingNums.filter(n => !uniqueNums.includes(n));

        // Update all existing siblings with new front_content
        const updatePromises = numsToKeep.map(n => {
          const cardId = existingTargets.get(n)!;
          const backJson = JSON.stringify({ clozeTarget: n, extra: back });
          return cardService.updateCard(cardId, front, backJson);
        });

        // Create new cards for added cloze numbers
        const newCards = numsToAdd.map(n => ({
          frontContent: front,
          backContent: JSON.stringify({ clozeTarget: n, extra: back }),
          cardType: 'cloze',
        }));

        // Delete cards for removed cloze numbers
        const deletePromises = numsToRemove.map(n => {
          const cardId = existingTargets.get(n)!;
          return cardService.deleteCard(cardId);
        });

        await Promise.all([...updatePromises, ...deletePromises]);
        if (newCards.length > 0) {
          await cardService.createCards(card.deck_id, newCards);
        }

        // Build updates for the study queue
        const updatedSiblings = numsToKeep.map(n => ({
          id: existingTargets.get(n)!,
          front_content: front,
          back_content: JSON.stringify({ clozeTarget: n, extra: back }),
        }));
        const deletedIds = numsToRemove.map(n => existingTargets.get(n)!);

        // Update current card in study queue
        const currentBackJson = (() => {
          try {
            const parsed = JSON.parse(card.back_content);
            if (typeof parsed.clozeTarget === 'number') {
              return JSON.stringify({ clozeTarget: parsed.clozeTarget, extra: back });
            }
          } catch {}
          return JSON.stringify({ clozeTarget: 1, extra: back });
        })();
        onCardUpdated({ front_content: front, back_content: currentBackJson });

        // Notify parent about sibling updates
        if (onSiblingsUpdated) {
          onSiblingsUpdated(updatedSiblings, deletedIds);
        }

        queryClient.invalidateQueries({ queryKey: ['study-queue'] });
        queryClient.invalidateQueries({ queryKey: ['cards'] });
        toast({ title: 'Card atualizado!' });
        setEditOpen(false);
      } catch {
        toast({ title: 'Erro ao salvar cloze', variant: 'destructive' });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Basic save
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('cards')
        .update({ front_content: front, back_content: back })
        .eq('id', card.id);
      if (error) throw error;
      toast({ title: 'Card atualizado!' });
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['study-queue'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      onCardUpdated({ front_content: front, back_content: back });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // AI Improve
  const handleImprove = async () => {
    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    if (!strippedFront) {
      toast({ title: 'Escreva algo no card primeiro', variant: 'destructive' });
      return;
    }
    if (energy < 1) {
      toast({ title: 'Créditos insuficientes', description: 'Você precisa de 1 crédito IA.', variant: 'destructive' });
      return;
    }

    setIsImproving(true);
    try {
      let backToSend = back;
      if (editorType === 'multiple_choice') {
        backToSend = JSON.stringify({ options: mcOptions.filter(o => o.trim()), correctIndex: mcCorrectIndex });
      }

      const { data, error } = await supabase.functions.invoke('enhance-card', {
        body: { front, back: backToSend, cardType: editorType || 'basic', aiModel: model, energyCost: 1 },
      });

      if (error) throw error;
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      if (data.unchanged) {
        toast({ title: '✨ Este card já está ótimo!', description: 'Não há melhorias a fazer.' });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['energy'] });
      setImprovePreview({ front: data.front, back: data.back });
      setImproveModalOpen(true);
    } catch (e: any) {
      toast({ title: 'Erro ao melhorar card', description: e.message, variant: 'destructive' });
    } finally {
      setIsImproving(false);
    }
  };

  const applyImprovement = async () => {
    if (!improvePreview) return;
    setFront(improvePreview.front);
    let backContent: string;
    if (editorType === 'multiple_choice') {
      try {
        const data = JSON.parse(improvePreview.back);
        setMcOptions(data.options || mcOptions);
        setMcCorrectIndex(data.correctIndex ?? mcCorrectIndex);
        backContent = improvePreview.back;
      } catch {
        backContent = improvePreview.back;
      }
    } else {
      setBack(improvePreview.back);
      backContent = improvePreview.back;
    }

    // Auto-save to DB and update the study session immediately
    try {
      const { error } = await supabase
        .from('cards')
        .update({ front_content: improvePreview.front, back_content: backContent })
        .eq('id', card.id);
      if (error) throw error;
      onCardUpdated({ front_content: improvePreview.front, back_content: backContent });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch {
      // silent – the editor still has the values so user can save manually
    }

    setImproveModalOpen(false);
    setImprovePreview(null);
    toast({ title: 'Melhoria aplicada e salva!' });
  };

  const canImprove = editorType && editorType !== 'image_occlusion' as any;

  return (
    <>
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {onOpenChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenChat}
                className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  chatHasMessages
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                }`}
                aria-label="Chat com IA"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {chatHasMessages && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent><p>{chatHasMessages ? 'Ver explicação gerada' : 'Chat com IA'}</p></TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  aria-label="Editar card"
                  disabled={editLoading}
                >
                  {editLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Editar / Congelar</p></TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem onClick={openEdit} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> Editar card
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFreezeConfirmOpen(true)} className="gap-2">
              <Snowflake className="h-3.5 w-3.5" /> Congelar card
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Freeze confirm */}
      <AlertDialog open={freezeConfirmOpen} onOpenChange={setFreezeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>❄️ Congelar este card?</AlertDialogTitle>
            <AlertDialogDescription>
              O card não aparecerá mais nas sessões de estudo. Você pode descongelá-lo depois na página de gerenciamento do baralho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFreeze}>Congelar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar Card
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block">
                {editorType === 'multiple_choice' ? 'Pergunta' : editorType === 'cloze' ? 'Texto com lacunas' : 'Frente (Pergunta)'}
              </Label>
              <LazyRichEditor
                content={front}
                onChange={setFront}
                placeholder="Pergunta..."
              />
            </div>

            {editorType === 'multiple_choice' ? (
              <div className="space-y-2">
                <Label className="block">Opções</Label>
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {mcOptions.map((opt, idx) => (
                    <div
                      key={idx}
                      onClick={() => setMcCorrectIndex(idx)}
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
                          setMcOptions(newOpts);
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
            ) : editorType === 'cloze' ? (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-1.5">
                <p className="text-xs font-bold text-warning flex items-center gap-1.5">
                  <Pencil className="h-3 w-3" /> Como usar Cloze
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Selecione o texto e clique para criar um <strong>cloze</strong>.
                  Clozes com mesmo número viram o <strong>mesmo card</strong>.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Cria um cloze com <strong>número novo</strong>, gerando um <strong>card separado</strong>.
                </p>
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block">Verso (Resposta)</Label>
                <LazyRichEditor content={back} onChange={setBack} placeholder="Resposta..." hideCloze />
              </div>
            )}

            {/* AI Improve button */}
            {canImprove && (
              <Button
                variant="outline"
                onClick={handleImprove}
                disabled={isImproving}
                className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
              >
                {isImproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isImproving ? 'Melhorando...' : 'Melhorar com IA'}
                <span className="text-[10px] text-muted-foreground ml-auto">1 crédito</span>
              </Button>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Improve preview dialog */}
      <Dialog open={improveModalOpen} onOpenChange={setImproveModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Sugestão da IA
            </DialogTitle>
          </DialogHeader>
          {improvePreview && (
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Frente melhorada</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.front) }} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Verso melhorado</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.back) }} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImproveModalOpen(false); setImprovePreview(null); }}>Descartar</Button>
                <Button onClick={applyImprovement} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Aplicar Melhoria
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudyCardActions;
