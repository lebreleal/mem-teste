/**
 * DeckDetailContext – centralizes all deck-detail state so sub-components
 * can consume via useDeckDetail() instead of receiving long prop lists.
 */

import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { CardMeta, DescendantCardCounts } from '@/services/cardService';
import { supabase } from '@/integrations/supabase/client';
import { useParams, useNavigate } from 'react-router-dom';
import { useCards } from '@/hooks/useCards';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useExams } from '@/hooks/useExams';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useExamNotifications } from '@/hooks/useExamNotifications';
import * as cardService from '@/services/cardService';
import * as deckService from '@/services/deckService';
import { invalidateDeckRelatedQueries } from '@/lib/queryKeys';
import type { CardRow } from '@/types/deck';
import { findRootAncestorId } from '@/lib/studyUtils';

// ─── Context value shape ────────────────────────────────
interface DeckDetailContextValue {
  // Core data
  deckId: string;
  deck: any;
  deckLoading: boolean;
  allCards: CardRow[];
  allCardsLoading: boolean;
  filteredCards: CardRow[];
  cardCounts: DescendantCardCounts | undefined;
  loadMoreCards: () => void;
  hasMoreCards: boolean;
  stats: { new_count: number; learning_count: number; review_count: number; reviewed_today: number } | undefined;
  decks: ReturnType<typeof useDecks>['decks'];

  // Computed values
  dailyNewLimit: number;
  dailyReviewLimit: number;
  isPlanControlled: boolean;
  newCountToday: number;
  learningCount: number;
  masteredToday: number;
  isQuickReview: boolean;
  totalDue: number;
  studyPending: number;
  totalCards: number;
  actualNewCount: number;
  totalReviewStateCards: number;
  newPct: number;
  learningPct: number;
  masteredPct: number;

  // Search & filter
  search: string;
  setSearch: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  stateFilter: string;
  setStateFilter: (v: string) => void;

  // Selection
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedCards: Set<string>;
  setSelectedCards: (v: Set<string>) => void;
  toggleCardSelection: (id: string) => void;
  selectAllCards: () => void;

  // Card CRUD
  cards: ReturnType<typeof useCards>['cards'];
  createCard: ReturnType<typeof useCards>['createCard'];
  updateCard: ReturnType<typeof useCards>['updateCard'];
  deleteCard: ReturnType<typeof useCards>['deleteCard'];

  // Card editor state
  editorOpen: boolean;
  setEditorOpen: (v: boolean) => void;
  editingId: string | null;
  setEditingId: (v: string | null) => void;
  front: string;
  setFront: (v: string) => void;
  back: string;
  setBack: (v: string) => void;
  cardType: string | null;
  setCardType: (v: string | null) => void;

  // Delete / move
  deleteId: string | null;
  setDeleteId: (v: string | null) => void;
  moveCardId: string | null;
  setMoveCardId: (v: string | null) => void;
  moveTargetDeck: string;
  setMoveTargetDeck: (v: string) => void;
  bulkMoveOpen: boolean;
  setBulkMoveOpen: (v: boolean) => void;

  // Algorithm
  algorithmModalOpen: boolean;
  setAlgorithmModalOpen: (v: boolean) => void;
  algorithmConfirm: { value: string; label: string } | null;
  setAlgorithmConfirm: (v: { value: string; label: string } | null) => void;

  // Exam
  examModalOpen: boolean;
  setExamModalOpen: (v: boolean) => void;
  examTitle: string;
  setExamTitle: (v: string) => void;
  examTotalQuestions: number;
  setExamTotalQuestions: (v: number) => void;
  examWrittenCount: number;
  setExamWrittenCount: (v: number) => void;
  examOptionsCount: 4 | 5;
  setExamOptionsCount: (v: 4 | 5) => void;
  examTimeLimit: number;
  setExamTimeLimit: (v: number) => void;
  examGenerating: boolean;
  setExamGenerating: (v: boolean) => void;

  // AI
  aiAddCardsOpen: boolean;
  setAiAddCardsOpen: (v: boolean) => void;
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
  isImproving: boolean;
  setIsImproving: (v: boolean) => void;
  improvePreview: { front: string; back: string } | null;
  setImprovePreview: (v: { front: string; back: string } | null) => void;
  improveModalOpen: boolean;
  setImproveModalOpen: (v: boolean) => void;

  // Occlusion
  occlusionImageUrl: string;
  setOcclusionImageUrl: (v: string) => void;
  occlusionRects: any[];
  setOcclusionRects: (v: any[]) => void;
  occlusionCanvasSize: { w: number; h: number } | null;
  setOcclusionCanvasSize: (v: { w: number; h: number } | null) => void;
  occlusionModalOpen: boolean;
  setOcclusionModalOpen: (v: boolean) => void;

  // Multiple choice
  mcOptions: string[];
  setMcOptions: (v: string[]) => void;
  mcCorrectIndex: number;
  setMcCorrectIndex: (v: number) => void;

  // Hooks
  energy: number;
  spendEnergy: ReturnType<typeof useEnergy>['spendEnergy'];
  model: string;
  setModel: (v: string) => void;
  getCost: ReturnType<typeof useAIModel>['getCost'];
  createExam: ReturnType<typeof useExams>['createExam'];
  addNotification: ReturnType<typeof useExamNotifications>['addNotification'];
  updateNotification: ReturnType<typeof useExamNotifications>['updateNotification'];

  // Handlers
  resetForm: () => void;
  openNew: () => void;
  openEdit: (card: CardRow) => void;
  handleSave: (addAnother: boolean) => void;
  handleDelete: () => void;
  handleMoveCard: () => Promise<void>;
  handleBulkMove: () => Promise<void>;
  handleBulkDelete: () => Promise<void>;
  handleImprove: () => Promise<void>;
  applyImprovement: () => void;
  uploadOcclusionFile: (file: File) => Promise<void>;
  handleOcclusionAttach: () => Promise<void>;
  handleOcclusionPaste: () => Promise<void>;
  handleImportCards: (name: string, importedCards: { frontContent: string; backContent: string; cardType?: string }[]) => Promise<void>;
  handleAlgorithmChange: (forceReset?: boolean) => Promise<void>;
  handleAlgorithmCopy: () => Promise<void>;
  handleGenerateExam: () => Promise<void>;
  getStateInfo: (card: CardRow) => { label: string; color: string };
  isFrozenCard: (card: CardRow) => boolean;
  unfreezeCard: (cardId: string) => Promise<void>;
  stripHtml: (html: string) => string;

  // Navigation & utils
  navigate: ReturnType<typeof useNavigate>;
  toast: ReturnType<typeof useToast>['toast'];
  queryClient: ReturnType<typeof useQueryClient>;
  user: any;
  otherDecks: any[];
  isSaving: boolean;
  canImprove: boolean;
}

const DeckDetailContext = createContext<DeckDetailContextValue | null>(null);

export const useDeckDetail = () => {
  const ctx = useContext(DeckDetailContext);
  if (!ctx) throw new Error('useDeckDetail must be used within DeckDetailProvider');
  return ctx;
};

export const DeckDetailProvider = ({ children }: { children: ReactNode }) => {
  const { deckId: rawDeckId } = useParams<{ deckId: string }>();
  const deckId = rawDeckId ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { cards, isLoading: cardsLoading, createCard, updateCard, deleteCard } = useCards(deckId, { enableQuery: false });
  const { decks } = useDecks();
  const { toast } = useToast();
  const { createExam } = useExams();
  const { energy, spendEnergy } = useEnergy();
  const { model, setModel, getCost } = useAIModel();
  const { addNotification, updateNotification } = useExamNotifications();

  // ─── State ─────────────────────────────
  const [examTitle, setExamTitle] = useState('');
  const [examTotalQuestions, setExamTotalQuestions] = useState(10);
  const [examWrittenCount, setExamWrittenCount] = useState(3);
  const [examOptionsCount, setExamOptionsCount] = useState<4 | 5>(4);
  const [examTimeLimit, setExamTimeLimit] = useState(0);
  const [examGenerating, setExamGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [cardType, setCardType] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [moveTargetDeck, setMoveTargetDeck] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [algorithmModalOpen, setAlgorithmModalOpen] = useState(false);
  const [algorithmConfirm, setAlgorithmConfirm] = useState<{ value: string; label: string } | null>(null);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [aiAddCardsOpen, setAiAddCardsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [improvePreview, setImprovePreview] = useState<{ front: string; back: string } | null>(null);
  const [improveModalOpen, setImproveModalOpen] = useState(false);
  const [occlusionImageUrl, setOcclusionImageUrl] = useState<string>('');
  const [occlusionRects, setOcclusionRects] = useState<any[]>([]);
  const [occlusionCanvasSize, setOcclusionCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);
  const [mcOptions, setMcOptions] = useState<string[]>(['', '', '', '']);
  const [mcCorrectIndex, setMcCorrectIndex] = useState<number>(0);

  // ─── Queries ───────────────────────────
  const { data: deck, isLoading: deckLoading } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => deckService.fetchDeck(deckId),
    enabled: !!user && !!deckId,
  });

    const descendantIds = useMemo(() => {
    if (!decks.length || !deckId) return [];
    const result: string[] = [];
    const queue = [deckId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const children = decks.filter(d => d.parent_deck_id === current && !d.is_archived);
      for (const child of children) { result.push(child.id); queue.push(child.id); }
    }
    return result;
  }, [decks, deckId]);

  const allDeckIds = useMemo(() => [deckId, ...descendantIds], [deckId, descendantIds]);

  const CARDS_PAGE = 200;
  const [displayLimit, setDisplayLimit] = useState(CARDS_PAGE);

  // Lightweight counts by state/type via single RPC (replaces cardsMeta + fetchAggregatedStats)
  const { data: cardCounts, isLoading: cardCountsLoading } = useQuery({
    queryKey: ['card-counts', deckId],
    queryFn: () => cardService.fetchDescendantCardCounts(deckId),
    enabled: !!user && !!deckId,
  });

  // Full card content – only first N cards for display via single RPC
  const { data: displayCards = [], isLoading: displayCardsLoading } = useQuery({
    queryKey: ['cards-display', deckId, displayLimit],
    queryFn: () => cardService.fetchDescendantCardsPage(deckId, displayLimit, 0),
    enabled: !!user && !!deckId,
  });

  const allCardsLoading = cardCountsLoading || displayCardsLoading;
  // allCards = displayCards (paginated full content for rendering)
  const allCards = displayCards;

  // ─── Auto-sync: if linked deck has 0 cards, copy from source ───
  const syncAttemptedRef = useRef(false);
  useEffect(() => {
    if (syncAttemptedRef.current) return;
    if (!deck || !user || !cardCounts) return;
    if (cardCounts.total > 0) return;
    const sourceTurmaDeckId = (deck as any)?.source_turma_deck_id;
    const isLiveDeck = (deck as any)?.is_live_deck;
    if (!sourceTurmaDeckId && !isLiveDeck) return;
    syncAttemptedRef.current = true;
    (async () => {
      try {
        let sourceDeckId: string | null = null;

        if (sourceTurmaDeckId) {
          // Find the source deck_id from turma_decks
          const { data: td } = await supabase
            .from('turma_decks')
            .select('deck_id')
            .eq('id', sourceTurmaDeckId)
            .maybeSingle();
          sourceDeckId = td?.deck_id ?? null;
        }

        // Fallback: find source by name match (for public decks without turma link)
        if (!sourceDeckId && isLiveDeck) {
          const { data: candidates } = await supabase
            .from('decks')
            .select('id')
            .eq('name', (deck as any).name)
            .eq('is_public', true)
            .neq('user_id', user.id)
            .limit(1);
          sourceDeckId = candidates?.[0]?.id ?? null;
        }

        if (!sourceDeckId) return;

        // Copy cards in batches
        const BATCH = 500;
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: cards } = await supabase
            .from('cards')
            .select('front_content, back_content, card_type')
            .eq('deck_id', sourceDeckId)
            .range(offset, offset + BATCH - 1)
            .order('created_at', { ascending: true });
          if (!cards || cards.length === 0) { hasMore = false; break; }
          await supabase.from('cards').insert(
            cards.map((c: any) => ({
              deck_id: deckId,
              front_content: c.front_content,
              back_content: c.back_content,
              card_type: c.card_type ?? 'basic',
              state: 0, stability: 0, difficulty: 0,
            })) as any
          );
          if (cards.length < BATCH) hasMore = false;
          else offset += BATCH;
        }
        // Refresh card data
        queryClient.invalidateQueries({ queryKey: ['card-counts', deckId] });
        queryClient.invalidateQueries({ queryKey: ['cards-display', deckId] });
        queryClient.invalidateQueries({ queryKey: ['decks'] });
      } catch (e) {
        console.error('Auto-sync cards failed:', e);
      }
    })();
  }, [deck, user, cardCounts, deckId, queryClient]);

  const loadMoreCards = useCallback(() => {
    setDisplayLimit(prev => prev + CARDS_PAGE);
  }, []);

  // Derive stats from cardCounts (no extra query needed) + rootTotals for today's reviewed
  const stats = useMemo(() => {
    if (!cardCounts) return undefined;
    return {
      new_count: cardCounts.new_count,
      learning_count: cardCounts.learning_count,
      review_count: cardCounts.review_count,
      reviewed_today: 0, // computed from rootTotals below
    };
  }, [cardCounts]);

  // ─── Root ancestor governance ─────────
  // Find the root ancestor — its config (limits, shuffle, algorithm) governs all descendants
  const rootId = useMemo(() => {
    let currentId = deckId;
    while (true) {
      const d = decks.find(dk => dk.id === currentId);
      if (!d?.parent_deck_id) return currentId;
      currentId = d.parent_deck_id;
    }
  }, [decks, deckId]);

  const rootDeck = decks.find(d => d.id === rootId);

  // Sum new_reviewed_today across the ENTIRE root hierarchy (for deck-level cap)
  const rootTotals = useMemo(() => {
    const collectAll = (id: string): { newReviewed: number; reviewed: number; newGraduated: number } => {
      const d = decks.find(dk => dk.id === id);
      let newReviewed = d?.new_reviewed_today ?? 0;
      let reviewed = d?.reviewed_today ?? 0;
      let newGraduated = d?.new_graduated_today ?? 0;
      const children = decks.filter(dk => dk.parent_deck_id === id && !dk.is_archived);
      for (const child of children) {
        const c = collectAll(child.id);
        newReviewed += c.newReviewed;
        reviewed += c.reviewed;
        newGraduated += c.newGraduated;
      }
      return { newReviewed, reviewed, newGraduated };
    };
    return collectAll(rootId);
  }, [decks, rootId]);

  // Fetch active study plans to scope plan-governed limits
  const studyPlansQuery = useQuery({
    queryKey: ['study-plans-for-deck-detail', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plans')
        .select('deck_ids')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ deck_ids: string[] | null }>;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const planRootIds = useMemo(() => {
    const roots = new Set<string>();
    for (const plan of studyPlansQuery.data ?? []) {
      for (const id of (plan.deck_ids ?? [])) {
        roots.add(findRootAncestorId(decks, id));
      }
    }
    return roots;
  }, [studyPlansQuery.data, decks]);

  const hasPlanActive = planRootIds.size > 0;

  // Sum new_reviewed_today across deck scope:
  // - plan mode: only objective roots
  // - manual mode: all roots
  const globalNewReviewedToday = useMemo(() => {
    const roots = decks.filter(d => !d.parent_deck_id && !d.is_archived);
    const scopedRoots = hasPlanActive ? roots.filter(d => planRootIds.has(d.id)) : roots;

    return scopedRoots.reduce((sum, d) => {
      const collectNew = (id: string): number => {
        const dk = decks.find(x => x.id === id);
        let nr = dk?.new_reviewed_today ?? 0;
        const children = decks.filter(x => x.parent_deck_id === id && !x.is_archived);
        for (const child of children) nr += collectNew(child.id);
        return nr;
      };
      return sum + collectNew(d.id);
    }, 0);
  }, [decks, hasPlanActive, planRootIds]);

  // Fetch global daily_new_cards_limit from profile
  const globalNewLimitQuery = useQuery({
    queryKey: ['daily-new-cards-limit', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('daily_new_cards_limit, weekly_new_cards')
        .eq('id', user!.id)
        .single();
      return data as any;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const isPlanControlled = hasPlanActive && planRootIds.has(rootId);

  // ─── Computed ──────────────────────────
  const isQuickReview = (deck as any)?.algorithm_mode === 'quick_review';
  const totalCards = cardCounts?.total ?? 0;
  const dailyNewLimit = rootDeck?.daily_new_limit ?? (deck as any)?.daily_new_limit ?? 20;
  const dailyReviewLimit = rootDeck?.daily_review_limit ?? (deck as any)?.daily_review_limit ?? 100;

  // Global new cards limit (from profile, with weekly override)
  const profileLimitData = globalNewLimitQuery.data as number | { daily_new_cards_limit?: number; weekly_new_cards?: Record<string, number> | null } | null | undefined;
  const rawGlobalLimit = typeof profileLimitData === 'number' ? profileLimitData : profileLimitData?.daily_new_cards_limit ?? 9999;
  const weeklyNewCards = (profileLimitData && typeof profileLimitData === 'object')
    ? (profileLimitData.weekly_new_cards as Record<string, number> | null)
    : null;
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayGlobalLimit = (weeklyNewCards && weeklyNewCards[DAY_KEYS[new Date().getDay()]] != null)
    ? weeklyNewCards[DAY_KEYS[new Date().getDay()]]
    : rawGlobalLimit;

  const learningCount = (stats?.learning_count ?? 0);
  const newReviewedToday = rootTotals.newReviewed;
  const newGraduatedToday = rootTotals.newGraduated;
  const reviewedToday = rootTotals.reviewed;
  const reviewReviewedToday = Math.max(0, reviewedToday - newGraduatedToday);

  // Effective new count:
  // - objective deck in plan mode: governed only by global plan remaining
  // - otherwise: deck hierarchy + global cap
  const deckRemaining = Math.max(0, dailyNewLimit - newReviewedToday);
  const globalRemaining = Math.max(0, todayGlobalLimit - globalNewReviewedToday);

  // Quick review: no daily limits, show all cards by state
  const newCountToday = isQuickReview
    ? (stats?.new_count ?? 0)
    : isPlanControlled
      ? Math.max(0, Math.min(stats?.new_count ?? 0, globalRemaining))
      : Math.max(0, Math.min(stats?.new_count ?? 0, deckRemaining));
  const reviewDue = Math.max(0, Math.min(stats?.review_count ?? 0, dailyReviewLimit - reviewReviewedToday));
  const masteredToday = isQuickReview
    ? Math.max(0, totalCards - (stats?.new_count ?? 0) - learningCount)
    : reviewDue;
  const totalDue = isQuickReview
    ? totalCards
    : newCountToday + learningCount + masteredToday;
  const studyPending = totalDue;

  const actualNewCount = stats?.new_count ?? 0;
  const totalReviewStateCards = Math.max(0, totalCards - actualNewCount - learningCount);
  const newPct = totalCards > 0 ? (actualNewCount / totalCards) * 100 : 0;
  const learningPct = totalCards > 0 ? (learningCount / totalCards) * 100 : 0;
  const masteredPct = totalCards > 0 ? (totalReviewStateCards / totalCards) * 100 : 0;
  const otherDecks = decks.filter(d => d.id !== deckId && !d.is_archived);
  const isSaving = createCard.isPending || updateCard.isPending;
  const canImprove = !!cardType && cardType !== 'image_occlusion';

  // Helper: detect frozen cards (scheduled_date > 50 years from now)
  const isFrozenCard = useCallback((card: CardRow) => {
    const fiftyYears = Date.now() + 50 * 365.25 * 24 * 60 * 60 * 1000;
    return new Date(card.scheduled_date).getTime() > fiftyYears;
  }, []);

  // Unfreeze a card (reset to new state)
  const unfreezeCard = useCallback(async (cardId: string) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('cards')
        .update({ scheduled_date: new Date().toISOString(), state: 0, stability: 0, difficulty: 0 })
        .eq('id', cardId);
      if (error) throw error;
      toast({ title: '🔥 Card descongelado', description: 'O card voltou para a fila de estudo.' });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch {
      toast({ title: 'Erro ao descongelar card', variant: 'destructive' });
    }
  }, [toast, queryClient]);

  const filteredCards = useMemo(() => {
    let result = allCards;
    if (typeFilter !== 'all') {
      result = result.filter(c => {
        if (typeFilter === 'basic') return c.card_type === 'basic' || !c.card_type;
        return c.card_type === typeFilter;
      });
    }
    if (stateFilter !== 'all') {
      if (stateFilter === 'frozen') result = result.filter(c => isFrozenCard(c));
      else if (stateFilter === 'new') result = result.filter(c => (c.state === 0 || c.state == null) && !isFrozenCard(c));
      else if (stateFilter === 'learning') result = result.filter(c => c.state === 1 && !isFrozenCard(c));
      else if (stateFilter === 'relearning') result = result.filter(c => c.state === 3 && !isFrozenCard(c));
      else if (stateFilter === 'mastered') result = result.filter(c => c.state === 2 && !isFrozenCard(c));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.front_content.toLowerCase().includes(q) || c.back_content.toLowerCase().includes(q));
    }
    // Sort: frozen cards always at the bottom
    return [...result].sort((a, b) => {
      const aFrozen = isFrozenCard(a) ? 1 : 0;
      const bFrozen = isFrozenCard(b) ? 1 : 0;
      return aFrozen - bFrozen;
    });
  }, [allCards, search, typeFilter, stateFilter, isFrozenCard]);

  // ─── Helpers ───────────────────────────
  const getStateInfo = useCallback((card: CardRow) => {
    // Frozen detection
    if (isFrozenCard(card)) {
      return { label: '❄️ Congelado', color: 'text-info bg-info/10' };
    }
    if (isQuickReview) {
      if (card.state === 0 || card.state == null) return { label: 'Não estudado', color: 'text-muted-foreground bg-muted' };
      if (card.state === 1) return { label: 'Não entendi', color: 'text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40' };
      return { label: 'Entendi', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40' };
    }
    if (card.state === 0 || card.state == null) return { label: 'Novo', color: 'text-muted-foreground bg-muted' };
    if (card.state === 1 || card.state === 3) {
      const due = new Date(card.scheduled_date);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
      const startOfDayAfter = new Date(startOfTomorrow);
      startOfDayAfter.setDate(startOfDayAfter.getDate() + 1);
      if (due <= startOfTomorrow) return { label: 'Hoje', color: 'text-primary bg-primary/10' };
      if (due <= startOfDayAfter) return { label: 'Amanhã', color: 'text-primary bg-primary/10' };
      const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { label: `${days}d`, color: 'text-primary bg-primary/10' };
    }
    const due = new Date(card.scheduled_date);
    const now = new Date();
    if (due <= now) return { label: 'Hoje', color: 'text-primary bg-primary/10' };
    const startOfTomorrow2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfDayAfter2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    if (due <= startOfDayAfter2) return { label: 'Amanhã', color: 'text-primary bg-primary/10' };
    const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { label: `${days}d`, color: 'text-primary bg-primary/10' };
  }, [isQuickReview, isFrozenCard]);

  const stripHtml = useCallback((html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }, []);

  const resetForm = useCallback(() => {
    setFront(''); setBack(''); setEditingId(null); setCardType(null);
    setOcclusionImageUrl(''); setOcclusionRects([]); setOcclusionCanvasSize(null);
    setMcOptions(['', '', '', '']); setMcCorrectIndex(0);
  }, []);

  const openNew = useCallback(() => { resetForm(); setEditorOpen(true); }, [resetForm]);

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
      // Parse JSON back_content with clozeTarget
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
  }, []);

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
      // Extract unique cloze numbers
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

      if (editingId) {
        // Find all sibling cloze cards from server (same front_content as the card being edited)
        const editingCard = allCards.find(c => c.id === editingId);
        let frontContentForCloze = editingCard?.front_content;
        if (!frontContentForCloze && editingId) {
          // Card not in display page, fetch from server
          const { data } = await supabase.from('cards').select('front_content').eq('id', editingId).single();
          frontContentForCloze = data?.front_content;
        }
        const allSiblingCards = frontContentForCloze
          ? await cardService.fetchClozeSiblings(allDeckIds, frontContentForCloze)
          : [];

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
          // Old-format cloze card: assign first available cloze number
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
  }, [front, back, occlusionImageUrl, occlusionRects, cardType, mcOptions, mcCorrectIndex, editingId, toast, createCard, updateCard, resetForm, allCards, allDeckIds, deckId, queryClient]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    // For cloze cards, delete all siblings with same front_content
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
      deleteCard.mutate(deleteId, { onSuccess: () => { setDeleteId(null); toast({ title: 'Card excluído' }); } });
    }
  }, [deleteId, deleteCard, toast, allCards, allDeckIds, deckId, queryClient]);

  const handleMoveCard = useCallback(async () => {
    if (!moveCardId || !moveTargetDeck) return;
    try {
      await cardService.moveCard(moveCardId, moveTargetDeck);
      toast({ title: 'Card movido!' });
      invalidateDeckRelatedQueries(queryClient, deckId);
      invalidateDeckRelatedQueries(queryClient, moveTargetDeck);
    } catch { toast({ title: 'Erro ao mover', variant: 'destructive' }); }
    setMoveCardId(null); setMoveTargetDeck('');
  }, [moveCardId, moveTargetDeck, deckId, queryClient, toast]);

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCards(prev => { const next = new Set(prev); next.has(cardId) ? next.delete(cardId) : next.add(cardId); return next; });
  }, []);

  const selectAllCards = useCallback(() => {
    if (selectedCards.size === filteredCards.length) setSelectedCards(new Set());
    else setSelectedCards(new Set(filteredCards.map(c => c.id)));
  }, [selectedCards.size, filteredCards]);

  const handleBulkMove = useCallback(async () => {
    if (!moveTargetDeck || selectedCards.size === 0) return;
    const ids = Array.from(selectedCards);
    try {
      await cardService.bulkMoveCards(ids, moveTargetDeck);
      toast({ title: `${ids.length} card${ids.length > 1 ? 's' : ''} movido${ids.length > 1 ? 's' : ''}!` });
      invalidateDeckRelatedQueries(queryClient, deckId);
    } catch { toast({ title: 'Erro ao mover', variant: 'destructive' }); }
    setSelectedCards(new Set()); setSelectionMode(false); setBulkMoveOpen(false); setMoveTargetDeck('');
  }, [moveTargetDeck, selectedCards, deckId, queryClient, toast]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedCards);
    try {
      await cardService.bulkDeleteCards(ids);
      toast({ title: `${ids.length} card${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''}!` });
      invalidateDeckRelatedQueries(queryClient, deckId);
    } catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }); }
    setSelectedCards(new Set()); setSelectionMode(false);
  }, [selectedCards, deckId, queryClient, toast]);

  const uploadOcclusionFile = useCallback(async (file: File) => {
    if (!user) return;
    try {
      const url = await cardService.uploadCardImage(user.id, file);
      setOcclusionImageUrl(url);
      setOcclusionModalOpen(true);
    } catch (e: any) { toast({ title: e.message || 'Erro no upload', variant: 'destructive' }); }
  }, [user, toast]);

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
      queryClient.invalidateQueries({ queryKey: ['energy'] });
      setImprovePreview({ front: data.front, back: data.back });
      setImproveModalOpen(true);
    } catch (e: any) { toast({ title: 'Erro ao melhorar card', description: e.message, variant: 'destructive' }); }
    finally { setIsImproving(false); }
  }, [front, back, cardType, mcOptions, mcCorrectIndex, energy, model, queryClient, toast]);

  const applyImprovement = useCallback(() => {
    if (!improvePreview) return;
    setFront(improvePreview.front);
    if (cardType === 'multiple_choice') {
      try { const data = JSON.parse(improvePreview.back); setMcOptions(data.options || mcOptions); setMcCorrectIndex(data.correctIndex ?? mcCorrectIndex); } catch {}
    } else { setBack(improvePreview.back); }
    setImproveModalOpen(false); setImprovePreview(null);
    toast({ title: 'Melhoria aplicada!' });
  }, [improvePreview, cardType, mcOptions, mcCorrectIndex, toast]);

  const handleImportCards = useCallback(async (subDeckName: string, importedCards: { frontContent: string; backContent: string; cardType?: string }[], subdecks?: any[]) => {
    if (!deckId) return;
    try {
      const { data: { user } } = await (await import('@/integrations/supabase/client')).supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (subdecks && subdecks.length > 0) {
        // Create organized subdecks under this deck
        await deckService.importDeckWithSubdecks(
          user.id,
          subDeckName,
          deck?.folder_id ?? null,
          importedCards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType || 'basic' })),
          subdecks,
          deck?.algorithm_mode,
        );
        toast({ title: `${importedCards.length} cartões importados em subdecks!` });
      } else {
        // Create a single subdeck under this deck
        const newName = subDeckName || 'Importado';
        const { data: newDeck, error } = await (await import('@/integrations/supabase/client')).supabase
          .from('decks')
          .insert({
            name: newName,
            user_id: user.id,
            folder_id: deck?.folder_id ?? null,
            parent_deck_id: deckId,
            algorithm_mode: deck?.algorithm_mode || 'sm2',
          } as any)
          .select()
          .single();
        if (error || !newDeck) throw error;

        await cardService.createCards((newDeck as any).id, importedCards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType || 'basic' })));
        toast({ title: `${importedCards.length} cartões importados como subdeck "${newName}"!` });
      }

      invalidateDeckRelatedQueries(queryClient, deckId);
      setImportOpen(false);
    } catch { toast({ title: 'Erro ao importar', variant: 'destructive' }); }
  }, [deckId, deck, queryClient, toast]);

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
  }, [algorithmConfirm, deckId, queryClient, toast]);

  const handleAlgorithmCopy = useCallback(async () => {
    if (!algorithmConfirm || !deckId || !user) return;
    try {
      const newDeck = await deckService.createAlgorithmCopy(user.id, deckId, algorithmConfirm.value, algorithmConfirm.label);
      invalidateDeckRelatedQueries(queryClient);
      toast({ title: 'Cópia criada!', description: `"${(newDeck as any).name}" como sub-baralho.` });
      setAlgorithmConfirm(null); setAlgorithmModalOpen(false);
      navigate(`/decks/${(newDeck as any).id}`);
    } catch { toast({ title: 'Erro ao criar cópia', variant: 'destructive' }); }
  }, [algorithmConfirm, deckId, user, queryClient, toast, navigate]);

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

      const { supabase } = await import('@/integrations/supabase/client');
      const { data: aiData, error: fnError } = await supabase.functions.invoke('generate-deck', {
        body: {
          textContent, cardCount: examTotalQuestions, detailLevel: 'standard',
          cardFormats: [...(mcCount > 0 ? ['multiple_choice'] : []), ...(examWrittenCount > 0 ? ['qa'] : [])],
          customInstructions: `PROVA ACADÊMICA. Gere ${mcCount} questões de múltipla escolha (${examOptionsCount} alternativas cada) e ${examWrittenCount} dissertativas.\nCada questão DEVE ter um ENUNCIADO (caso clínico, situação-problema ou texto-base) na "front", separado da pergunta por "---".\nDissertativas: "front" = enunciado + pergunta, "back" = resposta completa.\nBaseie-se APENAS no material fornecido. Varie a dificuldade.`,
          aiModel: model, energyCost: totalCost,
        },
      });
      if (fnError || aiData?.error) throw new Error(aiData?.error || 'Erro na geração');
      queryClient.invalidateQueries({ queryKey: ['energy'] });

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
  }, [deckId, deck, examTotalQuestions, examWrittenCount, examTitle, examOptionsCount, examTimeLimit, model, addNotification, updateNotification, createExam, queryClient, toast]);

  const hasMoreCards = displayLimit < totalCards;

  const value: DeckDetailContextValue = {
    deckId, deck, deckLoading, allCards, allCardsLoading, filteredCards, cardCounts, loadMoreCards, hasMoreCards, stats, decks,
    dailyNewLimit, dailyReviewLimit, isPlanControlled, newCountToday, learningCount, masteredToday,
    isQuickReview, totalDue, studyPending, totalCards, actualNewCount, totalReviewStateCards,
    newPct, learningPct, masteredPct,
    search, setSearch, typeFilter, setTypeFilter, stateFilter, setStateFilter,
    selectionMode, setSelectionMode, selectedCards, setSelectedCards, toggleCardSelection, selectAllCards,
    cards, createCard, updateCard, deleteCard,
    editorOpen, setEditorOpen, editingId, setEditingId, front, setFront, back, setBack, cardType, setCardType,
    deleteId, setDeleteId, moveCardId, setMoveCardId, moveTargetDeck, setMoveTargetDeck, bulkMoveOpen, setBulkMoveOpen,
    algorithmModalOpen, setAlgorithmModalOpen, algorithmConfirm, setAlgorithmConfirm,
    examModalOpen, setExamModalOpen, examTitle, setExamTitle, examTotalQuestions, setExamTotalQuestions,
    examWrittenCount, setExamWrittenCount, examOptionsCount, setExamOptionsCount, examTimeLimit, setExamTimeLimit,
    examGenerating, setExamGenerating,
    aiAddCardsOpen, setAiAddCardsOpen, importOpen, setImportOpen,
    isImproving, setIsImproving, improvePreview, setImprovePreview, improveModalOpen, setImproveModalOpen,
    occlusionImageUrl, setOcclusionImageUrl, occlusionRects, setOcclusionRects, occlusionCanvasSize, setOcclusionCanvasSize, occlusionModalOpen, setOcclusionModalOpen,
    mcOptions, setMcOptions, mcCorrectIndex, setMcCorrectIndex,
    energy, spendEnergy, model, setModel, getCost, createExam, addNotification, updateNotification,
    resetForm, openNew, openEdit, handleSave, handleDelete, handleMoveCard,
    handleBulkMove, handleBulkDelete, handleImprove, applyImprovement,
    uploadOcclusionFile, handleOcclusionAttach, handleOcclusionPaste,
    handleImportCards, handleAlgorithmChange, handleAlgorithmCopy, handleGenerateExam,
    getStateInfo, isFrozenCard, unfreezeCard, stripHtml,
    navigate, toast, queryClient, user, otherDecks, isSaving, canImprove,
  };

  return <DeckDetailContext.Provider value={value}>{children}</DeckDetailContext.Provider>;
};
