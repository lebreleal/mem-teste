/**
 * Custom hook that encapsulates ALL state and logic for the AI deck creation flow.
 * Components only handle presentation; this hook owns the business logic.
 */

import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { extractPDFPages, splitTextIntoPages } from '@/lib/pdfUtils';
import { CREDITS_PER_PAGE } from '@/types/ai';
import * as aiService from '@/services/aiService';
import * as deckService from '@/services/deckService';
import * as cardService from '@/services/cardService';
import type { Step, GenProgress, LoadProgress, GeneratedCard, DetailLevel, CardFormat, CoverageAnalysis, PageItem } from './types';

interface UseAIDeckFlowParams {
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
  existingDeckId?: string | null;
  existingDeckName?: string | null;
}

export function useAIDeckFlow({ onOpenChange, folderId, existingDeckId, existingDeckName }: UseAIDeckFlowParams) {
  const { user } = useAuth();
  const { energy } = useEnergy();
  const { model, setModel, getCost } = useAIModel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
  const [cardFormats, setCardFormats] = useState<CardFormat[]>(['definition', 'cloze', 'qa', 'multiple_choice']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [targetCardCount, setTargetCardCount] = useState(0); // 0 = auto (AI decides)

  // Generation
  const [genProgress, setGenProgress] = useState<GenProgress>({ current: 0, total: 0, creditsUsed: 0 });

  // Review
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  // Analysis
  const [analysis, setAnalysis] = useState<CoverageAnalysis | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPages = pages.filter(p => p.selected);
  const totalCredits = selectedPages.length * getCost(CREDITS_PER_PAGE);
  const busy = isLoading || isSaving;

  const resetState = useCallback(() => {
    setStep('upload'); setDeckName(''); setInputMode(null); setFileName(''); setRawText('');
    setPages([]); setLoadProgress({ current: 0, total: 0 });
    setDetailLevel('standard'); setCardFormats(['definition', 'cloze', 'qa', 'multiple_choice']); setCustomInstructions(''); setTargetCardCount(0);
    setGenProgress({ current: 0, total: 0, creditsUsed: 0 });
    setCards([]); setEditingIdx(null); setAnalysis(null);
    setIsLoading(false); setIsSaving(false);
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

  // === Generation (batch of 4 pages) ===
  const handleGenerate = useCallback(async () => {
    const selected = pages.filter(p => p.selected && (p.textContent.trim().length > 0 || p.imageBase64));
    if (selected.length === 0) {
      toast({ title: 'Nenhuma página selecionada', description: 'As páginas selecionadas não possuem conteúdo extraível.', variant: 'destructive' });
      return;
    }

    setStep('generating'); setIsLoading(true);
    const BATCH_SIZE = 4;
    const totalBatches = Math.ceil(selected.length / BATCH_SIZE);
    setGenProgress({ current: 0, total: totalBatches, creditsUsed: 0 });
    const allCards: GeneratedCard[] = [];

    for (let b = 0; b < totalBatches; b++) {
      const batch = selected.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const batchText = batch.map(p => p.textContent).join('\n\n');
      const batchImages = batch.map(p => p.imageBase64).filter(Boolean) as string[];
      const batchCost = batch.length * getCost(CREDITS_PER_PAGE);
      const batchCardCount = targetCardCount > 0 ? Math.max(2, Math.ceil(targetCardCount / totalBatches)) : 0;

      setGenProgress({ current: b + 1, total: totalBatches, creditsUsed: (b + 1) * batch.length * getCost(CREDITS_PER_PAGE) });
      try {
        const newCards = await aiService.generateDeckCards({
          textContent: batchText,
          cardCount: batchCardCount,
          detailLevel, cardFormats,
          customInstructions: customInstructions.trim() || undefined,
          aiModel: model, energyCost: batchCost,
          pageImages: batchImages.length > 0 ? batchImages : undefined,
        });
        allCards.push(...newCards);
      } catch (err) { console.error(`Batch ${b + 1} failed:`, err); }
    }

    if (allCards.length === 0) {
      toast({ title: 'Nenhum cartão gerado', description: 'O conteúdo pode ser insuficiente.', variant: 'destructive' });
      setStep('config');
    } else {
      setCards(allCards); setStep('review');
    }
    queryClient.invalidateQueries({ queryKey: ['energy'] });
    setIsLoading(false);
  }, [pages, targetCardCount, detailLevel, cardFormats, customInstructions, model, getCost, toast, queryClient]);

  // === Analysis ===
  const handleAnalyze = useCallback(async () => {
    const allText = pages.filter(p => p.selected).map(p => p.textContent).join('\n\n');
    setStep('analyzing'); setIsLoading(true);
    try {
      const result = await aiService.analyzeCoverage({ textContent: allText, existingCards: cards, aiModel: model });
      setAnalysis(result); setStep('analysis');
    } catch { toast({ title: 'Erro na análise', variant: 'destructive' }); setStep('review'); }
    finally { setIsLoading(false); }
  }, [pages, cards, model, toast]);

  const handleFillGaps = useCallback(async () => {
    const allText = pages.filter(p => p.selected).map(p => p.textContent).join('\n\n');
    setStep('generating'); setIsLoading(true);
    const gapCount = Math.min(Math.max(Math.ceil((100 - (analysis?.coveragePercent || 0)) / 10), 3), 15);
    setGenProgress({ current: 0, total: 1, creditsUsed: getCost(CREDITS_PER_PAGE) });
    try {
      const newCards = await aiService.fillGaps({
        textContent: allText, cardCount: gapCount,
        detailLevel, cardFormats, existingCards: cards,
        aiModel: model, energyCost: getCost(CREDITS_PER_PAGE),
      });
      if (newCards.length > 0) { setCards(prev => [...prev, ...newCards]); toast({ title: `+${newCards.length} cartões adicionados!` }); }
      setAnalysis(null); setStep('review');
    } catch { toast({ title: 'Erro ao gerar', variant: 'destructive' }); setStep('analysis'); }
    finally { queryClient.invalidateQueries({ queryKey: ['energy'] }); setIsLoading(false); }
  }, [pages, analysis, detailLevel, cardFormats, cards, model, getCost, toast, queryClient]);

  // === Save ===
  const handleSave = useCallback(async () => {
    if (!user || cards.length === 0) return;
    setIsSaving(true);
    try {
      let targetDeckId: string;

      if (existingDeckId) {
        targetDeckId = existingDeckId;
      } else {
        const deck = await deckService.createDeck(user.id, deckName.trim(), folderId ?? null);
        targetDeckId = (deck as any).id;
      }

      const rows = cards.map(c => {
        let backContent = c.back;
        if (c.type === 'multiple_choice' && c.options) {
          backContent = JSON.stringify({ options: c.options, correctIndex: c.correctIndex ?? 0 });
        }
        return { frontContent: c.front, backContent, cardType: c.type || 'basic' };
      });

      try {
        await cardService.createCards(targetDeckId, rows);
      } catch (cErr: any) {
        if (!existingDeckId) await deckService.deleteDeck(targetDeckId);
        throw cErr;
      }

      toast({ title: existingDeckId ? '🧠 Cartões adicionados!' : '🧠 Baralho criado!', description: `${cards.length} cartões salvos` });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['cards', targetDeckId] });
      resetState(); onOpenChange(false);
      if (!existingDeckId) navigate(`/decks/${targetDeckId}`);
    } catch (err: any) { toast({ title: 'Erro ao salvar', description: err?.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  }, [user, cards, existingDeckId, deckName, folderId, toast, queryClient, resetState, onOpenChange, navigate]);

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
    analysis, isSaving, isLoading, busy, fileInputRef,
    selectedPages, totalCredits, energy, model, setModel,
    // Actions
    resetState, handleFileSelect, handleTextContinue, togglePage, selectAll, deselectAll,
    handleGenerate, handleAnalyze, handleFillGaps, handleSave,
    startEdit, saveEdit, deleteCard, toggleType,
    getCost,
  };
}
