import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, Trash2, Move, Copy, Plus, Sparkles, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCards } from '@/hooks/useCards';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import LazyRichEditor from '@/components/LazyRichEditor';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';

const ManageDeck = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cards, isLoading, createCard, updateCard, deleteCard } = useCards(deckId ?? '');
  const { energy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialCardId = searchParams.get('cardId');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isImproving, setIsImproving] = useState(false);

  const sortedCards = cards ?? [];
  const currentCard = sortedCards[selectedIndex] ?? null;
  const totalCards = sortedCards.length;

  // Set initial card from URL param
  useEffect(() => {
    if (initialCardId && sortedCards.length > 0) {
      const idx = sortedCards.findIndex(c => c.id === initialCardId);
      if (idx >= 0) setSelectedIndex(idx);
    }
  }, [initialCardId, sortedCards.length]);

  // Load card content when selection changes
  useEffect(() => {
    if (!currentCard) return;
    setFront(currentCard.front_content);
    if (currentCard.card_type === 'cloze') {
      try {
        const parsed = JSON.parse(currentCard.back_content);
        setBack(typeof parsed.clozeTarget === 'number' ? (parsed.extra || '') : currentCard.back_content);
      } catch { setBack(currentCard.back_content); }
    } else {
      setBack(currentCard.back_content);
    }
    setIsDirty(false);
  }, [currentCard?.id]);

  const saveCurrentCard = useCallback(async () => {
    if (!currentCard || !isDirty) return;
    let backContent = back;
    if (currentCard.card_type === 'cloze') {
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
      backContent = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
    }
    updateCard.mutate(
      { id: currentCard.id, frontContent: front, backContent },
      { onSuccess: () => { setIsDirty(false); } }
    );
  }, [currentCard, front, back, isDirty, updateCard]);

  // Auto-save when navigating away from a card
  const selectCard = useCallback((idx: number) => {
    if (idx < 0 || idx >= totalCards) return;
    if (isDirty) saveCurrentCard();
    setSelectedIndex(idx);
  }, [isDirty, saveCurrentCard, totalCards]);

  const handleBack = useCallback(() => {
    if (isDirty) saveCurrentCard();
    navigate(`/decks/${deckId}`);
  }, [isDirty, saveCurrentCard, navigate, deckId]);

  const handleDelete = useCallback(() => {
    if (!currentCard) return;
    deleteCard.mutate(currentCard.id, {
      onSuccess: () => {
        setDeleteConfirmOpen(false);
        toast({ title: 'Cartão excluído' });
        if (selectedIndex >= totalCards - 1 && selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        }
      },
    });
  }, [currentCard, deleteCard, selectedIndex, totalCards, toast]);

  const handleAddCard = useCallback(() => {
    createCard.mutate(
      { frontContent: '', backContent: '', cardType: 'basic' },
      {
        onSuccess: () => {
          toast({ title: 'Novo cartão criado' });
          // Select the new card (will be last)
          setTimeout(() => setSelectedIndex(totalCards), 100);
        },
      }
    );
  }, [createCard, totalCards, toast]);

  const handleDuplicate = useCallback(() => {
    if (!currentCard) return;
    createCard.mutate(
      { frontContent: currentCard.front_content, backContent: currentCard.back_content, cardType: currentCard.card_type },
      {
        onSuccess: () => {
          toast({ title: 'Cartão duplicado' });
          setTimeout(() => setSelectedIndex(totalCards), 100);
        },
      }
    );
  }, [currentCard, createCard, totalCards, toast]);

  const handleImprove = useCallback(async () => {
    if (!currentCard) return;
    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    if (!strippedFront) {
      toast({ title: 'Escreva algo no cartão primeiro', variant: 'destructive' });
      return;
    }
    if (energy < 1) {
      toast({ title: 'Créditos insuficientes', variant: 'destructive' });
      return;
    }
    setIsImproving(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-card', {
        body: { front, back, cardType: currentCard.card_type || 'basic', aiModel: model, energyCost: 1 },
      });
      if (error) throw error;
      if (data.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      if (data.unchanged) { toast({ title: '✨ Este cartão já está ótimo!' }); return; }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setFront(data.front);
      setBack(data.back);
      setIsDirty(true);
      toast({ title: 'Melhoria aplicada!' });
    } catch (e: any) {
      toast({ title: 'Erro ao melhorar', description: e.message, variant: 'destructive' });
    } finally {
      setIsImproving(false);
    }
  }, [front, back, currentCard, energy, model, queryClient, toast]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          {totalCards > 0 && (
            <div className="flex items-center gap-1">
              <button onClick={() => selectCard(selectedIndex - 1)} disabled={selectedIndex === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                <ChevronUp className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-foreground min-w-[80px] text-center">
                Cartão {selectedIndex + 1} de {totalCards}
              </span>
              <button onClick={() => selectCard(selectedIndex + 1)} disabled={selectedIndex >= totalCards - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}

          <button onClick={() => {/* settings could go here */}} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - card numbers */}
        <aside className="w-10 sm:w-12 border-r border-border/50 bg-muted/20 overflow-y-auto flex-shrink-0">
          <div className="flex flex-col py-2">
            {sortedCards.map((card, idx) => (
              <button
                key={card.id}
                onClick={() => selectCard(idx)}
                className={`py-2 text-xs font-medium transition-colors ${
                  idx === selectedIndex
                    ? 'bg-primary/10 text-primary font-bold border-r-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </aside>

        {/* Main editor area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {currentCard ? (
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Front */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 min-h-[180px]">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frente</Label>
                  <button onClick={handleImprove} disabled={isImproving} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
                    {isImproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    IA
                  </button>
                </div>
                <LazyRichEditor
                  content={front}
                  onChange={(v) => { setFront(v); setIsDirty(true); }}
                  placeholder="Frente do cartão"
                  hideCloze={currentCard.card_type !== 'cloze'}
                />
              </div>

              {/* Back */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 min-h-[180px]">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Verso</Label>
                <LazyRichEditor
                  content={back}
                  onChange={(v) => { setBack(v); setIsDirty(true); }}
                  placeholder="Verso do cartão"
                  hideCloze
                />
              </div>

              {/* Save button (visible when dirty) */}
              {isDirty && (
                <Button onClick={saveCurrentCard} className="w-full gap-2" disabled={updateCard.isPending}>
                  {updateCard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar alterações
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-muted-foreground mb-4">Nenhum cartão neste baralho</p>
              <Button onClick={handleAddCard} className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar cartão
              </Button>
            </div>
          )}
        </main>

        {/* Right sidebar - actions */}
        {currentCard && (
          <aside className="w-10 sm:w-12 border-l border-border/50 bg-muted/20 flex-shrink-0 flex flex-col items-center gap-1 pt-4">
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleDuplicate}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Duplicar"
            >
              <Copy className="h-4 w-4" />
            </button>
          </aside>
        )}
      </div>

      {/* FAB to add new card */}
      <button
        onClick={handleAddCard}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center z-20"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageDeck;
