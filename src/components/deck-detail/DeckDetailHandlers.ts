/**
 * DeckDetailHandlers — Extracted mutation handlers from DeckDetailContext.
 * All useCallback handlers that modify data (CQRS Command side).
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as cardService from '@/services/cardService';
import * as deckService from '@/services/deckService';
import { invalidateDeckRelatedQueries } from '@/lib/queryKeys';
import type { CardRow } from '@/types/deck';
import type { useToast } from '@/hooks/use-toast';
import type { QueryClient } from '@tanstack/react-query';

interface HandlerDeps {
  deckId: string;
  deck: any;
  allCards: CardRow[];
  allDeckIds: string[];
  user: any;
  toast: UseToastReturn['toast'];
  queryClient: QueryClient;
  navigate: (path: string) => void;
  // State setters
  front: string;
  back: string;
  cardType: string | null;
  editingId: string | null;
  deleteId: string | null;
  moveCardId: string | null;
  moveTargetDeck: string;
  selectedCards: Set<string>;
  filteredCards: CardRow[];
  occlusionImageUrl: string;
  occlusionRects: any[];
  occlusionCanvasSize: { w: number; h: number } | null;
  mcOptions: string[];
  mcCorrectIndex: number;
  energy: number;
  model: string;
  algorithmConfirm: { value: string; label: string } | null;
  examTitle: string;
  examTotalQuestions: number;
  examWrittenCount: number;
  examOptionsCount: 4 | 5;
  examTimeLimit: number;
  improvePreview: { front: string; back: string } | null;
  // Mutations from useCards
  createCard: any;
  updateCard: any;
  deleteCard: any;
  // From hooks
  createExam: any;
  addNotification: any;
  updateNotification: any;
  // State setters (callbacks)
  setFront: (v: string) => void;
  setBack: (v: string) => void;
  setEditingId: (v: string | null) => void;
  setCardType: (v: string | null) => void;
  setDeleteId: (v: string | null) => void;
  setMoveCardId: (v: string | null) => void;
  setMoveTargetDeck: (v: string) => void;
  setSelectedCards: (v: Set<string>) => void;
  setSelectionMode: (v: boolean) => void;
  setBulkMoveOpen: (v: boolean) => void;
  setEditorOpen: (v: boolean) => void;
  setOcclusionImageUrl: (v: string) => void;
  setOcclusionRects: (v: any[]) => void;
  setOcclusionCanvasSize: (v: { w: number; h: number } | null) => void;
  setOcclusionModalOpen: (v: boolean) => void;
  setMcOptions: (v: string[]) => void;
  setMcCorrectIndex: (v: number) => void;
  setIsImproving: (v: boolean) => void;
  setImprovePreview: (v: { front: string; back: string } | null) => void;
  setImproveModalOpen: (v: boolean) => void;
  setImportOpen: (v: boolean) => void;
  setAlgorithmConfirm: (v: { value: string; label: string } | null) => void;
  setAlgorithmModalOpen: (v: boolean) => void;
  setExamModalOpen: (v: boolean) => void;
  setExamGenerating: (v: boolean) => void;
}

export function useDeckDetailHandlers(deps: HandlerDeps) {
  const {
    deckId, deck, allCards, allDeckIds, user, toast, queryClient, navigate,
    front, back, cardType, editingId, deleteId, moveCardId, moveTargetDeck,
    selectedCards, filteredCards, occlusionImageUrl, occlusionRects, occlusionCanvasSize,
    mcOptions, mcCorrectIndex, energy, model, algorithmConfirm,
    examTitle, examTotalQuestions, examWrittenCount, examOptionsCount, examTimeLimit,
    improvePreview,
    createCard, updateCard, deleteCard: deleteCardMutation,
    createExam, addNotification, updateNotification,
    setFront, setBack, setEditingId, setCardType, setDeleteId,
    setMoveCardId, setMoveTargetDeck, setSelectedCards, setSelectionMode,
    setBulkMoveOpen, setEditorOpen, setOcclusionImageUrl, setOcclusionRects,
    setOcclusionCanvasSize, setOcclusionModalOpen, setMcOptions, setMcCorrectIndex,
    setIsImproving, setImprovePreview, setImproveModalOpen, setImportOpen,
    setAlgorithmConfirm, setAlgorithmModalOpen, setExamModalOpen, setExamGenerating,
  } = deps;

  const resetForm = useCallback(() => {
    setFront(''); setBack(''); setEditingId(null); setCardType(null);
    setOcclusionImageUrl(''); setOcclusionRects([]); setOcclusionCanvasSize(null);
    setMcOptions(['', '', '', '']); setMcCorrectIndex(0);
  }, [setFront, setBack, setEditingId, setCardType, setOcclusionImageUrl, setOcclusionRects, setOcclusionCanvasSize, setMcOptions, setMcCorrectIndex]);

  const openNew = useCallback(() => { resetForm(); setEditorOpen(true); }, [resetForm, setEditorOpen]);

  const openEdit = useCallback((card: CardRow) => {
    setEditingId(card.id);
    setCardType(card.card_type ?? 'basic');
    if (card.card_type === 'image_occlusion') {
      try {
        const data = JSON.parse(card.front_content);
        setOcclusionImageUrl(data.imageUrl || '');
        setOcclusionRects(data.allRects || data.rects || []);
        setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
        setFront(data.frontText || '');
        setBack(card.back_content);
      } catch { setFront(''); setBack(card.back_content); }
    } else if (card.card_type === 'multiple_choice') {
      setFront(card.front_content);
      try {
        const data = JSON.parse(card.back_content);
        setMcOptions(data.options || ['', '', '', '']);
        setMcCorrectIndex(data.correctIndex ?? 0);
      } catch { setBack(card.back_content); }
    } else if (card.card_type === 'cloze') {
      setFront(card.front_content);
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
      setFront(card.front_content);
      setBack(card.back_content);
    }
    setEditorOpen(true);
  }, [setEditingId, setCardType, setOcclusionImageUrl, setOcclusionRects, setOcclusionCanvasSize, setFront, setBack, setMcOptions, setMcCorrectIndex, setEditorOpen]);

  const handleSave = useCallback(async (addAnother: boolean) => {
    if (!front.trim() && !occlusionImageUrl) {
      toast({ title: 'Preencha o campo Frente', variant: 'destructive' });
      return;
    }
    const onSuccess = () => {
      toast({ title: editingId ? 'Card atualizado!' : 'Card criado!' });
      if (addAnother) {
        setFront(''); setBack(''); setEditingId(null);
        setMcOptions(['', '', '', '']); setMcCorrectIndex(0);
        setOcclusionImageUrl(''); setOcclusionRects([]); setOcclusionModalOpen(false);
      } else { setEditorOpen(false); resetForm(); }
    };

    // Image occlusion
    if (occlusionImageUrl && occlusionRects.length > 0) {
      const allRects = occlusionRects;
      const userBack = back;
      const groups: Record<string, any[]> = {};
      const ungrouped: any[] = [];
      allRects.forEach((r: any) => {
        if (r.groupId) { if (!groups[r.groupId]) groups[r.groupId] = []; groups[r.groupId].push(r); }
        else ungrouped.push(r);
      });
      const cardEntries: { activeRectIds: string[] }[] = [];
      ungrouped.forEach(r => cardEntries.push({ activeRectIds: [r.id] }));
      Object.values(groups).forEach(groupRects => { cardEntries.push({ activeRectIds: groupRects.map((r: any) => r.id) }); });
      const cw = occlusionCanvasSize?.w ?? undefined;
      const ch = occlusionCanvasSize?.h ?? undefined;
      const frontText = front.trim() ? front : undefined;
      if (editingId) {
        const frontData = JSON.stringify({ imageUrl: occlusionImageUrl, allRects, activeRectIds: cardEntries[0]?.activeRectIds ?? [], canvasWidth: cw, canvasHeight: ch, ...(frontText ? { frontText } : {}) });
        updateCard.mutate({ id: editingId, frontContent: frontData, backContent: userBack }, { onSuccess });
      } else {
        const cards = cardEntries.map(entry => ({ frontContent: JSON.stringify({ imageUrl: occlusionImageUrl, allRects, activeRectIds: entry.activeRectIds, canvasWidth: cw, canvasHeight: ch, ...(frontText ? { frontText } : {}) }), backContent: userBack, cardType: 'image_occlusion' }));
        createCard.mutate({ cards } as any, { onSuccess });
      }
      return;
    }

    // Multiple choice
    if (cardType === 'multiple_choice') {
      const filledOptions = mcOptions.filter(o => o.trim());
      if (filledOptions.length < 2) { toast({ title: 'Adicione pelo menos 2 opções', variant: 'destructive' }); return; }
      const backContent = JSON.stringify({ options: mcOptions.filter(o => o.trim()), correctIndex: mcCorrectIndex });
      if (editingId) { updateCard.mutate({ id: editingId, frontContent: front, backContent }, { onSuccess }); }
      else { createCard.mutate({ frontContent: front, backContent, cardType: 'multiple_choice' }, { onSuccess }); }
      return;
    }

    const detectedType = cardType === 'cloze' || front.includes('{{c') ? 'cloze' : 'basic';
    if (detectedType === 'cloze') {
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

      if (editingId) {
        const editingCard = allCards.find(c => c.id === editingId);
        let frontContentForCloze = editingCard?.front_content;
        if (!frontContentForCloze && editingId) {
          const { data } = await supabase.from('cards').select('front_content').eq('id', editingId).single();
          frontContentForCloze = data?.front_content;
        }
        const allSiblingCards = frontContentForCloze
          ? await cardService.fetchClozeSiblings(allDeckIds, frontContentForCloze)
          : [];

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

        const updatePromises = numsToKeep.map(n => {
          const cardId = existingTargets.get(n)!;
          const backJson = JSON.stringify({ clozeTarget: n, extra: back });
          return cardService.updateCard(cardId, front, backJson);
        });

        const newCards = numsToAdd.map(n => ({
          frontContent: front,
          backContent: JSON.stringify({ clozeTarget: n, extra: back }),
          cardType: 'cloze',
        }));

        const deletePromises = numsToRemove.map(n => {
          const cardId = existingTargets.get(n)!;
          return cardService.deleteCard(cardId);
        });

        try {
          await Promise.all([...updatePromises, ...deletePromises]);
          if (newCards.length > 0) {
            await cardService.createCards(deckId, newCards);
          }
          invalidateDeckRelatedQueries(queryClient, deckId);
          onSuccess();
        } catch {
          toast({ title: 'Erro ao salvar cloze', variant: 'destructive' });
        }
      } else if (uniqueNums.length <= 1) {
        const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
        createCard.mutate({ frontContent: front, backContent: backJson, cardType: 'cloze' }, { onSuccess });
      } else {
        const cards = uniqueNums.map(n => ({
          frontContent: front,
          backContent: JSON.stringify({ clozeTarget: n, extra: back }),
          cardType: 'cloze',
        }));
        createCard.mutate({ cards } as any, { onSuccess });
      }
    } else {
      if (editingId) { updateCard.mutate({ id: editingId, frontContent: front, backContent: back }, { onSuccess }); }
      else { createCard.mutate({ frontContent: front, backContent: back, cardType: detectedType }, { onSuccess }); }
    }
  }, [front, back, occlusionImageUrl, occlusionRects, cardType, mcOptions, mcCorrectIndex, editingId, toast, createCard, updateCard, resetForm, allCards, allDeckIds, deckId, queryClient, occlusionCanvasSize, setFront, setBack, setEditingId, setMcOptions, setMcCorrectIndex, setOcclusionImageUrl, setOcclusionRects, setOcclusionModalOpen, setEditorOpen]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    const card = allCards.find(c => c.id === deleteId);
    const isCloze = card?.card_type === 'cloze';
    if (isCloze) {
      let frontContent = card?.front_content;
      if (!frontContent) {
        const { data } = await supabase.from('cards').select('front_content').eq('id', deleteId).single();
        frontContent = data?.front_content;
      }
      const siblings = frontContent ? await cardService.fetchClozeSiblings(allDeckIds, frontContent) : [];
      const ids = siblings.map(c => c.id);
      try {
        await cardService.bulkDeleteCards(ids);
        invalidateDeckRelatedQueries(queryClient, deckId);
        toast({ title: `${ids.length} card${ids.length > 1 ? 's' : ''} cloze excluído${ids.length > 1 ? 's' : ''}` });
      } catch {
        toast({ title: 'Erro ao excluir', variant: 'destructive' });
      }
      setDeleteId(null);
    } else {
      deleteCardMutation.mutate(deleteId, { onSuccess: () => { setDeleteId(null); toast({ title: 'Card excluído' }); } });
    }
  }, [deleteId, deleteCardMutation, toast, allCards, allDeckIds, deckId, queryClient, setDeleteId]);

  const handleMoveCard = useCallback(async () => {
    if (!moveCardId || !moveTargetDeck) return;
    try {
      await cardService.moveCard(moveCardId, moveTargetDeck);
      toast({ title: 'Card movido!' });
      invalidateDeckRelatedQueries(queryClient, deckId);
      invalidateDeckRelatedQueries(queryClient, moveTargetDeck);
    } catch { toast({ title: 'Erro ao mover', variant: 'destructive' }); }
    setMoveCardId(null); setMoveTargetDeck('');
  }, [moveCardId, moveTargetDeck, deckId, queryClient, toast, setMoveCardId, setMoveTargetDeck]);

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCards((prev: Set<string>) => { const next = new Set(prev); next.has(cardId) ? next.delete(cardId) : next.add(cardId); return next; });
  }, [setSelectedCards]);

  const selectAllCards = useCallback(() => {
    if (selectedCards.size === filteredCards.length) setSelectedCards(new Set());
    else setSelectedCards(new Set(filteredCards.map(c => c.id)));
  }, [selectedCards.size, filteredCards, setSelectedCards]);

  const handleBulkMove = useCallback(async () => {
    if (!moveTargetDeck || selectedCards.size === 0) return;
    const ids = Array.from(selectedCards);
    try {
      await cardService.bulkMoveCards(ids, moveTargetDeck);
      toast({ title: `${ids.length} card${ids.length > 1 ? 's' : ''} movido${ids.length > 1 ? 's' : ''}!` });
      invalidateDeckRelatedQueries(queryClient, deckId);
    } catch { toast({ title: 'Erro ao mover', variant: 'destructive' }); }
    setSelectedCards(new Set()); setSelectionMode(false); setBulkMoveOpen(false); setMoveTargetDeck('');
  }, [moveTargetDeck, selectedCards, deckId, queryClient, toast, setSelectedCards, setSelectionMode, setBulkMoveOpen, setMoveTargetDeck]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedCards);
    try {
      await cardService.bulkDeleteCards(ids);
      toast({ title: `${ids.length} card${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''}!` });
      invalidateDeckRelatedQueries(queryClient, deckId);
    } catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }); }
    setSelectedCards(new Set()); setSelectionMode(false);
  }, [selectedCards, deckId, queryClient, toast, setSelectedCards, setSelectionMode]);

  const uploadOcclusionFile = useCallback(async (file: File) => {
    if (!user) return;
    try {
      const url = await cardService.uploadCardImage(user.id, file);
      setOcclusionImageUrl(url);
      setOcclusionModalOpen(true);
    } catch (e: any) { toast({ title: e.message || 'Erro no upload', variant: 'destructive' }); }
  }, [user, toast, setOcclusionImageUrl, setOcclusionModalOpen]);

  const handleOcclusionAttach = useCallback(async () => {
    if (!user) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => { const file = input.files?.[0]; if (file) await uploadOcclusionFile(file); };
    input.click();
  }, [user, uploadOcclusionFile]);

  const handleOcclusionPaste = useCallback(async () => {
    if (!user) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const file = new File([blob], `paste.${ext}`, { type: imageType });
          await uploadOcclusionFile(file); return;
        }
      }
      toast({ title: 'Nenhuma imagem na área de transferência', variant: 'destructive' });
    } catch { toast({ title: 'Não foi possível acessar a área de transferência', variant: 'destructive' }); }
  }, [user, uploadOcclusionFile, toast]);

  const handleImprove = useCallback(async () => {
    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    if (!strippedFront) { toast({ title: 'Escreva algo no card primeiro', variant: 'destructive' }); return; }
    if (energy < 1) { toast({ title: 'Créditos insuficientes', description: 'Você precisa de 1 crédito IA.', variant: 'destructive' }); return; }
    setIsImproving(true);
    try {
      let backToSend = back;
      if (cardType === 'multiple_choice') backToSend = JSON.stringify({ options: mcOptions.filter(o => o.trim()), correctIndex: mcCorrectIndex });
      const data = await cardService.enhanceCard({ front, back: backToSend, cardType: cardType || 'basic', aiModel: model, energyCost: 1 });
      if (data.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      if (data.unchanged) { toast({ title: '✨ Este card já está ótimo!', description: 'Não há melhorias a fazer.' }); return; }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setImprovePreview({ front: data.front, back: data.back });
      setImproveModalOpen(true);
    } catch (e: any) { toast({ title: 'Erro ao melhorar card', description: e.message, variant: 'destructive' }); }
    finally { setIsImproving(false); }
  }, [front, back, cardType, mcOptions, mcCorrectIndex, energy, model, queryClient, toast, setIsImproving, setImprovePreview, setImproveModalOpen]);

  const applyImprovement = useCallback(() => {
    if (!improvePreview) return;
    setFront(improvePreview.front);
    if (cardType === 'multiple_choice') {
      try { const data = JSON.parse(improvePreview.back); setMcOptions(data.options || mcOptions); setMcCorrectIndex(data.correctIndex ?? mcCorrectIndex); } catch {}
    } else { setBack(improvePreview.back); }
    setImproveModalOpen(false); setImprovePreview(null);
    toast({ title: 'Melhoria aplicada!' });
  }, [improvePreview, cardType, mcOptions, mcCorrectIndex, toast, setFront, setBack, setMcOptions, setMcCorrectIndex, setImproveModalOpen, setImprovePreview]);

  const handleImportCards = useCallback(async (subDeckName: string, importedCards: { frontContent: string; backContent: string; cardType?: string }[], subdecks?: any[]) => {
    if (!deckId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (subdecks && subdecks.length > 0) {
        await deckService.importDeckWithSubdecks(
          user.id, subDeckName, deck?.folder_id ?? null,
          importedCards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType || 'basic' })),
          subdecks, deck?.algorithm_mode,
        );
        toast({ title: `${importedCards.length} cartões importados em subdecks!` });
      } else {
        const newName = subDeckName || 'Importado';
        const { data: newDeck, error } = await supabase
          .from('decks')
          .insert({ name: newName, user_id: user.id, folder_id: deck?.folder_id ?? null, parent_deck_id: deckId, algorithm_mode: deck?.algorithm_mode || 'sm2' } as any)
          .select().single();
        if (error || !newDeck) throw error;
        await cardService.createCards((newDeck as any).id, importedCards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType || 'basic' })));
        toast({ title: `${importedCards.length} cartões importados como subdeck "${newName}"!` });
      }
      invalidateDeckRelatedQueries(queryClient, deckId);
      setImportOpen(false);
    } catch { toast({ title: 'Erro ao importar', variant: 'destructive' }); }
  }, [deckId, deck, queryClient, toast, setImportOpen]);

  const handleAlgorithmChange = useCallback(async (forceReset = true) => {
    if (!algorithmConfirm || !deckId) return;
    try {
      const result = await deckService.changeAlgorithm(deckId, algorithmConfirm.value, forceReset);
      invalidateDeckRelatedQueries(queryClient, deckId);
      toast({
        title: `Algoritmo alterado para ${algorithmConfirm.label}`,
        description: result.shouldReset
          ? `Progresso redefinido${result.childCount ? ` (+ ${result.childCount} sub-baralho${result.childCount > 1 ? 's' : ''})` : ''}.`
          : 'Progresso mantido.',
      });
      setAlgorithmConfirm(null); setAlgorithmModalOpen(false);
    } catch { toast({ title: 'Erro ao alterar algoritmo', variant: 'destructive' }); }
  }, [algorithmConfirm, deckId, queryClient, toast, setAlgorithmConfirm, setAlgorithmModalOpen]);

  const handleAlgorithmCopy = useCallback(async () => {
    if (!algorithmConfirm || !deckId || !user) return;
    try {
      const newDeck = await deckService.createAlgorithmCopy(user.id, deckId, algorithmConfirm.value, algorithmConfirm.label);
      invalidateDeckRelatedQueries(queryClient);
      toast({ title: 'Cópia criada!', description: `"${(newDeck as any).name}" como sub-baralho.` });
      setAlgorithmConfirm(null); setAlgorithmModalOpen(false);
      navigate(`/decks/${(newDeck as any).id}`);
    } catch { toast({ title: 'Erro ao criar cópia', variant: 'destructive' }); }
  }, [algorithmConfirm, deckId, user, queryClient, toast, navigate, setAlgorithmConfirm, setAlgorithmModalOpen]);

  const handleGenerateExam = useCallback(async () => {
    if (!deckId) return;
    setExamGenerating(true);
    const mcCount = Math.max(0, examTotalQuestions - examWrittenCount);
    const totalCost = examTotalQuestions * 2;
    const notifId = crypto.randomUUID();
    const eTitle = examTitle.trim() || `Prova - ${(deck as any)?.name || 'Sem nome'}`;
    addNotification({ id: notifId, title: eTitle, examId: '', status: 'generating', message: 'Gerando questões com IA...' });
    toast({ title: '🧠 Gerando prova...', description: 'Você será notificado quando estiver pronta.' });
    setExamModalOpen(false); setExamGenerating(false);

    try {
      const deckCards = await cardService.fetchCards(deckId);
      if (!deckCards.length) throw new Error('Baralho sem cards');
      const textContent = deckCards.map(c => {
        const fr = c.front_content.replace(/<[^>]*>/g, '').trim();
        const bk = c.back_content.replace(/<[^>]*>/g, '').trim();
        return `Q: ${fr}\nA: ${bk}`;
      }).join('\n\n');

      const { data: aiData, error: fnError } = await supabase.functions.invoke('generate-deck', {
        body: {
          textContent, cardCount: examTotalQuestions, detailLevel: 'standard',
          cardFormats: [...(mcCount > 0 ? ['multiple_choice'] : []), ...(examWrittenCount > 0 ? ['qa'] : [])],
          customInstructions: `PROVA ACADÊMICA. Gere ${mcCount} questões de múltipla escolha (${examOptionsCount} alternativas cada) e ${examWrittenCount} dissertativas.\nCada questão DEVE ter um ENUNCIADO (caso clínico, situação-problema ou texto-base) na "front", separado da pergunta por "---".\nDissertativas: "front" = enunciado + pergunta, "back" = resposta completa.\nBaseie-se APENAS no material fornecido. Varie a dificuldade.`,
          aiModel: model, energyCost: totalCost,
        },
      });
      if (fnError || aiData?.error) throw new Error(aiData?.error || 'Erro na geração');
      queryClient.invalidateQueries({ queryKey: ['profile'] });

      const generatedCards = aiData.cards as Array<{ front: string; back: string; type: string; options?: string[]; correctIndex?: number }>;
      const questions = generatedCards.map((card, idx) => {
        if (card.type === 'multiple_choice' && card.options) {
          return { question_type: 'multiple_choice' as const, question_text: card.front, options: card.options.slice(0, examOptionsCount), correct_answer: card.options[card.correctIndex ?? 0] || '', correct_indices: [card.correctIndex ?? 0], points: 1.5, sort_order: idx };
        }
        return { question_type: 'written' as const, question_text: card.front, correct_answer: card.back, points: 2.5, sort_order: idx };
      });
      const exam = await createExam.mutateAsync({ deckId, title: eTitle, questions, timeLimitSeconds: examTimeLimit > 0 ? examTimeLimit * 60 : undefined });
      updateNotification(notifId, { status: 'ready', examId: exam.id, message: 'Prova pronta!' });
    } catch (err: any) {
      console.error(err);
      updateNotification(notifId, { status: 'error', message: err.message || 'Erro ao gerar prova' });
    }
  }, [deckId, deck, examTotalQuestions, examWrittenCount, examTitle, examOptionsCount, examTimeLimit, model, addNotification, updateNotification, createExam, queryClient, toast, setExamModalOpen, setExamGenerating]);

  return {
    resetForm, openNew, openEdit, handleSave, handleDelete, handleMoveCard,
    toggleCardSelection, selectAllCards, handleBulkMove, handleBulkDelete,
    uploadOcclusionFile, handleOcclusionAttach, handleOcclusionPaste,
    handleImprove, applyImprovement, handleImportCards,
    handleAlgorithmChange, handleAlgorithmCopy, handleGenerateExam,
  };
}
