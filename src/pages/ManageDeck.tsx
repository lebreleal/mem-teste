import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, Trash2, Copy, Plus, Loader2, MessageSquareText, PenLine, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCards } from '@/hooks/useCards';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client'; // kept for future use
import LazyRichEditor from '@/components/LazyRichEditor';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

const ImageOcclusion = lazy(() => import('@/components/ImageOcclusion'));

type CardType = 'basic' | 'cloze' | 'image_occlusion';

const CARD_TYPE_OPTIONS: { value: CardType; label: string; icon: React.ReactNode }[] = [
  { value: 'basic', label: 'Frente e Verso', icon: <MessageSquareText className="h-4 w-4" /> },
  { value: 'cloze', label: 'Cloze', icon: <PenLine className="h-4 w-4" /> },
  { value: 'image_occlusion', label: 'Oclusão de Imagem', icon: <ImageIcon className="h-4 w-4" /> },
];

const ManageDeck = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cards, isLoading, createCard, updateCard, deleteCard } = useCards(deckId ?? '');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialCardId = searchParams.get('cardId');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [cardType, setCardType] = useState<CardType>('basic');
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  

  // Image occlusion state
  const [occlusionImageUrl, setOcclusionImageUrl] = useState('');
  const [occlusionRects, setOcclusionRects] = useState<any[]>([]);
  const [occlusionCanvasSize, setOcclusionCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);

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
    const ct = (currentCard.card_type ?? 'basic') as CardType;
    setCardType(ct);

    if (ct === 'image_occlusion') {
      try {
        const data = JSON.parse(currentCard.front_content);
        setOcclusionImageUrl(data.imageUrl || '');
        setOcclusionRects(data.allRects || data.rects || []);
        setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
        setFront(data.frontText || '');
      } catch { setFront(''); setOcclusionImageUrl(''); setOcclusionRects([]); }
      setBack(currentCard.back_content);
    } else if (ct === 'cloze') {
      setFront(currentCard.front_content);
      try {
        const parsed = JSON.parse(currentCard.back_content);
        setBack(typeof parsed.clozeTarget === 'number' ? (parsed.extra || '') : currentCard.back_content);
      } catch { setBack(currentCard.back_content); }
    } else {
      setFront(currentCard.front_content);
      setBack(currentCard.back_content);
    }
    setIsDirty(false);
  }, [currentCard?.id]);

  const buildSavePayload = useCallback(() => {
    let frontContent = front;
    let backContent = back;

    if (cardType === 'image_occlusion') {
      frontContent = JSON.stringify({
        imageUrl: occlusionImageUrl,
        frontText: front,
        rects: occlusionRects,
        allRects: occlusionRects,
        canvasWidth: occlusionCanvasSize?.w ?? 0,
        canvasHeight: occlusionCanvasSize?.h ?? 0,
      });
    } else if (cardType === 'cloze') {
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
      backContent = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
    }

    return { frontContent, backContent };
  }, [front, back, cardType, occlusionImageUrl, occlusionRects, occlusionCanvasSize]);

  const saveCurrentCard = useCallback(async () => {
    if (!currentCard || !isDirty) return;
    const { frontContent, backContent } = buildSavePayload();
    updateCard.mutate(
      { id: currentCard.id, frontContent, backContent },
      { onSuccess: () => { setIsDirty(false); } }
    );
  }, [currentCard, isDirty, buildSavePayload, updateCard]);

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

  const handleTypeChange = useCallback((newType: CardType) => {
    setCardType(newType);
    setIsDirty(true);
    // Reset occlusion state when switching away
    if (newType !== 'image_occlusion') {
      setOcclusionImageUrl('');
      setOcclusionRects([]);
      setOcclusionCanvasSize(null);
    }
  }, []);

  const handleOcclusionPaste = useCallback(() => {
    setOcclusionModalOpen(true);
    setIsDirty(true);
  }, []);

  const handleOcclusionAttach = useCallback(() => {
    setOcclusionModalOpen(true);
    setIsDirty(true);
  }, []);



  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm">
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

          <div className="w-16" />
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
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
        <main className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
          {currentCard ? (
            <div className="mx-auto flex h-full min-h-0 max-w-2xl flex-col gap-3">
              {/* Card type selector */}
              <div className="flex items-center gap-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Tipo</Label>
                <Select value={cardType} onValueChange={(v) => handleTypeChange(v as CardType)}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          {opt.icon} {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Front */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                  {cardType === 'image_occlusion' ? 'Frente (Pergunta)' : 'Frente'}
                </Label>
                <LazyRichEditor
                  content={front}
                  onChange={(v) => { setFront(v); setIsDirty(true); }}
                  placeholder={
                    cardType === 'cloze'
                      ? 'A {{c1::mitocôndria}} é responsável pela respiração celular.'
                      : cardType === 'image_occlusion'
                      ? 'Pergunta ou contexto (opcional)'
                      : 'Frente do cartão'
                  }
                  chromeless
                  hideCloze={cardType !== 'cloze'}
                  onOcclusionPaste={cardType === 'image_occlusion' ? handleOcclusionPaste : undefined}
                  onOcclusionAttach={cardType === 'image_occlusion' ? handleOcclusionAttach : undefined}
                />
              </div>

              {/* Image occlusion area */}
              {cardType === 'image_occlusion' && (
                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Imagem de Oclusão</Label>
                  {occlusionImageUrl ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setOcclusionModalOpen(true)}
                        className="relative inline-block rounded-lg overflow-hidden border border-border"
                        title="Editar oclusões"
                      >
                        <img src={occlusionImageUrl} alt="Imagem de oclusão" className="h-20 w-20 object-cover rounded-lg" />
                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-primary/80 py-0.5">
                          <ImageIcon className="h-3 w-3 text-primary-foreground" />
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setOcclusionImageUrl(''); setOcclusionRects([]); setOcclusionCanvasSize(null); setIsDirty(true); }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover imagem
                      </Button>

                      {occlusionModalOpen && (
                        <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
                          <ImageOcclusion
                            imageUrl={occlusionImageUrl}
                            initialRects={occlusionRects}
                            onChange={(rects, meta) => {
                              setOcclusionRects(rects);
                              if (meta) setOcclusionCanvasSize({ w: meta.canvasWidth, h: meta.canvasHeight });
                              setIsDirty(true);
                            }}
                          />
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => setOcclusionModalOpen(false)}>Concluir</Button>
                          </div>
                        </Suspense>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Use o ícone de oclusão na barra da Frente para anexar uma imagem.</p>
                  )}
                </div>
              )}

              {/* Cloze help */}
              {cardType === 'cloze' && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PenLine className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[11px] font-bold text-primary">Como usar Cloze</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Selecione o texto e clique para criar um <strong className="text-foreground">cloze</strong>. Clozes com mesmo número viram o mesmo cartão.
                  </p>
                </div>
              )}

              {/* Back */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Verso (Resposta)</Label>
                <LazyRichEditor
                  content={back}
                  onChange={(v) => { setBack(v); setIsDirty(true); }}
                  placeholder="Verso do cartão"
                  chromeless
                  hideCloze
                />
              </div>

              {/* Save button */}
              {isDirty && (
                <Button onClick={saveCurrentCard} className="w-full gap-2 shrink-0" disabled={updateCard.isPending}>
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
        className="fixed bottom-20 right-6 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center z-20"
      >
        <Plus className="h-5 w-5" />
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
