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
import * as tagService from '@/services/tagService';
import { supabase } from '@/integrations/supabase/client';
import type { Tag } from '@/types/tag';
import type { Step, GenProgress, LoadProgress, GeneratedCard, DetailLevel, CardFormat, PageItem } from './types';

interface UseAIDeckFlowParams {
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
  existingDeckId?: string | null;
  existingDeckName?: string | null;
  /** Pre-loaded cards from a pending background deck (opens review directly) */
  pendingReviewData?: {
    pendingId: string;
    cards: GeneratedCard[];
    deckName: string;
    folderId: string | null;
    textSample?: string;
  } | null;
}

export function useAIDeckFlow({ onOpenChange, folderId, existingDeckId, existingDeckName, pendingReviewData }: UseAIDeckFlowParams) {
  const { user } = useAuth();
  const { energy } = useEnergy();
  const { isPremium } = usePremium();
  const { model, setModel, getCost, MODEL_CONFIG, pendingPro, confirmPro, cancelPro } = useAIModel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addPending, updatePending, removePending } = usePendingDecks();

  const [step, setStep] = useState<Step>(pendingReviewData ? 'review' : 'upload');

  // Text sample for AI tag suggestions
  const textSampleRef = useRef<string>(pendingReviewData?.textSample || '');

  // Upload
  const [deckName, setDeckName] = useState(pendingReviewData?.deckName || existingDeckName || '');
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
  const [genProgress, setGenProgress] = useState<GenProgress>({ current: 0, total: 0, creditsUsed: 0, startedAt: 0, lastBatchMs: 0, avgBatchMs: 0 });

  // Review
  const [cards, setCards] = useState<GeneratedCard[]>(pendingReviewData?.cards || []);
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
  const totalCredits = selectedPages.length * getCost(CREDITS_PER_PAGE, isPremium);
  const busy = isLoading || isSaving;

  const resetState = useCallback(() => {
    setStep('upload'); setDeckName(''); setInputMode(null); setFileName(''); setRawText('');
    setPages([]); setLoadProgress({ current: 0, total: 0 });
    setDetailLevel('standard'); setCardFormats(['qa', 'cloze', 'multiple_choice']); setCustomInstructions(''); setTargetCardCount(0);
    setGenProgress({ current: 0, total: 0, creditsUsed: 0, startedAt: 0, lastBatchMs: 0, avgBatchMs: 0 });
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
      const deck = await deckService.createDeck(user.id, uniqueName, folderId ?? null, null, 'fsrs');
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

  // === Deduplication helper (Bloco 4) ===
  const deduplicateCards = useCallback((cards: GeneratedCard[]): GeneratedCard[] => {
    const normalize = (text: string) =>
      text.replace(/<[^>]*>/g, '').replace(/\{\{c\d+::/g, '').replace(/\}\}/g, '').toLowerCase().replace(/[^\w\sà-ú]/g, '').trim();

    const getWords = (text: string) => {
      const words = normalize(text).split(/\s+/).filter(w => w.length > 2);
      return new Set(words);
    };

    const similarity = (a: Set<string>, b: Set<string>): number => {
      if (a.size === 0 || b.size === 0) return 0;
      let intersection = 0;
      for (const w of a) { if (b.has(w)) intersection++; }
      return intersection / Math.max(a.size, b.size);
    };

    const seen: { words: Set<string>; idx: number }[] = [];
    const keep: boolean[] = new Array(cards.length).fill(true);

    for (let i = 0; i < cards.length; i++) {
      const words = getWords(cards[i].front);
      let isDup = false;
      for (const s of seen) {
        if (similarity(words, s.words) > 0.8) {
          // Keep the one with longer back (more complete answer)
          const existingLen = normalize(cards[s.idx].back).length;
          const currentLen = normalize(cards[i].back).length;
          if (currentLen > existingLen) {
            keep[s.idx] = false;
            s.idx = i;
            s.words = words;
          } else {
            isDup = true;
          }
          break;
        }
      }
      if (!isDup) {
        seen.push({ words, idx: i });
      } else {
        keep[i] = false;
      }
    }

    const result = cards.filter((_, i) => keep[i]);
    const removed = cards.length - result.length;
    if (removed > 0) console.log(`Deduplication: removed ${removed} duplicate cards`);
    return result;
  }, []);

  // === Generation (semantic batching with overlap — Blocos 2, 4, 5) ===
  const handleGenerate = useCallback(async () => {
    const selected = pages.filter(p => p.selected && p.textContent.trim().length > 0);
    if (selected.length === 0) {
      toast({ title: 'Nenhuma página selecionada', description: 'As páginas selecionadas não possuem conteúdo extraível.', variant: 'destructive' });
      return;
    }

    const pendingId = `pending-${Date.now()}`;
    pendingIdRef.current = pendingId;

    setStep('generating'); setIsLoading(true);

    // Store text sample for AI tag suggestions
    const sampleText = selected.slice(0, 3).map(p => p.textContent).join('\n').substring(0, 2000);
    textSampleRef.current = sampleText;
    // Page-based batching: group selected pages into batches of 10
    const PAGES_PER_BATCH = 10;
    const CONCURRENT_BATCHES = 3;

    const textBatches: { text: string; pageCount: number }[] = [];
    for (let i = 0; i < selected.length; i += PAGES_PER_BATCH) {
      const batchPages = selected.slice(i, i + PAGES_PER_BATCH);
      const text = batchPages.map(p => `--- PÁGINA ${p.pageNumber} ---\n${p.textContent}`).join('\n\n');
      textBatches.push({ text, pageCount: batchPages.length });
    }

    const totalBatches = textBatches.length;
    const genStartedAt = Date.now();
    let completedGroups = 0;
    let totalGroupMs = 0;
    setGenProgress({ current: 0, total: totalBatches, creditsUsed: 0, startedAt: genStartedAt, lastBatchMs: 0, avgBatchMs: 0 });
    const allCards: GeneratedCard[] = [];

    const aggregatedUsage: aiService.TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let totalEnergyCost = 0;
    let usedModel = '';

    // Bloco 5: Refined density factor (chars per card)
    const densityFactor = detailLevel === 'comprehensive' ? 120 : detailLevel === 'essential' ? 600 : 250;

    for (let i = 0; i < totalBatches; i += CONCURRENT_BATCHES) {
      const group = textBatches.slice(i, i + CONCURRENT_BATCHES);
      const groupStart = Date.now();

      const groupPromises = group.map((batch, gi) => {
        const batchIndex = i + gi;
        const batchText = batch.text;
        const batchCost = batch.pageCount * getCost(CREDITS_PER_PAGE, isPremium);
        totalEnergyCost += batchCost;

        const batchCardCount = targetCardCount > 0
          ? Math.max(3, Math.ceil(targetCardCount / totalBatches))
          : Math.max(3, Math.ceil(batchText.length / densityFactor));

        const orderPrefix = totalBatches > 1
          ? `[CONTEXTO: Este é o trecho ${batchIndex + 1} de ${totalBatches} do material, em ORDEM SEQUENCIAL. Gere cartões seguindo a ordem do texto.]\n\n`
          : '';

        return aiService.generateDeckCards({
          textContent: orderPrefix + batchText,
          cardCount: batchCardCount,
          detailLevel,
          cardFormats,
          customInstructions: customInstructions.trim() || undefined,
          aiModel: model,
          energyCost: batchCost,
          skipLog: true,
        });
      });

      const results = await Promise.allSettled(groupPromises);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allCards.push(...result.value.cards);
          if (result.value.usage) {
            aggregatedUsage.prompt_tokens += result.value.usage.prompt_tokens;
            aggregatedUsage.completion_tokens += result.value.usage.completion_tokens;
            aggregatedUsage.total_tokens += result.value.usage.total_tokens;
          }
          const modelConfig = MODEL_CONFIG[model as keyof typeof MODEL_CONFIG];
          if (modelConfig) usedModel = modelConfig.backendModel as string;
        } else {
          console.error(`Batch call failed:`, result.reason);
        }
      }

      const groupDuration = Date.now() - groupStart;
      completedGroups++;
      totalGroupMs += groupDuration;
      const avgMs = Math.round(totalGroupMs / completedGroups);

      const completedBatches = Math.min(i + CONCURRENT_BATCHES, totalBatches);
      const progress: GenProgress = { current: completedBatches, total: totalBatches, creditsUsed: totalEnergyCost, startedAt: genStartedAt, lastBatchMs: groupDuration, avgBatchMs: avgMs };
      setGenProgress(progress);
      if (isBackgroundRef.current && pendingIdRef.current) {
        updatePending(pendingIdRef.current, { progress: { current: completedBatches, total: totalBatches } });
      }
    }

    try {
      await aiService.logAggregatedTokenUsage(usedModel, aggregatedUsage, totalEnergyCost);
    } catch (e) { console.error('Failed to log aggregated usage:', e); }

    queryClient.invalidateQueries({ queryKey: ['energy'] });

    // Bloco 4: Deduplicate cards across all batches
    const dedupedCards = deduplicateCards(allCards);

    if (isBackgroundRef.current && pendingIdRef.current) {
      if (dedupedCards.length > 0) {
        // Store cards for review instead of auto-saving
        updatePending(pendingIdRef.current, {
          status: 'review_ready',
          cards: dedupedCards,
          textSample: textSampleRef.current,
        });
        toast({ title: '✅ Cartões prontos para revisão', description: `${dedupedCards.length} cartões aguardando revisão.` });
      } else {
        toast({ title: 'Nenhum cartão gerado', description: 'O conteúdo pode ser insuficiente.', variant: 'destructive' });
        removePending(pendingIdRef.current);
      }
      resetState();
      return;
    }

    if (dedupedCards.length === 0) {
      toast({ title: 'Nenhum cartão gerado', description: 'O conteúdo pode ser insuficiente.', variant: 'destructive' });
      setStep('config');
    } else {
      setCards(dedupedCards); setStep('review');
    }
    setIsLoading(false);
  }, [pages, targetCardCount, detailLevel, cardFormats, customInstructions, model, getCost, toast, queryClient, deckName, saveCardsToDeck, updatePending, removePending, resetState, MODEL_CONFIG, deduplicateCards, isPremium]);

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

  // === Save (foreground) — now accepts tags ===
  const handleSave = useCallback(async (selectedTags?: (Tag | string)[]) => {
    if (!user || cards.length === 0) return;
    setIsSaving(true);
    try {
      const targetDeckId = await saveCardsToDeck(cards, deckName);
      
      // Apply deck-level tags
      if (selectedTags && selectedTags.length > 0 && targetDeckId) {
        for (const tag of selectedTags) {
          try {
            if (typeof tag === 'string') {
              const created = await tagService.createTag(tag, user.id);
              await tagService.addDeckTag(targetDeckId, created.id, user.id);
            } else {
              await tagService.addDeckTag(targetDeckId, tag.id, user.id);
            }
          } catch (e) { console.error('Failed to add deck tag:', e); }
        }
        queryClient.invalidateQueries({ queryKey: ['tags'] });
      }

      // Trigger auto-tag-cards in background (fire and forget)
      if (targetDeckId) {
        supabase.functions.invoke('auto-tag-cards', { body: { deckId: targetDeckId } })
          .then(() => { queryClient.invalidateQueries({ queryKey: ['tags'] }); })
          .catch(e => console.error('Auto-tag failed:', e));
      }

      // If opened from pending review, remove the pending item
      if (pendingReviewData?.pendingId) {
        removePending(pendingReviewData.pendingId);
      }

      toast({ title: existingDeckId ? '🧠 Cartões adicionados!' : '🧠 Baralho criado!', description: `${cards.length} cartões salvos` });
      resetState(); onOpenChange(false);
      if (!existingDeckId && targetDeckId) navigate(`/decks/${targetDeckId}`);
    } catch (err: any) { toast({ title: 'Erro ao salvar', description: err?.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  }, [user, cards, existingDeckId, deckName, toast, resetState, onOpenChange, navigate, saveCardsToDeck, queryClient, pendingReviewData, removePending]);

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
    selectedPages, totalCredits, energy, model, setModel, isPremium,
    pendingPro, confirmPro, cancelPro,
    textSample: textSampleRef.current,
    // Actions
    resetState, handleFileSelect, handleTextContinue, togglePage, selectAll, deselectAll,
    handleGenerate, handleSave, handleDismissToBackground,
    startEdit, saveEdit, deleteCard, toggleType,
    getCost,
  };
}
