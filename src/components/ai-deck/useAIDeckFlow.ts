/**
 * Custom hook that encapsulates ALL state and logic for the AI deck creation flow.
 * Components only handle presentation; this hook owns the business logic.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { usePremium } from '@/hooks/usePremium';
import { useAIModel } from '@/hooks/useAIModel';
import { extractPDFPages, splitTextIntoPages } from '@/lib/pdfUtils';
import { CREDITS_PER_PAGE } from '@/types/ai';
import { usePendingDecks } from '@/stores/usePendingDecks';
import * as aiService from '@/services/aiService';
import * as deckService from '@/services/deckService';
import * as cardService from '@/services/cardService';
import type { Step, GenProgress, LoadProgress, GeneratedCard, DetailLevel, CardFormat, PageItem } from './types';

interface UseAIDeckFlowParams {
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
  existingDeckId?: string | null;
  existingDeckName?: string | null;
}

export function useAIDeckFlow({ onOpenChange, folderId, existingDeckId, existingDeckName }: UseAIDeckFlowParams) {
  const { user } = useAuth();
  const { energy } = useEnergy();
  const { isPremium } = usePremium();
  const { model, setModel, getCost, MODEL_CONFIG, pendingPro, confirmPro, cancelPro } = useAIModel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addPending, updatePending, removePending } = usePendingDecks();

  // Step
  const [step, setStep] = useState<Step>('upload');

  // Upload
  const [deckName, setDeckName] = useState(existingDeckName || '');
  const [inputMode, setInputMode] = useState<'text' | 'file' | null>(null);
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');

  // Pages
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({ current: 0, total: 0 });

  // Config
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('standard');
  const [cardFormats, setCardFormats] = useState<CardFormat[]>(['qa', 'cloze', 'multiple_choice']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [targetCardCount, setTargetCardCount] = useState(0);

  // Generation
  const [genProgress, setGenProgress] = useState<GenProgress>({ current: 0, total: 0, creditsUsed: 0 });

  // Review
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Background generation tracking
  const isBackgroundRef = useRef(false);
  const pendingIdRef = useRef<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPages = pages.filter(p => p.selected);
  const totalCredits = selectedPages.length * getCost(CREDITS_PER_PAGE);
  const busy = isLoading || isSaving;

  const resetState = useCallback(() => {
    setStep('upload'); setDeckName(''); setInputMode(null); setFileName(''); setRawText('');
    setPages([]); setLoadProgress({ current: 0, total: 0 });
    setDetailLevel('standard'); setCardFormats(['qa', 'cloze', 'multiple_choice']); setCustomInstructions(''); setTargetCardCount(0);
    setGenProgress({ current: 0, total: 0, creditsUsed: 0 });
    setCards([]); setEditingIdx(null);
    setIsLoading(false); setIsSaving(false);
    isBackgroundRef.current = false;
    pendingIdRef.current = null;
  }, []);

  const toggleFormat = useCallback((f: CardFormat) => {
    setCardFormats(prev => prev.includes(f) ? (prev.length > 1 ? prev.filter(x => x !== f) : prev) : [...prev, f]);
  }, []);

  // === File handling ===
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 20MB', variant: 'destructive' });
      return;
    }

    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    if (!deckName) setDeckName(name.charAt(0).toUpperCase() + name.slice(1));
    setFileName(file.name);
    setInputMode('file');

    if (file.type === 'application/pdf') {
      setStep('loading-pages');
      try {
        const pdfPages = await extractPDFPages(file, (cur, tot) => setLoadProgress({ current: cur, total: tot }));
        setPages(pdfPages.map(p => ({ ...p, selected: true })));
        setStep('pages');
      } catch (err) {
        console.error('PDF extraction error:', err);
        toast({ title: 'Erro ao processar PDF', description: 'Tente colar o texto diretamente.', variant: 'destructive' });
        setStep('upload'); setInputMode(null); setFileName('');
      }
    } else if (file.type.startsWith('text/')) {
      const text = await file.text();
      const textPages = splitTextIntoPages(text);
      setPages(textPages.map(p => ({ ...p, selected: true })));
      setStep('pages');
    } else {
      setStep('loading-pages');
      try {
        const { extractDocumentText } = await import('@/lib/docUtils');
        const text = await extractDocumentText(file);
        const cleaned = text.trim();
        if (cleaned.length > 50) {
          const textPages = splitTextIntoPages(cleaned);
          setPages(textPages.map(p => ({ ...p, selected: true })));
          setStep('pages');
        } else {
          toast({ title: 'Conteúdo limitado', description: 'Para melhores resultados, copie e cole o texto.', variant: 'destructive' });
          setStep('upload'); setInputMode('text'); setFileName('');
        }
      } catch (err: any) {
        console.error('Document extraction error:', err);
        toast({ title: 'Erro ao processar arquivo', description: err?.message || 'Tente colar o texto diretamente.', variant: 'destructive' });
        setStep('upload'); setInputMode(null); setFileName('');
      }
    }
  }, [deckName, toast]);

  const handleTextContinue = useCallback(() => {
    if (!rawText.trim()) return;
    const textPages = splitTextIntoPages(rawText.trim());
    setPages(textPages.map(p => ({ ...p, selected: true })));
    setStep('pages');
  }, [rawText]);

  const togglePage = useCallback((idx: number) => {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
  }, []);

  const selectAll = useCallback(() => setPages(prev => prev.map(p => ({ ...p, selected: true }))), []);
  const deselectAll = useCallback(() => setPages(prev => prev.map(p => ({ ...p, selected: false }))), []);

  // Warn user before closing tab during generation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (step === 'generating' || isBackgroundRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step]);

  // === Save cards to DB (reusable for both foreground and background) ===
  const saveCardsToDeck = useCallback(async (generatedCards: GeneratedCard[], name: string) => {
    if (!user || generatedCards.length === 0) return;

    let targetDeckId: string;
    if (existingDeckId) {
      targetDeckId = existingDeckId;
    } else {
      // Resolve unique name to avoid duplicates
      const uniqueName = await deckService.resolveUniqueDeckName(user.id, name.trim());
      const deck = await deckService.createDeck(user.id, uniqueName, folderId ?? null, null, isPremium ? 'fsrs' : 'sm2');
      targetDeckId = (deck as any).id;
    }

    const rows: { frontContent: string; backContent: string; cardType: string }[] = [];
    for (const c of generatedCards) {
      if (c.type === 'multiple_choice' && c.options) {
        rows.push({ frontContent: c.front, backContent: JSON.stringify({ options: c.options, correctIndex: c.correctIndex ?? 0 }), cardType: 'multiple_choice' });
      } else if (c.type === 'cloze') {
        // Expand cloze card into one DB row per unique cloze number
        const plain = c.front.replace(/<[^>]*>/g, '');
        const matches = [...plain.matchAll(/\{\{c(\d+)::/g)];
        const uniqueNums = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
        if (uniqueNums.length === 0) {
          rows.push({ frontContent: c.front, backContent: JSON.stringify({ clozeTarget: 1, extra: c.back || '' }), cardType: 'cloze' });
        } else {
          for (const n of uniqueNums) {
            rows.push({ frontContent: c.front, backContent: JSON.stringify({ clozeTarget: n, extra: c.back || '' }), cardType: 'cloze' });
          }
        }
      } else {
        rows.push({ frontContent: c.front, backContent: c.back, cardType: c.type || 'basic' });
      }
    }

    try {
      await cardService.createCards(targetDeckId, rows);
    } catch (cErr: any) {
      if (!existingDeckId) await deckService.deleteDeck(targetDeckId);
      throw cErr;
    }

    queryClient.invalidateQueries({ queryKey: ['decks'] });
    queryClient.invalidateQueries({ queryKey: ['cards', targetDeckId] });
    return targetDeckId;
  }, [user, existingDeckId, folderId, queryClient]);

  // === Generation (character-based batching) ===
  const handleGenerate = useCallback(async () => {
    const selected = pages.filter(p => p.selected && p.textContent.trim().length > 0);
    if (selected.length === 0) {
      toast({ title: 'Nenhuma página selecionada', description: 'As páginas selecionadas não possuem conteúdo extraível.', variant: 'destructive' });
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    pendingIdRef.current = pendingId;

    setStep('generating'); setIsLoading(true);

    // Character-based batching instead of fixed page count
    const MAX_CHARS = 6000;
    const textBatches: { texts: string[]; pageCount: number }[] = [{ texts: [], pageCount: 0 }];
    let currentSize = 0;

    for (const page of selected) {
      const text = page.textContent.trim();
      if (currentSize + text.length > MAX_CHARS && textBatches[textBatches.length - 1].texts.length > 0) {
        textBatches.push({ texts: [], pageCount: 0 });
        currentSize = 0;
      }
      textBatches[textBatches.length - 1].texts.push(text);
      textBatches[textBatches.length - 1].pageCount++;
      currentSize += text.length;
    }

    // Total requests = batches * formats (one API call per format per batch)
    const totalBatches = textBatches.length;
    const formats = cardFormats.length > 0 ? cardFormats : ['qa' as CardFormat];
    const totalRequests = totalBatches * formats.length;
    setGenProgress({ current: 0, total: totalRequests, creditsUsed: 0 });
    const allCards: GeneratedCard[] = [];

    // Accumulate token usage across all requests for a single aggregated log
    const aggregatedUsage: aiService.TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let totalEnergyCost = 0;
    let usedModel = '';

    // Density factor for auto card count (chars per card)
    const densityFactor = detailLevel === 'comprehensive' ? 150 : detailLevel === 'essential' ? 500 : 300;

    let requestIdx = 0;

    for (let b = 0; b < totalBatches; b++) {
      const batch = textBatches[b];
      const batchText = batch.texts.join('\n\n');
      const batchCost = batch.pageCount * getCost(CREDITS_PER_PAGE);
      totalEnergyCost += batchCost;
      const batchCardCount = targetCardCount > 0
        ? Math.max(2, Math.ceil(targetCardCount / totalBatches))
        : Math.max(3, Math.ceil(batchText.length / densityFactor));

      // Loop per format: each format gets its own dedicated API call
      for (let f = 0; f < formats.length; f++) {
        requestIdx++;
        const format = formats[f];
        const formatCardCount = Math.max(2, Math.ceil(batchCardCount / formats.length));
        // Only charge energy on the first format call of each batch
        const formatEnergyCost = f === 0 ? batchCost : 0;

        const progress = { current: requestIdx, total: totalRequests, creditsUsed: totalEnergyCost };
        setGenProgress(progress);

        // Update pending store if running in background
        if (isBackgroundRef.current && pendingIdRef.current) {
          updatePending(pendingIdRef.current, { progress: { current: requestIdx, total: totalRequests } });
        }

        try {
          const result = await aiService.generateDeckCards({
            textContent: batchText,
            cardCount: formatCardCount,
            detailLevel,
            cardFormats: [format], // Single format per call
            customInstructions: customInstructions.trim() || undefined,
            aiModel: model,
            energyCost: formatEnergyCost,
            skipLog: true,
          });
          allCards.push(...result.cards);

          // Accumulate usage
          if (result.usage) {
            aggregatedUsage.prompt_tokens += result.usage.prompt_tokens;
            aggregatedUsage.completion_tokens += result.usage.completion_tokens;
            aggregatedUsage.total_tokens += result.usage.total_tokens;
          }

          // Resolve actual model name for logging
          const modelConfig = MODEL_CONFIG[model as keyof typeof MODEL_CONFIG];
          if (modelConfig) usedModel = modelConfig.backendModel as string;
        } catch (err) { console.error(`Batch ${b + 1}, format ${format} failed:`, err); }
      }
    }

    // Log aggregated token usage once for the entire deck generation
    try {
      await aiService.logAggregatedTokenUsage(usedModel, aggregatedUsage, totalEnergyCost);
    } catch (e) { console.error('Failed to log aggregated usage:', e); }

    queryClient.invalidateQueries({ queryKey: ['energy'] });

    // If running in background, auto-save
    if (isBackgroundRef.current && pendingIdRef.current) {
      if (allCards.length > 0) {
        updatePending(pendingIdRef.current, { status: 'saving' });
        try {
          await saveCardsToDeck(allCards, deckName);
          toast({ title: '🧠 Baralho criado!', description: `${allCards.length} cartões salvos em "${deckName}"` });
        } catch (err: any) {
          toast({ title: 'Erro ao salvar baralho', description: err?.message, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Nenhum cartão gerado', description: 'O conteúdo pode ser insuficiente.', variant: 'destructive' });
      }
      removePending(pendingIdRef.current);
      resetState();
      return;
    }

    // Foreground flow
    if (allCards.length === 0) {
      toast({ title: 'Nenhum cartão gerado', description: 'O conteúdo pode ser insuficiente.', variant: 'destructive' });
      setStep('config');
    } else {
      setCards(allCards); setStep('review');
    }
    setIsLoading(false);
  }, [pages, targetCardCount, detailLevel, cardFormats, customInstructions, model, getCost, toast, queryClient, deckName, saveCardsToDeck, updatePending, removePending, resetState, MODEL_CONFIG]);

  // === Dismiss to background ===
  const handleDismissToBackground = useCallback(() => {
    if (!pendingIdRef.current) return;

    isBackgroundRef.current = true;
    addPending({
      id: pendingIdRef.current,
      name: deckName || 'Baralho IA',
      folderId: folderId ?? null,
      status: 'generating',
      progress: { current: genProgress.current, total: genProgress.total },
    });

    onOpenChange(false);
    toast({ title: '⏳ Gerando em segundo plano', description: 'O baralho aparecerá no dashboard quando estiver pronto.' });
  }, [deckName, folderId, genProgress, addPending, onOpenChange, toast]);

  // === Save (foreground) ===
  const handleSave = useCallback(async () => {
    if (!user || cards.length === 0) return;
    setIsSaving(true);
    try {
      const targetDeckId = await saveCardsToDeck(cards, deckName);
      toast({ title: existingDeckId ? '🧠 Cartões adicionados!' : '🧠 Baralho criado!', description: `${cards.length} cartões salvos` });
      resetState(); onOpenChange(false);
      if (!existingDeckId && targetDeckId) navigate(`/decks/${targetDeckId}`);
    } catch (err: any) { toast({ title: 'Erro ao salvar', description: err?.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  }, [user, cards, existingDeckId, deckName, toast, resetState, onOpenChange, navigate, saveCardsToDeck]);

  // === Edit helpers ===
  const startEdit = useCallback((i: number) => { setEditingIdx(i); setEditFront(cards[i].front); setEditBack(cards[i].back); }, [cards]);
  const saveEdit = useCallback(() => { if (editingIdx === null) return; setCards(p => p.map((c, i) => i === editingIdx ? { ...c, front: editFront, back: editBack } : c)); setEditingIdx(null); }, [editingIdx, editFront, editBack]);
  const deleteCard = useCallback((i: number) => { setCards(p => p.filter((_, j) => j !== i)); if (editingIdx === i) setEditingIdx(null); }, [editingIdx]);
  const toggleType = useCallback((i: number) => {
    setCards(p => p.map((c, j) => {
      if (j !== i) return c;
      const types: Array<'basic' | 'cloze' | 'multiple_choice'> = ['basic', 'cloze', 'multiple_choice'];
      const currentIdx = types.indexOf(c.type);
      return { ...c, type: types[(currentIdx + 1) % types.length] };
    }));
  }, []);

  return {
    // State
    step, setStep, deckName, setDeckName, inputMode, setInputMode, fileName, rawText, setRawText,
    pages, loadProgress, detailLevel, setDetailLevel, cardFormats, toggleFormat,
    customInstructions, setCustomInstructions, targetCardCount, setTargetCardCount,
    genProgress, cards, editingIdx, editFront, setEditFront, editBack, setEditBack,
    isSaving, isLoading, busy, fileInputRef,
    selectedPages, totalCredits, energy, model, setModel,
    pendingPro, confirmPro, cancelPro,
    // Actions
    resetState, handleFileSelect, handleTextContinue, togglePage, selectAll, deselectAll,
    handleGenerate, handleSave, handleDismissToBackground,
    startEdit, saveEdit, deleteCard, toggleType,
    getCost,
  };
}
