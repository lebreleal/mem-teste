/**
 * DeckDetailContext – centralizes all deck-detail state so sub-components
 * can consume via useDeckDetail() instead of receiving long prop lists.
 *
 * Handlers extracted to DeckDetailHandlers.ts for maintainability.
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
import type { CardRow } from '@/types/deck';
import { findRootAncestorId } from '@/lib/studyUtils';
import { useDeckDetailHandlers } from './DeckDetailHandlers';

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

  // Detect community deck (belongs to another user) — RPCs filter by auth.uid(), so use direct queries instead
  const isCommunityDeck = !!deck && !!user && (deck as any).user_id !== user.id;

  const CARDS_PAGE = 200;
  const [displayLimit, setDisplayLimit] = useState(CARDS_PAGE);

  // Card counts: use RPC for own decks, direct query for community decks
  // For community decks, all cards are "new" from the viewer's perspective (owner's state is irrelevant)
  const { data: cardCounts, isLoading: cardCountsLoading } = useQuery({
    queryKey: ['card-counts', deckId, isCommunityDeck],
    queryFn: async () => {
      if (isCommunityDeck) {
        // Direct query — RLS allows viewing community deck cards
        const cards = await cardService.fetchCards(deckId);
        const total = cards.length;
        // All cards are "new" from the viewer's perspective — they haven't studied any
        return {
          total,
          new_count: total,
          learning_count: 0,
          review_count: 0,
          basic_count: cards.filter((c: any) => c.card_type === 'basic').length,
          cloze_count: cards.filter((c: any) => c.card_type === 'cloze').length,
          mc_count: cards.filter((c: any) => c.card_type === 'multiple_choice').length,
          occlusion_count: cards.filter((c: any) => c.card_type === 'occlusion').length,
          frozen_count: 0,
        } as cardService.DescendantCardCounts;
      }
      return cardService.fetchDescendantCardCounts(deckId);
    },
    enabled: !!user && !!deckId && !deckLoading,
  });

  // Display cards: use RPC for own decks, direct query for community decks
  // For community decks, override state/difficulty to show as "new" from viewer's perspective
  const { data: displayCards = [], isLoading: displayCardsLoading } = useQuery({
    queryKey: ['cards-display', deckId, displayLimit, isCommunityDeck],
    queryFn: async () => {
      if (isCommunityDeck) {
        const cards = await cardService.fetchCards(deckId);
        // Reset state and difficulty so gauge shows 0% progress for the viewer
        return cards.slice(0, displayLimit).map((c: any) => ({
          ...c,
          state: 0,
          difficulty: 0,
          stability: 0,
          learning_step: 0,
          last_reviewed_at: null,
        })) as cardService.CardRow[];
      }
      return cardService.fetchDescendantCardsPage(deckId, displayLimit, 0);
    },
    enabled: !!user && !!deckId && !deckLoading,
  });

  const allCardsLoading = cardCountsLoading || displayCardsLoading;
  const allCards = displayCards;

  // ─── Auto-sync: sync community decks (this deck + descendant community sub-decks) ───
  const syncAttemptedRef = useRef(false);
  useEffect(() => {
    if (syncAttemptedRef.current) return;
    if (!deck || !user || !decks.length) return;
    syncAttemptedRef.current = true;

    // Collect all community decks in this hierarchy that might need syncing
    const communityDecksToSync: { deckId: string; sourceTurmaDeckId: string | null; isLiveDeck: boolean; name: string }[] = [];

    const collectCommunityDecks = (id: string) => {
      const d = id === deckId ? deck : decks.find(dk => dk.id === id);
      if (!d) return;
      const src = (d as any).source_turma_deck_id;
      const live = !!(d as any).is_live_deck;
      if (src || live) {
        communityDecksToSync.push({ deckId: id, sourceTurmaDeckId: src, isLiveDeck: live, name: (d as any).name });
      }
      const children = decks.filter(dk => dk.parent_deck_id === id && !dk.is_archived);
      for (const child of children) collectCommunityDecks(child.id);
    };
    collectCommunityDecks(deckId);

    if (communityDecksToSync.length === 0) return;

    (async () => {
      try {
        // Check which of these decks have 0 cards
        const idsToCheck = communityDecksToSync.map(d => d.deckId);
        const { data: cardCountsData } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: idsToCheck });
        const countMap = new Map<string, number>();
        if (cardCountsData) {
          for (const row of cardCountsData as any[]) countMap.set(row.deck_id, row.card_count);
        }

        const emptyDecks = communityDecksToSync.filter(d => !countMap.has(d.deckId) || countMap.get(d.deckId) === 0);
        if (emptyDecks.length === 0) return;

        let synced = false;
        for (const communityDeck of emptyDecks) {
          let sourceDeckId: string | null = null;
          if (communityDeck.sourceTurmaDeckId) {
            const { data: td } = await supabase.from('turma_decks').select('deck_id').eq('id', communityDeck.sourceTurmaDeckId).maybeSingle();
            sourceDeckId = td?.deck_id ?? null;
          }
          if (!sourceDeckId && communityDeck.isLiveDeck) {
            const { data: candidates } = await supabase.from('decks').select('id').eq('name', communityDeck.name).eq('is_public', true).neq('user_id', user.id).limit(1);
            sourceDeckId = candidates?.[0]?.id ?? null;
          }
          if (!sourceDeckId) continue;

          const BATCH = 500;
          let offset = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', sourceDeckId).range(offset, offset + BATCH - 1).order('created_at', { ascending: true });
            if (!cards || cards.length === 0) { hasMore = false; break; }
            await supabase.from('cards').insert(cards.map((c: any) => ({ deck_id: communityDeck.deckId, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type ?? 'basic', state: 0, stability: 0, difficulty: 0 })) as any);
            if (cards.length < BATCH) hasMore = false;
            else offset += BATCH;
          }
          synced = true;
        }

        if (synced) {
          queryClient.invalidateQueries({ queryKey: ['card-counts', deckId] });
          queryClient.invalidateQueries({ queryKey: ['cards-display', deckId] });
          queryClient.invalidateQueries({ queryKey: ['decks'] });
        }
      } catch (e) { console.error('Auto-sync cards failed:', e); }
    })();
  }, [deck, user, decks, deckId, queryClient]);

  const loadMoreCards = useCallback(() => { setDisplayLimit(prev => prev + CARDS_PAGE); }, []);

  const stats = useMemo(() => {
    if (!cardCounts) return undefined;
    return { new_count: cardCounts.new_count, learning_count: cardCounts.learning_count, review_count: cardCounts.review_count, reviewed_today: 0 };
  }, [cardCounts]);

  // ─── Root ancestor governance ─────────
  const rootId = useMemo(() => {
    let currentId = deckId;
    while (true) {
      const d = decks.find(dk => dk.id === currentId);
      if (!d?.parent_deck_id) return currentId;
      currentId = d.parent_deck_id;
    }
  }, [decks, deckId]);

  const rootDeck = decks.find(d => d.id === rootId);

  const rootTotals = useMemo(() => {
    const collectAll = (id: string): { newReviewed: number; reviewed: number; newGraduated: number } => {
      const d = decks.find(dk => dk.id === id);
      let newReviewed = d?.new_reviewed_today ?? 0;
      let reviewed = d?.reviewed_today ?? 0;
      let newGraduated = d?.new_graduated_today ?? 0;
      const children = decks.filter(dk => dk.parent_deck_id === id && !dk.is_archived);
      for (const child of children) { const c = collectAll(child.id); newReviewed += c.newReviewed; reviewed += c.reviewed; newGraduated += c.newGraduated; }
      return { newReviewed, reviewed, newGraduated };
    };
    return collectAll(rootId);
  }, [decks, rootId]);

  const studyPlansQuery = useQuery({
    queryKey: ['study-plans-for-deck-detail', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('study_plans').select('deck_ids').eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ deck_ids: string[] | null }>;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const planRootIds = useMemo(() => {
    const roots = new Set<string>();
    for (const plan of studyPlansQuery.data ?? []) {
      for (const id of (plan.deck_ids ?? [])) roots.add(findRootAncestorId(decks, id));
    }
    return roots;
  }, [studyPlansQuery.data, decks]);

  const hasPlanActive = planRootIds.size > 0;

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

  const profileQuery = useProfile();
  const profileData = profileQuery.data;
  const isPlanControlled = hasPlanActive && planRootIds.has(rootId);

  // ─── Computed ──────────────────────────
  const isQuickReview = (deck as any)?.algorithm_mode === 'quick_review';
  const totalCards = cardCounts?.total ?? 0;
  const dailyNewLimit = rootDeck?.daily_new_limit ?? (deck as any)?.daily_new_limit ?? 20;
  const dailyReviewLimit = rootDeck?.daily_review_limit ?? (deck as any)?.daily_review_limit ?? 100;

  const rawGlobalLimit = profileData?.daily_new_cards_limit ?? 9999;
  const weeklyNewCards = profileData?.weekly_new_cards ?? null;
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayGlobalLimit = (weeklyNewCards && (weeklyNewCards as any)[DAY_KEYS[new Date().getDay()]] != null)
    ? (weeklyNewCards as any)[DAY_KEYS[new Date().getDay()]]
    : rawGlobalLimit;

  const learningCount = (stats?.learning_count ?? 0);
  const newReviewedToday = rootTotals.newReviewed;
  const newGraduatedToday = rootTotals.newGraduated;
  const reviewedToday = rootTotals.reviewed;
  const reviewReviewedToday = Math.max(0, reviewedToday - newGraduatedToday);

  const deckRemaining = Math.max(0, dailyNewLimit - newReviewedToday);
  const globalRemaining = Math.max(0, todayGlobalLimit - globalNewReviewedToday);

  const newCountToday = isQuickReview
    ? (stats?.new_count ?? 0)
    : isPlanControlled
      ? Math.max(0, Math.min(stats?.new_count ?? 0, globalRemaining))
      : Math.max(0, Math.min(stats?.new_count ?? 0, deckRemaining));
  const reviewDue = Math.max(0, Math.min(stats?.review_count ?? 0, dailyReviewLimit - reviewReviewedToday));
  const masteredToday = isQuickReview ? Math.max(0, totalCards - (stats?.new_count ?? 0) - learningCount) : reviewDue;
  const totalDue = isQuickReview ? totalCards : newCountToday + learningCount + masteredToday;
  const studyPending = totalDue;

  const actualNewCount = stats?.new_count ?? 0;
  const totalReviewStateCards = Math.max(0, totalCards - actualNewCount - learningCount);
  const newPct = totalCards > 0 ? (actualNewCount / totalCards) * 100 : 0;
  const learningPct = totalCards > 0 ? (learningCount / totalCards) * 100 : 0;
  const masteredPct = totalCards > 0 ? (totalReviewStateCards / totalCards) * 100 : 0;
  // Exclude "Matérias" (decks that have children) — cards can only move into leaf decks
  const otherDecks = decks.filter(d => {
    if (d.id === deckId || d.is_archived) return false;
    const hasChildren = decks.some(child => child.parent_deck_id === d.id && !child.is_archived);
    return !hasChildren;
  });
  const isSaving = createCard.isPending || updateCard.isPending;
  const canImprove = !!cardType && cardType !== 'image_occlusion';

  // ─── Helpers ───────────────────────────
  const isFrozenCard = useCallback((card: CardRow) => {
    const fiftyYears = Date.now() + 50 * 365.25 * 24 * 60 * 60 * 1000;
    return new Date(card.scheduled_date).getTime() > fiftyYears;
  }, []);

  const unfreezeCard = useCallback(async (cardId: string) => {
    try {
      const { error } = await supabase.from('cards').update({ scheduled_date: new Date().toISOString(), state: 0, stability: 0, difficulty: 0 }).eq('id', cardId);
      if (error) throw error;
      toast({ title: '🔥 Card descongelado', description: 'O card voltou para a fila de estudo.' });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch { toast({ title: 'Erro ao descongelar card', variant: 'destructive' }); }
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
      // Difficulty-based filters
      else if (stateFilter === 'facil') result = result.filter(c => c.state !== 0 && c.state != null && !isFrozenCard(c) && (c.difficulty ?? 5) <= 3);
      else if (stateFilter === 'bom') result = result.filter(c => c.state !== 0 && c.state != null && !isFrozenCard(c) && (c.difficulty ?? 5) > 3 && (c.difficulty ?? 5) <= 5);
      else if (stateFilter === 'dificil') result = result.filter(c => c.state !== 0 && c.state != null && !isFrozenCard(c) && (c.difficulty ?? 5) > 5 && (c.difficulty ?? 5) <= 7);
      else if (stateFilter === 'errei') result = result.filter(c => c.state !== 0 && c.state != null && !isFrozenCard(c) && (c.difficulty ?? 5) > 7);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.front_content.toLowerCase().includes(q) || c.back_content.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const aFrozen = isFrozenCard(a) ? 1 : 0;
      const bFrozen = isFrozenCard(b) ? 1 : 0;
      return aFrozen - bFrozen;
    });
  }, [allCards, search, typeFilter, stateFilter, isFrozenCard]);

  const getStateInfo = useCallback((card: CardRow) => {
    if (isFrozenCard(card)) return { label: '❄️ Congelado', color: 'text-info bg-info/10' };
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
      const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
      const startOfDayAfter = new Date(startOfTomorrow); startOfDayAfter.setDate(startOfDayAfter.getDate() + 1);
      if (due <= startOfTomorrow) return { label: 'Hoje', color: 'text-primary bg-primary/10' };
      if (due <= startOfDayAfter) return { label: 'Amanhã', color: 'text-primary bg-primary/10' };
      const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { label: `${days}d`, color: 'text-primary bg-primary/10' };
    }
    const due = new Date(card.scheduled_date);
    const now = new Date();
    if (due <= now) return { label: 'Hoje', color: 'text-primary bg-primary/10' };
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

  // ─── Handlers (extracted) ─────────────
  const handlers = useDeckDetailHandlers({
    deckId, deck, allCards, allDeckIds, user, toast, queryClient,
    navigate: (path: string) => navigate(path),
    front, back, cardType, editingId, deleteId, moveCardId, moveTargetDeck,
    selectedCards, filteredCards, occlusionImageUrl, occlusionRects, occlusionCanvasSize,
    mcOptions, mcCorrectIndex, energy, model, algorithmConfirm,
    examTitle, examTotalQuestions, examWrittenCount, examOptionsCount, examTimeLimit,
    improvePreview,
    createCard, updateCard, deleteCard,
    createExam, addNotification, updateNotification,
    setFront, setBack, setEditingId, setCardType, setDeleteId,
    setMoveCardId, setMoveTargetDeck, setSelectedCards, setSelectionMode,
    setBulkMoveOpen, setEditorOpen, setOcclusionImageUrl, setOcclusionRects,
    setOcclusionCanvasSize, setOcclusionModalOpen, setMcOptions, setMcCorrectIndex,
    setIsImproving, setImprovePreview, setImproveModalOpen, setImportOpen,
    setAlgorithmConfirm, setAlgorithmModalOpen, setExamModalOpen, setExamGenerating,
  });

  const hasMoreCards = displayLimit < totalCards;

  const value: DeckDetailContextValue = {
    deckId, deck, deckLoading, allCards, allCardsLoading, filteredCards, cardCounts, loadMoreCards, hasMoreCards, stats, decks,
    dailyNewLimit, dailyReviewLimit, isPlanControlled, newCountToday, learningCount, masteredToday,
    isQuickReview, totalDue, studyPending, totalCards, actualNewCount, totalReviewStateCards,
    newPct, learningPct, masteredPct,
    search, setSearch, typeFilter, setTypeFilter, stateFilter, setStateFilter,
    selectionMode, setSelectionMode, selectedCards, setSelectedCards, toggleCardSelection: handlers.toggleCardSelection, selectAllCards: handlers.selectAllCards,
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
    resetForm: handlers.resetForm, openNew: handlers.openNew, openEdit: handlers.openEdit,
    handleSave: handlers.handleSave, handleDelete: handlers.handleDelete, handleMoveCard: handlers.handleMoveCard,
    handleBulkMove: handlers.handleBulkMove, handleBulkDelete: handlers.handleBulkDelete,
    handleImprove: handlers.handleImprove, applyImprovement: handlers.applyImprovement,
    uploadOcclusionFile: handlers.uploadOcclusionFile, handleOcclusionAttach: handlers.handleOcclusionAttach, handleOcclusionPaste: handlers.handleOcclusionPaste,
    handleImportCards: handlers.handleImportCards, handleAlgorithmChange: handlers.handleAlgorithmChange, handleAlgorithmCopy: handlers.handleAlgorithmCopy, handleGenerateExam: handlers.handleGenerateExam,
    getStateInfo, isFrozenCard, unfreezeCard, stripHtml,
    navigate, toast, queryClient, user, otherDecks, isSaving, canImprove,
  };

  return <DeckDetailContext.Provider value={value}>{children}</DeckDetailContext.Provider>;
};
