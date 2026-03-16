import { useState, useEffect, useCallback, lazy, Suspense, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronUp, ChevronDown, Trash2, Copy, Plus, Loader2, PenLine, Image as ImageIcon, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const CARD_TYPE_OPTIONS: { value: CardType; label: string; description: string }[] = [
  { value: 'basic', label: 'Frente e Verso', description: 'Cartão clássico com uma pergunta na frente e a resposta no verso. Ideal para memorizar fatos, definições e conceitos diretos.' },
  { value: 'cloze', label: 'Oclusão de Texto', description: 'Texto com lacunas ocultas que você precisa preencher. Use {{c1::palavra}} para criar lacunas. Clozes com o mesmo número geram o mesmo cartão.' },
  { value: 'image_occlusion', label: 'Oclusão de Imagem', description: 'Oculte partes de uma imagem com retângulos. Cada região ocultada vira um cartão independente. Ideal para anatomia, diagramas e mapas.' },
];

const ManageDeck = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cards, isLoading, createCard, updateCard, deleteCard } = useCards(deckId ?? '');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialCardId = searchParams.get('cardId');
  const hasAppliedInitialCardRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingNewCardId, setPendingNewCardId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [cardType, setCardType] = useState<CardType>('basic');
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [typeInfoOpen, setTypeInfoOpen] = useState(false);
  

  // Image occlusion state
  const [occlusionImageUrl, setOcclusionImageUrl] = useState('');
  const [occlusionRects, setOcclusionRects] = useState<any[]>([]);
  const [occlusionCanvasSize, setOcclusionCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);

  const sortedCards = cards ?? [];
  const currentCard = sortedCards[selectedIndex] ?? null;
  const totalCards = sortedCards.length;

  // Set initial card from URL param or newly created card id
  useEffect(() => {
    const targetCardId = pendingNewCardId || initialCardId;
    if (targetCardId && sortedCards.length > 0) {
      const idx = sortedCards.findIndex(c => c.id === targetCardId);
      if (idx >= 0) {
        setSelectedIndex(idx);
        if (pendingNewCardId === targetCardId) setPendingNewCardId(null);
      }
    }
  }, [initialCardId, pendingNewCardId, sortedCards]);

  // Load card content when selection changes
  useEffect(() => {
    if (!currentCard) return;
    let ct = (currentCard.card_type ?? 'basic') as CardType;
    let needsAutoSave = false;

    if (ct === 'image_occlusion') {
      try {
        const data = JSON.parse(currentCard.front_content);
        setOcclusionImageUrl(data.imageUrl || '');
        setOcclusionRects(data.allRects || data.rects || []);
        setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
        setFront(data.frontText || '');
      } catch { setFront(''); setOcclusionImageUrl(''); setOcclusionRects([]); }
      setBack(currentCard.back_content);
    } else {
      // Unified handling for basic & cloze: detect cloze markup regardless of card_type
      let clozeExtra = '';
      let backRaw = currentCard.back_content || '';
      try {
        const parsed = JSON.parse(backRaw);
        if (parsed && typeof parsed.clozeTarget === 'number') {
          clozeExtra = parsed.extra || '';
          backRaw = clozeExtra;
        }
      } catch { /* not JSON */ }

      const frontVal = currentCard.front_content || '';
      const frontPlain = frontVal.replace(/<[^>]*>/g, '');
      const backPlain = backRaw.replace(/<[^>]*>/g, '');
      const frontHasCloze = /\{\{c\d+::/.test(frontPlain);
      const backHasCloze = /\{\{c\d+::/.test(backPlain);

      // Auto-reclassify as cloze if markup found
      if ((frontHasCloze || backHasCloze) && ct !== 'cloze') {
        ct = 'cloze';
        needsAutoSave = true;
      }

      if (backHasCloze && !frontHasCloze) {
        // Cloze markup is in the back — move it to front
        setFront(backRaw);
        setBack(frontVal && frontVal !== '<p></p>' ? frontVal : '');
        needsAutoSave = true;
      } else if (ct === 'cloze') {
        setFront(frontVal);
        setBack(clozeExtra || (backRaw !== currentCard.back_content ? '' : backRaw));
      } else {
        setFront(frontVal);
        setBack(backRaw);
      }
    }

    setCardType(ct);
    setIsDirty(needsAutoSave);
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
            <div className="mx-auto flex h-full min-h-0 max-w-2xl flex-row gap-0">
              {/* Cards column */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">

                {/* Card type selector */}
                <div className="flex items-center gap-2">
                  <Select value={cardType} onValueChange={(v) => handleTypeChange(v as CardType)}>
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => setTypeInfoOpen(true)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Sobre os tipos de cartão"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Front */}
                <div className="rounded-2xl border border-border bg-card flex-1 min-h-[120px] overflow-y-auto relative">
                  {!front || front === '<p></p>' ? (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-muted-foreground/40 text-lg font-medium">[Frente]</span>
                    </div>
                  ) : null}
                  <LazyRichEditor
                    content={front}
                    onChange={(v) => { setFront(v); setIsDirty(true); }}
                    placeholder=""
                    chromeless
                    hideToolbarUntilFocus
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
                <div className="rounded-2xl border border-border bg-card flex-1 min-h-[120px] overflow-y-auto relative">
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
                    hideToolbarUntilFocus
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

              {/* Right action strip */}
              <div className="flex flex-col items-center justify-center gap-1 pl-2 sm:pl-3 shrink-0">
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

      {/* FAB to add new card */}
      {totalCards > 0 && (
        <button
          onClick={handleAddCard}
          className="fixed bottom-6 right-6 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center z-20"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      {/* Card type info modal */}
      <Dialog open={typeInfoOpen} onOpenChange={setTypeInfoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Tipos de Cartão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {CARD_TYPE_OPTIONS.map(opt => (
              <div key={opt.value} className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
              </div>
            ))}
          </div>
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

export default ManageDeck;
