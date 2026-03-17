import { useState, useEffect, useCallback, lazy, Suspense, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, Trash2, Copy, Plus, Loader2, Image as ImageIcon, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CardContent as CardPreviewContent, buildVirtualCards } from '@/components/deck-detail/CardPreviewSheet';
import { useCards } from '@/hooks/useCards';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import LazyRichEditor from '@/components/LazyRichEditor';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import OcclusionEditor from '@/components/manage-deck/OcclusionEditor';
import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';



const ManageDeck = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cards, isLoading, createCard, updateCard, deleteCard } = useCards(deckId ?? '');
  const { energy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAICreating, setIsAICreating] = useState(false);

  const initialCardId = searchParams.get('cardId');
  const hasAppliedInitialCardRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingNewCardId, setPendingNewCardId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Image occlusion state
  const [occlusionImageUrl, setOcclusionImageUrl] = useState('');
  const [occlusionRects, setOcclusionRects] = useState<any[]>([]);
  const [occlusionCanvasSize, setOcclusionCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);

  const sortedCards = useMemo(() => [...(cards ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [cards]);
  const currentCard = sortedCards[selectedIndex] ?? null;
  const totalCards = sortedCards.length;

  // Apply URL card only once; after that preserve local selection and prioritize newly created card
  useEffect(() => {
    if (pendingNewCardId && sortedCards.length > 0) {
      const idx = sortedCards.findIndex(c => c.id === pendingNewCardId);
      if (idx >= 0) {
        setSelectedIndex(idx);
        setPendingNewCardId(null);
      }
      return;
    }

    if (!hasAppliedInitialCardRef.current && initialCardId && sortedCards.length > 0) {
      const idx = sortedCards.findIndex(c => c.id === initialCardId);
      if (idx >= 0) setSelectedIndex(idx);
      hasAppliedInitialCardRef.current = true;
    }
  }, [initialCardId, pendingNewCardId, sortedCards]);

  // Load card content when selection changes
  useEffect(() => {
    if (!currentCard) return;
    const ct = (currentCard.card_type ?? 'basic') as string;
    let needsAutoSave = false;

    // Detect image_occlusion by card_type OR by JSON content shape (fallback for mistyped cards)
    const strippedFront = currentCard.front_content.replace(/<[^>]*>/g, '').trim();
    const looksLikeOcclusionJson = /^\s*\{.*"imageUrl"\s*:/.test(strippedFront);
    const isOcclusionContent = ct === 'image_occlusion' || looksLikeOcclusionJson;

    if (isOcclusionContent) {
      try {
        // Try parsing raw content first, then try stripping HTML tags
        let data: any;
        try {
          data = JSON.parse(currentCard.front_content);
        } catch {
          data = JSON.parse(strippedFront);
        }
        setOcclusionImageUrl(data.imageUrl || '');
        setOcclusionRects(data.allRects || data.rects || []);
        setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
        setFront(data.frontText || '');
      } catch { setFront(''); setOcclusionImageUrl(''); setOcclusionRects([]); }
      // Parse back for cloze extra
      let backRaw = currentCard.back_content || '';
      try {
        const parsed = JSON.parse(backRaw);
        if (parsed && typeof parsed.clozeTarget === 'number') {
          backRaw = parsed.extra || '';
        }
      } catch {}
      setBack(backRaw);
    } else {
      // Unified handling for basic & cloze
      let clozeExtra = '';
      let backRaw = currentCard.back_content || '';
      try {
        const parsed = JSON.parse(backRaw);
        if (parsed && typeof parsed.clozeTarget === 'number') {
          clozeExtra = parsed.extra || '';
          backRaw = clozeExtra;
        }
      } catch {}

      const frontVal = currentCard.front_content || '';
      const backPlain = backRaw.replace(/<[^>]*>/g, '');
      const frontPlain = frontVal.replace(/<[^>]*>/g, '');
      const frontHasCloze = /\{\{c\d+::/.test(frontPlain);
      const backHasCloze = /\{\{c\d+::/.test(backPlain);

      if (backHasCloze && !frontHasCloze) {
        // Cloze markup is in the back — move it to front
        setFront(backRaw);
        setBack(frontVal && frontVal !== '<p></p>' ? frontVal : '');
        needsAutoSave = true;
      } else if (frontHasCloze) {
        setFront(frontVal);
        setBack(clozeExtra || (backRaw !== currentCard.back_content ? '' : backRaw));
      } else {
        setFront(frontVal);
        setBack(backRaw);
      }

      // Clear occlusion state for non-image cards
      setOcclusionImageUrl('');
      setOcclusionRects([]);
      setOcclusionCanvasSize(null);
    }

    setIsDirty(needsAutoSave);
  }, [currentCard?.id]);

  // Auto-detect card type from content
  const detectCardType = useCallback((): string => {
    const hasImage = !!occlusionImageUrl;
    const plainFront = front.replace(/<[^>]*>/g, '');
    const hasCloze = /\{\{c\d+::/.test(plainFront);
    if (hasImage) return 'image_occlusion';
    if (hasCloze) return 'cloze';
    return 'basic';
  }, [front, occlusionImageUrl]);

  const buildSavePayload = useCallback(() => {
    const detectedType = detectCardType();
    let frontContent = front;
    let backContent = back;

    if (detectedType === 'image_occlusion') {
      frontContent = JSON.stringify({
        imageUrl: occlusionImageUrl,
        frontText: front,
        rects: occlusionRects,
        allRects: occlusionRects,
        canvasWidth: occlusionCanvasSize?.w ?? 0,
        canvasHeight: occlusionCanvasSize?.h ?? 0,
      });
    }
    
    if (detectedType === 'cloze' || detectedType === 'image_occlusion') {
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
      if (uniqueNums.length > 0) {
        backContent = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
      }
    }

    return { frontContent, backContent, cardType: detectedType };
  }, [front, back, occlusionImageUrl, occlusionRects, occlusionCanvasSize, detectCardType]);

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
        onSuccess: (createdCard) => {
          if (!Array.isArray(createdCard) && createdCard?.id) {
            setPendingNewCardId(createdCard.id);
          }
          toast({ title: 'Novo cartão criado' });
        },
      }
    );
  }, [createCard, toast]);

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

  const handleOcclusionAction = useCallback(() => {
    setOcclusionModalOpen(true);
    setIsDirty(true);
  }, []);

  const handleAICreate = useCallback(async (templatePrompt: string) => {
    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    if (!strippedFront) { toast({ title: 'Escreva algo na frente primeiro', variant: 'destructive' }); return; }
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setIsAICreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-card', {
        body: { front, back, cardType: 'basic', aiModel: model, energyCost: 1, customPrompt: templatePrompt },
      });
      if (error) throw error;
      if (data?.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (data?.front) { setFront(markdownToHtml(data.front)); setIsDirty(true); }
      if (data?.back) { setBack(markdownToHtml(data.back)); setIsDirty(true); }
      toast({ title: '✨ Cartão gerado com IA!' });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar', description: e.message, variant: 'destructive' });
    } finally { setIsAICreating(false); }
  }, [front, back, energy, model, queryClient, toast]);

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
          {/* Right header: Preview + Save */}
          <div className="flex items-center gap-1.5">
            {totalCards > 0 && (
              <button
                onClick={() => { if (isDirty) saveCurrentCard(); setPreviewOpen(true); }}
                className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                title="Previsualizar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                  <path d="M15 6H9v12h6zM9 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM5 8v8a1 1 0 1 1-2 0V8a1 1 0 0 1 2 0M21 8v8a1 1 0 1 1-2 0V8a1 1 0 1 1 2 0" />
                </svg>
              </button>
            )}
            {isDirty ? (
              <button
                onClick={saveCurrentCard}
                disabled={updateCard.isPending}
                className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="Salvar"
              >
                {updateCard.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
            ) : (
              <div className="w-9" />
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar - card numbers */}
        <aside className="w-12 sm:w-14 overflow-y-auto flex-shrink-0">
          <div className="flex flex-col gap-1.5 p-1.5">
            {sortedCards.map((card, idx) => (
              <button
                key={card.id}
                onClick={() => selectCard(idx)}
                className={`flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 mx-auto rounded-sm text-xs font-medium transition-all border ${
                  idx === selectedIndex
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </aside>

        {/* Main editor area */}
        <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
          {currentCard ? (
            <div className="mx-auto flex h-full min-h-0 max-w-2xl flex-row gap-2">
              {/* Cards column */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">

                {/* Front */}
                <div className="rounded-2xl border border-border bg-card flex-1 min-h-[120px] overflow-hidden relative flex flex-col">
                  {!front || front === '<p></p>' && !occlusionImageUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-muted-foreground/40 text-lg font-medium">[Frente]</span>
                    </div>
                  ) : null}

                  {/* Image occlusion area - inside front card */}
                  {occlusionImageUrl && (
                    <div className="p-3 pb-0">
                      <button
                        type="button"
                        onClick={() => setOcclusionModalOpen(true)}
                        className="relative inline-block rounded-lg overflow-hidden border border-border shrink-0"
                        title="Editar oclusões"
                      >
                        <img src={occlusionImageUrl} alt="Imagem de oclusão" className="h-20 w-20 object-cover rounded-lg" />
                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-primary/80 py-0.5">
                          <ImageIcon className="h-3 w-3 text-primary-foreground" />
                        </div>
                      </button>
                    </div>
                  )}

                  <LazyRichEditor
                    content={front}
                    onChange={(v) => { setFront(v); setIsDirty(true); }}
                    placeholder=""
                    chromeless
                    hideCloze={false}
                    onOcclusionPaste={handleOcclusionAction}
                    onOcclusionAttach={handleOcclusionAction}
                    onAICreate={handleAICreate}
                    isAICreating={isAICreating}
                  />
                </div>

                {/* Back */}
                <div className="rounded-2xl border border-border bg-card flex-1 min-h-[120px] overflow-hidden relative flex flex-col">
                  {!back || back === '<p></p>' ? (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-muted-foreground/40 text-lg font-medium">[Verso]</span>
                    </div>
                  ) : null}
                  <LazyRichEditor
                    content={back}
                    onChange={(v) => { setBack(v); setIsDirty(true); }}
                    placeholder=""
                    chromeless
                    hideCloze
                    onAICreate={handleAICreate}
                    isAICreating={isAICreating}
                  />
                </div>
              </div>

              {/* Right sidebar - actions */}
              <div className="flex flex-col items-center justify-center gap-2 shrink-0">
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={handleDuplicate}
                  className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  title="Duplicar"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={handleAddCard}
                  className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  title="Novo cartão"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {occlusionImageUrl && (
                  <button
                    onClick={() => setOcclusionModalOpen(true)}
                    className="h-9 w-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    title="Editar oclusão"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

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
      </div>

      {/* Card Preview Modal */}
      <ManageDeckPreview
        cards={sortedCards}
        initialIndex={selectedIndex}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {/* Occlusion Editor Dialog (for upload + draw) */}
      <Dialog open={occlusionModalOpen} onOpenChange={setOcclusionModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" /> Oclusão de Imagem
            </DialogTitle>
          </DialogHeader>
          <OcclusionEditor
            initialFront={occlusionImageUrl ? JSON.stringify({
              imageUrl: occlusionImageUrl,
              rects: occlusionRects,
              allRects: occlusionRects,
              canvasWidth: occlusionCanvasSize?.w ?? 0,
              canvasHeight: occlusionCanvasSize?.h ?? 0,
            }) : ''}
            onSave={(frontContent) => {
              try {
                const data = JSON.parse(frontContent);
                setOcclusionImageUrl(data.imageUrl || '');
                setOcclusionRects(data.allRects || data.rects || []);
                setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
                setIsDirty(true);
              } catch {}
              setOcclusionModalOpen(false);
            }}
            onRemoveImage={() => {
              setOcclusionImageUrl('');
              setOcclusionRects([]);
              setOcclusionCanvasSize(null);
              setIsDirty(true);
              setOcclusionModalOpen(false);
            }}
            onCancel={() => setOcclusionModalOpen(false)}
            isSaving={false}
          />
        </DialogContent>
      </Dialog>

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

/* ─── Lightweight preview modal for ManageDeck ─── */

function ManageDeckPreview({ cards, initialIndex, open, onClose }: {
  cards: any[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}) {
  const virtualCards = useMemo(() => buildVirtualCards(cards), [cards]);
  const [index, setIndex] = useState(initialIndex);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { if (open) { setIndex(initialIndex); setRevealed(false); } }, [open, initialIndex]);

  const safeIndex = virtualCards.length > 0 ? Math.min(index, virtualCards.length - 1) : 0;
  const vc = virtualCards[safeIndex] ?? null;

  const goPrev = useCallback(() => { if (safeIndex > 0) { setIndex(i => i - 1); setRevealed(false); } }, [safeIndex]);
  const goNext = useCallback(() => { if (safeIndex < virtualCards.length - 1) { setIndex(i => i + 1); setRevealed(false); } }, [safeIndex, virtualCards.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setRevealed(r => !r); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext, onClose]);

  // Swipe
  const touchRef = useRef<{ x: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onTS = (e: TouchEvent) => { touchRef.current = { x: e.touches[0].clientX }; };
    const onTE = (e: TouchEvent) => {
      if (!touchRef.current) return;
      const dx = e.changedTouches[0].clientX - touchRef.current.x;
      if (Math.abs(dx) > 60) { dx > 0 ? goPrev() : goNext(); }
      touchRef.current = null;
    };
    window.addEventListener('touchstart', onTS, { passive: true });
    window.addEventListener('touchend', onTE, { passive: true });
    return () => { window.removeEventListener('touchstart', onTS); window.removeEventListener('touchend', onTE); };
  }, [open, goPrev, goNext]);

  if (!open || !vc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <span className="inline-flex items-center rounded-full border border-border/50 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
          <span className="text-primary">{safeIndex + 1}</span>/{virtualCards.length}
        </span>
        <div className="w-9" />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pb-6 min-h-0">
        <div className="w-full max-w-lg">
          <CardPreviewContent vc={vc} revealed={revealed} onClick={() => setRevealed(r => !r)} />
        </div>
      </div>

      {/* Navigation dots */}
      <div className="shrink-0 flex items-center justify-center gap-3 pb-4">
        <button onClick={goPrev} disabled={safeIndex === 0} className="h-10 w-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
          <ChevronUp className="h-5 w-5 -rotate-90" />
        </button>
        <span className="text-xs text-muted-foreground">Toque para revelar</span>
        <button onClick={goNext} disabled={safeIndex >= virtualCards.length - 1} className="h-10 w-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
          <ChevronDown className="h-5 w-5 -rotate-90" />
        </button>
      </div>
    </div>
  );
}

export default ManageDeck;
