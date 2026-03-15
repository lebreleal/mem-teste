// ============= Refactored Dashboard.tsx =============

import { useNavigate, useSearchParams } from 'react-router-dom';
import {} from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getNewCardsForDayGlobal } from '@/hooks/useStudyPlan';
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, Trash2, Play, SlidersHorizontal, MoreVertical, Pencil, ImageIcon, SquarePlus, RotateCcw, Layers, Clock, Info, User, Compass, EyeOff, Share2, RefreshCw, LogOut } from 'lucide-react';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '@/components/GlobalLoading';
import { useSubscription } from '@/hooks/useSubscription';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { calculateRealStudyTime } from '@/lib/studyUtils';

/** Suspense fallback that shows global loading overlay while chunk loads */
const SuspenseLoading = () => {
  useEffect(() => {
    showGlobalLoading();
    return () => { hideGlobalLoading(); };
  }, []);
  return null;
};

const ImportCardsDialog = lazy(() => import('@/components/ImportCardsDialog'));
const AICreateDeckDialog = lazy(() => import('@/components/AICreateDeckDialog'));
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { useDashboardState } from '@/components/dashboard/useDashboardState';
import { useDashboardActions } from '@/hooks/useDashboardActions';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DeckList from '@/components/dashboard/DeckList';
import DeckRow from '@/components/dashboard/DeckRow';
import SalaList from '@/components/dashboard/SalaList';
import DashboardDialogs from '@/components/dashboard/DashboardDialogs';
const PremiumModal = lazy(() => import('@/components/dashboard/PremiumModal'));

const StudyWeightsSheet = lazy(() => import('@/components/dashboard/StudyWeightsSheet'));
const StudySalaSheet = lazy(() => import('@/components/dashboard/StudySalaSheet'));
const StudySettingsSheet = lazy(() => import('@/components/dashboard/StudySettingsSheet'));

import { importDeck, importDeckWithSubdecks } from '@/services/deckService';
import BottomNav from '@/components/BottomNav';
import CommunityRecommendations from '@/components/dashboard/CommunityRecommendations';
import { usePendingDecks, type PendingDeck } from '@/stores/usePendingDecks';
import { useMissions } from '@/hooks/useMissions';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { GeneratedCard } from '@/types/ai';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plans, allDeckIds, avgSecondsPerCard, realStudyMetrics, metrics, globalCapacity } = useStudyPlan();
  const { decks: allDecks } = useDecks();
  const planRootIds = useMemo(() => {
    if (plans.length === 0 || !allDecks) return undefined;
    const getRootIdLocal = (deckId: string): string | null => {
      const d = allDecks.find(x => x.id === deckId);
      if (!d) return null;
      if (!d.parent_deck_id) return d.id;
      return getRootIdLocal(d.parent_deck_id);
    };
    const rootIds = new Set<string>();
    for (const id of allDeckIds) {
      const rootId = getRootIdLocal(id);
      if (rootId) rootIds.add(rootId);
    }
    return rootIds;
  }, [plans, allDeckIds, allDecks]);

  const planDeckOrderEarly = useMemo(() => plans.flatMap(p => p.deck_ids ?? []), [plans]);
  const state = useDashboardState(planRootIds, planDeckOrderEarly);
  const { isPremium, refreshStatus } = useSubscription();
  const { missions } = useMissions();
  const { isAdmin } = useIsAdmin();
  const defaultAlgorithm = isPremium ? 'fsrs' : 'sm2';

  const claimableCount = missions.filter(m => m.isCompleted && !m.isClaimed).length;

  // Error notebook count (cards in the error deck)
  const { data: errorCount = 0 } = useQuery({
    queryKey: ['error-notebook-count'],
    queryFn: async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return 0;
      const { getErrorDeckCount } = await import('@/services/errorDeckService');
      return getErrorDeckCount(u.id);
    },
    staleTime: 60_000,
  });

  // Fetch user's turma for publish toggle
  const { data: userTurma, refetch: refetchTurma } = useQuery({
    queryKey: ['user-turma', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('turmas').select('id, name, is_private, share_slug').eq('owner_id', user.id).limit(1).maybeSingle();
      return data as { id: string; name: string; is_private: boolean; share_slug: string | null } | null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Detect if current folder is a community-followed sala
  const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
  const sourceTurmaId = currentFolder?.source_turma_id;
  const isCommunityFolder = !!sourceTurmaId;

  // Fetch turma info + decks for community folders
  const { data: communityTurmaInfo } = useQuery({
    queryKey: ['community-folder-turma', sourceTurmaId],
    queryFn: async () => {
      const { data: turma } = await supabase.from('turmas').select('id, name, owner_id, cover_image_url').eq('id', sourceTurmaId!).single();
      if (!turma) return null;
      // Fetch owner name
      const { data: profiles } = await supabase.rpc('get_public_profiles' as any, { p_user_ids: [(turma as any).owner_id] });
      const ownerName = (profiles as any)?.[0]?.name || 'Anônimo';
      // Fetch published decks
      const { data: turmaDecks } = await supabase.from('turma_decks').select('deck_id').eq('turma_id', sourceTurmaId!).eq('is_published', true);
      const deckIds = (turmaDecks ?? []).map((td: any) => td.deck_id);
      let decks: any[] = [];
      if (deckIds.length > 0) {
        const { data: d } = await supabase.from('decks').select('*').in('id', deckIds);
        // Also fetch child decks
        const { data: childDecks } = await supabase.from('decks').select('*').in('parent_deck_id', deckIds).eq('is_archived', false);
        decks = [...(d ?? []), ...(childDecks ?? [])];
      }
      // Card counts
      const allDeckIds = decks.map((d: any) => d.id);
      const cardCountMap = new Map<string, { total: number; novo: number; facil: number; bom: number; dificil: number; errei: number }>();
      if (allDeckIds.length > 0) {
        const PAGE = 1000;
        for (let i = 0; i < allDeckIds.length; i += 200) {
          const batch = allDeckIds.slice(i, i + 200);
          let offset = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: cards } = await supabase.from('cards').select('deck_id, state, difficulty').in('deck_id', batch).range(offset, offset + PAGE - 1);
            for (const c of (cards ?? []) as any[]) {
              const entry = cardCountMap.get(c.deck_id) ?? { total: 0, novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
              entry.total++;
              if (c.state === 0) entry.novo++;
              else { const d = c.difficulty ?? 5; if (d <= 3) entry.facil++; else if (d <= 5) entry.bom++; else if (d <= 7) entry.dificil++; else entry.errei++; }
              cardCountMap.set(c.deck_id, entry);
            }
            hasMore = (cards?.length ?? 0) === PAGE;
            offset += PAGE;
          }
        }
      }
      // Map to DeckWithStats
      const deckStats = decks.filter((d: any) => !d.name?.includes('Caderno de Erros')).map((d: any) => {
        const cc = cardCountMap.get(d.id) ?? { total: 0, novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
        return {
          id: d.id, name: d.name, created_at: d.created_at, updated_at: d.updated_at,
          folder_id: d.folder_id, parent_deck_id: deckIds.includes(d.id) ? null : d.parent_deck_id,
          is_archived: d.is_archived, new_count: cc.novo, learning_count: 0, review_count: 0,
          reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0,
          daily_new_limit: d.daily_new_limit, daily_review_limit: d.daily_review_limit,
          total_cards: cc.total, mastered_cards: cc.total - cc.novo,
          class_novo: cc.novo, class_facil: cc.facil, class_bom: cc.bom, class_dificil: cc.dificil, class_errei: cc.errei,
        };
      });
      // Last updated
      let lastUpdated = '';
      for (const d of decks) { if ((d as any).updated_at > lastUpdated) lastUpdated = (d as any).updated_at; }
      return { ownerName, deckStats, lastUpdated, coverUrl: (turma as any).cover_image_url };
    },
    enabled: !!sourceTurmaId,
    staleTime: 60_000,
  });

  const [publishing, setPublishing] = useState(false);
  const handleTogglePublish = useCallback(async () => {
    if (!user || !state.currentFolderId) return;

    setPublishing(true);
    try {
      let turmaId = userTurma?.id;
      const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
      const folderName = currentFolder?.name ?? 'Minha Sala';
      const folderImage = currentFolder?.image_url ?? null;

      // Auto-create turma if user doesn't have one
      if (!turmaId) {
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: newTurma, error: createErr } = await supabase.from('turmas').insert({
          name: folderName,
          description: '',
          owner_id: user.id,
          invite_code: inviteCode,
          is_private: false,
          cover_image_url: folderImage,
        } as any).select('id').single();
        if (createErr || !newTurma) throw createErr || new Error('Failed to create turma');
        turmaId = (newTurma as any).id;
        // Add owner as admin member
        await supabase.from('turma_members').insert({
          turma_id: turmaId,
          user_id: user.id,
          role: 'admin',
        } as any);
      } else {
        const newPrivate = !userTurma!.is_private;
        await supabase.from('turmas').update({ is_private: newPrivate, name: folderName, cover_image_url: folderImage } as any).eq('id', turmaId);
        if (newPrivate) {
          // Unpublishing
          await refetchTurma();
          queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
          toast({ title: 'Sala despublicada' });
          setPublishing(false);
          return;
        }
      }

      // Publishing: sync folder decks to turma_decks
      const folderDecks = allDecks.filter(d => d.folder_id === state.currentFolderId && !d.is_archived && !d.parent_deck_id);
      const { data: existingTurmaDecks } = await supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId!);
      const existingIds = new Set((existingTurmaDecks ?? []).map((td: any) => td.deck_id));

      const newDecks = folderDecks.filter(d => !existingIds.has(d.id));
      if (newDecks.length > 0) {
        await supabase.from('turma_decks').insert(
          newDecks.map(d => ({
            turma_id: turmaId,
            deck_id: d.id,
            shared_by: user.id,
            price: 0,
            price_type: 'free',
            allow_download: true,
            is_published: true,
          }) as any)
        );
        await supabase.from('decks').update({ is_public: true } as any).in('id', newDecks.map(d => d.id));
      }

      await refetchTurma();
      queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
      toast({ title: '🌍 Sala publicada no Explorar!' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao publicar', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  }, [user, userTurma, state.currentFolderId, state.folders, allDecks, refetchTurma, queryClient, toast]);

  const [searchQuery, setSearchQuery] = useState('');
  const [detachTarget, setDetachTarget] = useState<{ id: string; name: string } | null>(null);
  const [detaching, setDetaching] = useState(false);
  const [studyWeightsOpen, setStudyWeightsOpen] = useState(false);
  const [studySalaSheetOpen, setStudySalaSheetOpen] = useState(false);
  const [studySettingsOpen, setStudySettingsOpen] = useState(false);
  const [salaImageOpen, setSalaImageOpen] = useState(false);
  const [salaImageFile, setSalaImageFile] = useState<File | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSlugEdit, setShareSlugEdit] = useState('');
  const [savingSlug, setSavingSlug] = useState(false);
  const [commAccordionId, setCommAccordionId] = useState<string | null>(null);
  const [pendingReviewData, setPendingReviewData] = useState<{
    pendingId: string;
    cards: GeneratedCard[];
    deckName: string;
    folderId: string | null;
    textSample?: string;
  } | null>(null);

  const activeSection = 'personal' as const;

  // Extracted actions hook
  const actions = useDashboardActions({ ...state, dashboardSection: activeSection }, defaultAlgorithm);

  // Handle query param actions (from StudyNowHero empty state buttons)
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'ai-deck') {
      state.setAiDeckOpen(true);
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    } else if (action === 'create-deck') {
      state.setCreateType('deck');
      state.setCreateName('');
      state.setCreateParentDeckId(null);
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    } else if (action === 'import') {
      state.setImportOpen(true);
      state.setImportDeckId(null);
      state.setImportDeckName('');
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    } else if (action === 'create-sala') {
      state.setCreateType('folder');
      state.setCreateName('');
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    }
  }, [searchParams]);

  // Handle payment return
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      toast({ title: '🎉 Pagamento realizado!', description: 'Seu status será atualizado em instantes.' });
      refreshStatus();
      setTimeout(refreshStatus, 5000);
      setSearchParams({}, { replace: true });
    } else if (payment === 'canceled') {
      toast({ title: 'Pagamento cancelado', description: 'Nenhuma cobrança foi feita.' });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, refreshStatus, setSearchParams, toast]);

  const handleDetachDeck = useCallback(async () => {
    if (!detachTarget) return;
    setDetaching(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Not authenticated');

      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', detachTarget.id).single();
      if (!originalDeck) throw new Error('Deck not found');

      const { data: newDeck, error } = await supabase.from('decks').insert({
        name: `${(originalDeck as any).name}`,
        user_id: currentUser.id,
      } as any).select().single();
      if (error || !newDeck) throw error || new Error('Failed to create deck');

      const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', detachTarget.id);
      if (cards && cards.length > 0) {
        const newCards = cards.map((c: any) => ({
          deck_id: (newDeck as any).id,
          front_content: c.front_content,
          back_content: c.back_content,
          card_type: c.card_type ?? 'basic',
        }));
        await supabase.from('cards').insert(newCards as any);
      }

      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Deck copiado!', description: 'Uma cópia pessoal independente foi criada.' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    } finally {
      setDetaching(false);
      setDetachTarget(null);
    }
  }, [detachTarget, queryClient, toast]);

  const handlePendingClick = useCallback((pending: PendingDeck) => {
    if (pending.status === 'review_ready' && pending.cards) {
      setPendingReviewData({
        pendingId: pending.id,
        cards: pending.cards as GeneratedCard[],
        deckName: pending.name,
        folderId: pending.folderId,
        textSample: pending.textSample,
      });
      state.setAiDeckOpen(true);
    }
  }, [state]);

  // Compute total due for the study button (use allRootDecks when at root level)
  const totalDueToday = useMemo(() => {
    const roots = state.isInsideSala ? state.currentDecks : state.allRootDecks;
    let total = 0;
    for (const deck of roots) {
      const s = state.getAggregateStats(deck);
      total += s.new_count + s.learning_count + s.review_count;
    }
    return total;
  }, [state.currentDecks, state.allRootDecks, state.isInsideSala, state.getAggregateStats]);

  // Collect all deck IDs in the current sala (including nested sub-decks)
  const salaDeckIds = useMemo(() => {
    if (!state.isInsideSala) return [] as string[];
    const ids: string[] = [];
    const collect = (deckId: string) => {
      ids.push(deckId);
      const children = allDecks.filter(d => d.parent_deck_id === deckId && !d.is_archived);
      for (const c of children) collect(c.id);
    };
    for (const deck of state.currentDecks) collect(deck.id);
    return ids;
  }, [state.isInsideSala, state.currentDecks, allDecks]);

  // Fetch difficulty-based classification for the sala's cards
  const { data: salaDifficultyStats } = useQuery({
    queryKey: ['sala-difficulty-stats', salaDeckIds.join(',')],
    queryFn: async () => {
      if (salaDeckIds.length === 0) return { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
      let novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0;
      const BATCH = 200;
      const PAGE = 1000;
      for (let i = 0; i < salaDeckIds.length; i += BATCH) {
        const batch = salaDeckIds.slice(i, i + BATCH);
        // Paginate to get ALL cards (Supabase default limit is 1000)
        let from = 0;
        while (true) {
          const { data } = await supabase
            .from('cards')
            .select('state, difficulty')
            .in('deck_id', batch)
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          for (const c of data) {
            if (c.state === 0) { novo++; continue; }
            const d = c.difficulty ?? 5;
            if (d <= 3) facil++;
            else if (d <= 5) bom++;
            else if (d <= 7) dificil++;
            else errei++;
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
      return { novo, facil, bom, dificil, errei };
    },
    enabled: salaDeckIds.length > 0,
    staleTime: 30_000,
  });

  // Sala-scoped study stats for the compact study card
  const salaStudyStats = useMemo(() => {
    if (!state.isInsideSala) return null;

    let rawNewCount = 0;
    let newCountTodayByDeckLimits = 0;
    let learningCount = 0;
    let reviewCount = 0;
    let reviewedToday = 0;
    let totalCards = 0;

    const collectTotalCards = (deckId: string): number => {
      const dk = allDecks.find(d => d.id === deckId);
      if (!dk) return 0;
      let t = dk.total_cards;
      const children = allDecks.filter(d => d.parent_deck_id === deckId && !d.is_archived);
      for (const c of children) t += collectTotalCards(c.id);
      return t;
    };

    const collectStudyStats = (deckId: string) => {
      const dk = allDecks.find(d => d.id === deckId);
      if (!dk || dk.is_archived) return;

      const deckNewCount = dk.new_count ?? 0;
      const deckLearningCount = dk.learning_count ?? 0;
      const deckReviewCount = dk.review_count ?? 0;
      const deckNewReviewedToday = dk.new_reviewed_today ?? 0;
      const deckDailyNewLimit = dk.daily_new_limit ?? 20;

      rawNewCount += deckNewCount;
      learningCount += deckLearningCount;
      reviewCount += deckReviewCount;
      reviewedToday += dk.reviewed_today ?? 0;

      const deckRemainingNewToday = Math.max(0, deckDailyNewLimit - deckNewReviewedToday);
      newCountTodayByDeckLimits += Math.min(deckNewCount, deckRemainingNewToday);

      const children = allDecks.filter(d => d.parent_deck_id === deckId && !d.is_archived);
      for (const c of children) collectStudyStats(c.id);
    };

    for (const deck of state.currentDecks) {
      collectStudyStats(deck.id);
      totalCards += collectTotalCards(deck.id);
    }

    // Global daily cap still applies across all decks/salas
    const newCountToday = Math.min(newCountTodayByDeckLimits, state.globalNewRemaining);
    const totalDue = newCountToday + learningCount + reviewCount;
    const totalSession = totalDue + reviewedToday;
    const progressPct = totalSession > 0 ? Math.round((reviewedToday / totalSession) * 100) : 0;

    // Use per-state time estimation (new cards generate multiple interactions, reviews may lapse)
    const remainingSeconds = calculateRealStudyTime(newCountToday, learningCount, reviewCount, realStudyMetrics);
    const remainingMin = Math.ceil(remainingSeconds / 60);
    const timeLabel = remainingMin >= 60
      ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
      : `${remainingMin}min`;

    // Difficulty-based classification — use sum of classifications as authoritative total
    const ds = salaDifficultyStats ?? { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
    const classifiedTotal = ds.novo + ds.facil + ds.bom + ds.dificil + ds.errei;
    // Use classified total when available (more accurate), fallback to deck stats
    const effectiveTotal = classifiedTotal > 0 ? classifiedTotal : totalCards;
    const masteredCount = effectiveTotal - ds.novo;

    return {
      newCount: rawNewCount,
      newCountToday,
      learningCount,
      reviewCount,
      reviewedToday,
      totalDue,
      progressPct,
      timeLabel,
      totalCards: effectiveTotal,
      masteredCount,
      ...ds,
    };
  }, [state.isInsideSala, state.currentDecks, allDecks, salaDifficultyStats, state.globalNewRemaining, realStudyMetrics]);

  // Handle sala click: navigate into it
  const handleSalaClick = useCallback((folderId: string) => {
    state.setCurrentFolderId(folderId);
  }, [state]);

  return (
    <div className="min-h-screen bg-background">
      {!state.isInsideSala && (
        <DashboardHeader 
          onCreditsOpen={() => { state.setPremiumTab('credits'); state.setPremiumOpen(true); }}
          onPremiumOpen={() => { state.setPremiumTab('plans'); state.setPremiumOpen(true); }}
        />
      )}

      <main className="pb-24">
        {/* Inside a Sala: Hero banner with image, name, creator, time estimate */}
        {state.isInsideSala && (() => {
          const cf = state.folders.find(f => f.id === state.currentFolderId);
          const folderName = cf?.name ?? 'Sala';
          const folderImage = cf?.image_url;
          const isComm = isCommunityFolder;
          const displayName = isComm ? (communityTurmaInfo?.ownerName ?? 'Criador') : (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Você');
          const avatarUrl = isComm ? undefined : (user?.user_metadata?.avatar_url as string | undefined);
          const heroImage = isComm ? (communityTurmaInfo?.coverUrl || folderImage) : folderImage;

          return (
            <>
              {/* Hero banner */}
              <div className="relative bg-muted/50 overflow-hidden">
                <div className="absolute inset-0">
                  <img src={heroImage || defaultSalaIcon} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
                  <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
                </div>

                <div className="relative px-4 pt-3 pb-4">
                  {/* Top bar */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => state.setCurrentFolderId(null)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Dashboard</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      {!isComm && (
                        <>
                          {/* Share button — only for own salas */}
                          <button
                            onClick={async () => {
                              let turmaId = userTurma?.id;
                              let slug = userTurma?.share_slug;
                              if (!turmaId) {
                                const cFolder = state.folders.find(f => f.id === state.currentFolderId);
                                const fName = cFolder?.name ?? 'Minha Sala';
                                const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                                const { data: newTurma } = await supabase.from('turmas').insert({
                                  name: fName, description: '', owner_id: user!.id,
                                  invite_code: inviteCode, is_private: true,
                                } as any).select('id, share_slug').single();
                                if (newTurma) {
                                  turmaId = (newTurma as any).id;
                                  slug = (newTurma as any).share_slug;
                                  await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user!.id, role: 'admin' } as any);
                                  await refetchTurma();
                                }
                              }
                              if (!slug && turmaId) {
                                const generated = turmaId.substring(0, 8);
                                await supabase.from('turmas').update({ share_slug: generated } as any).eq('id', turmaId);
                                slug = generated;
                                await refetchTurma();
                              }
                              setShareSlugEdit(slug || turmaId?.substring(0, 8) || '');
                              setShareModalOpen(true);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                            aria-label="Compartilhar link da sala"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => {
                                if (cf) { state.setRenameTarget({ type: 'folder', id: cf.id, name: cf.name }); state.setRenameName(cf.name); }
                              }}>
                                <Pencil className="h-4 w-4 mr-2" /> Renomear sala
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setSalaImageOpen(true)}>
                                <ImageIcon className="h-4 w-4 mr-2" /> Mudar imagem
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={handleTogglePublish} disabled={publishing}>
                                {userTurma?.is_private === false ? (
                                  <><EyeOff className="h-4 w-4 mr-2" /> Despublicar</>
                                ) : (
                                  <><Compass className="h-4 w-4 mr-2" /> Publicar no Explorar</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                await state.archiveFolder.mutateAsync(state.currentFolderId!);
                                state.setCurrentFolderId(null);
                                setSearchParams({}, { replace: true });
                              }}>
                                <Archive className="h-4 w-4 mr-2" /> Arquivar sala
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (cf) state.setDeleteTarget({ type: 'folder', id: cf.id, name: cf.name });
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir sala
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                      {isComm && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={async () => {
                                if (!user || !sourceTurmaId) return;
                                await supabase.from('turma_members').delete().eq('turma_id', sourceTurmaId).eq('user_id', user.id);
                                await supabase.from('folders').update({ source_turma_id: null, source_turma_subject_id: null } as any).eq('id', state.currentFolderId!);
                                await supabase.from('folders').delete().eq('id', state.currentFolderId!);
                                queryClient.invalidateQueries({ queryKey: ['folders'] });
                                queryClient.invalidateQueries({ queryKey: ['turma-members'] });
                                state.setCurrentFolderId(null);
                                setSearchParams({}, { replace: true });
                                toast({ title: 'Sala removida do seu menu Início' });
                              }}
                            >
                              <LogOut className="h-4 w-4 mr-2" /> Sair da sala
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Sala image + name */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="relative shrink-0">
                      <img src={heroImage || defaultSalaIcon} alt={folderName} className="h-14 w-14 rounded-xl object-cover border border-border/30 shadow-sm" />
                      {!isComm && (
                        <button
                          onClick={() => setSalaImageOpen(true)}
                          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Trocar imagem da sala"
                        >
                          <ImageIcon className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h1 className="text-lg font-display font-bold text-foreground truncate">{folderName}</h1>
                        {!isComm && (
                          <button
                            onClick={() => {
                              if (cf) { state.setRenameTarget({ type: 'folder', id: cf.id, name: cf.name }); state.setRenameName(cf.name); }
                            }}
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">Por</span>
                        <span className="text-xs font-medium text-foreground">{displayName}</span>
                        {!isComm && avatarUrl && (
                          <div className="h-5 w-5 rounded-full overflow-hidden bg-muted shrink-0">
                            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        )}
                      </div>
                      {isComm && communityTurmaInfo?.lastUpdated && (
                        <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                          <RefreshCw className="h-2.5 w-2.5" />
                          {(() => { try { return formatDistanceToNow(new Date(communityTurmaInfo.lastUpdated), { addSuffix: true, locale: ptBR }); } catch { return ''; } })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Time estimate with info tooltip */}
                  {salaStudyStats && salaStudyStats.totalDue > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground">~{salaStudyStats.timeLabel} restantes hoje</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <Info className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="text-xs w-56 p-2">
                          Tempo de estudo restante para completar os cartões novos e revisões configurados nos ajustes de hoje, com base na sua velocidade média de estudo.
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              </div>

              {/* Study bar with circle + button */}
              {salaStudyStats && (
                <div className="flex items-center gap-4 px-4 py-3 max-w-md mx-auto md:max-w-lg">
                  <button
                    onClick={() => setStudySettingsOpen(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                    aria-label="Configurar estudo"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>

                  {/* Circular 5-segment classification progress */}
                  {(() => {
                    const R = 22;
                    const C = 2 * Math.PI * R;
                    const total = salaStudyStats.totalCards;
                    const masteryPct = total > 0 ? Math.round((salaStudyStats.masteredCount / total) * 100) : 0;
                    if (total === 0) return (
                      <div className="relative shrink-0">
                        <svg width="52" height="52" viewBox="0 0 52 52" className="transform -rotate-90">
                          <circle cx="26" cy="26" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground tabular-nums">0%</span>
                      </div>
                    );
                    const segments = [
                      { pct: salaStudyStats.facil / total, color: 'hsl(var(--info))', key: 'facil' },
                      { pct: salaStudyStats.bom / total, color: 'hsl(var(--success))', key: 'bom' },
                      { pct: salaStudyStats.dificil / total, color: 'hsl(var(--warning))', key: 'dificil' },
                      { pct: salaStudyStats.errei / total, color: 'hsl(var(--destructive))', key: 'errei' },
                      { pct: salaStudyStats.novo / total, color: 'hsl(var(--muted))', key: 'novo' },
                    ];
                    let offset = 0;
                    return (
                      <div className="relative shrink-0">
                        <svg width="52" height="52" viewBox="0 0 52 52" className="transform -rotate-90">
                          <circle cx="26" cy="26" r={R} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="4" />
                          {segments.map(seg => {
                            const len = C * seg.pct;
                            if (len <= 0) return null;
                            const el = (
                              <circle
                                key={seg.key}
                                cx="26" cy="26" r={R} fill="none"
                                stroke={seg.color}
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeDasharray={`${len} ${C - len}`}
                                strokeDashoffset={`${-offset}`}
                                className="transition-all duration-700"
                              />
                            );
                            offset += len;
                            return el;
                          })}
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground tabular-nums">
                          {masteryPct}%
                        </span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              aria-label="Classificação dos cards"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3" side="bottom" align="start">
                            <p className="text-xs font-semibold text-foreground mb-2">Classificação dos cards</p>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full bg-info" />
                                  <span className="text-xs text-muted-foreground">Fácil</span>
                                </div>
                                <span className="text-xs font-semibold text-foreground">{salaStudyStats.facil}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full bg-success" />
                                  <span className="text-xs text-muted-foreground">Bom</span>
                                </div>
                                <span className="text-xs font-semibold text-foreground">{salaStudyStats.bom}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full bg-warning" />
                                  <span className="text-xs text-muted-foreground">Difícil</span>
                                </div>
                                <span className="text-xs font-semibold text-foreground">{salaStudyStats.dificil}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                                  <span className="text-xs text-muted-foreground">Errei</span>
                                </div>
                                <span className="text-xs font-semibold text-foreground">{salaStudyStats.errei}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                                  <span className="text-xs text-muted-foreground">Novo</span>
                                </div>
                                <span className="text-xs font-semibold text-foreground">{salaStudyStats.novo}</span>
                              </div>
                              <div className="border-t border-border/50 pt-2 mt-2 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Total de cards</span>
                                <span className="text-xs font-semibold text-foreground">{salaStudyStats.totalCards}</span>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  })()}

                  <Button
                    onClick={() => navigate(`/study/folder/${state.currentFolderId}`)}
                    className="flex-1 h-11 md:h-10 rounded-full text-base md:text-sm font-bold gap-2"
                    size="lg"
                    disabled={salaStudyStats.totalDue === 0}
                  >
                    ESTUDAR
                    <Play className="h-4 w-4 fill-current" />
                  </Button>
                </div>
              )}
            </>
          );
        })()}

        {/* Study CTA (root level only) */}
        {!state.isInsideSala && (
          <div className="flex items-center gap-3 px-4 py-4 max-w-md mx-auto md:max-w-lg">
            <button
              onClick={() => setStudyWeightsOpen(true)}
              className="flex h-9 w-9 md:h-8 md:w-8 items-center justify-center rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
              aria-label="Ajustar pesos"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <Button
              onClick={() => setStudySalaSheetOpen(true)}
              className="flex-1 h-11 md:h-10 rounded-full text-base md:text-sm font-bold gap-2"
              size="lg"
              disabled={totalDueToday === 0}
            >
              ESTUDAR
              <Play className="h-4 w-4 fill-current" />
            </Button>
          </div>
        )}

        {/* Root level: Sala List */}
        {!state.isInsideSala && (
          <SalaList
            folders={state.folders}
            decks={state.decks}
            isLoading={state.isLoading}
            getAggregateStats={state.getAggregateStats}
            onSalaClick={handleSalaClick}
          />
        )}

        {/* Inside Sala: Deck List */}
        {state.isInsideSala && !isCommunityFolder && (
          <DeckList
            isLoading={state.isLoading}
            currentDecks={state.currentDecks}
            searchQuery={searchQuery}
            deckSelectionMode={state.deckSelectionMode}
            selectedDeckIds={state.selectedDeckIds}
            expandedDecks={state.expandedDecks}
            toggleExpand={state.toggleExpand}
            toggleDeckSelection={state.toggleDeckSelection}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            getCommunityLinkId={state.getCommunityLinkId}
            navigateToCommunity={actions.handleNavigateCommunity}
            onCreateSubDeck={(deckId) => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(deckId); }}
            onRenameDeck={(d) => { state.setRenameTarget({ type: 'deck', id: d.id, name: d.name }); state.setRenameName(d.name); }}
            onMoveDeck={(d) => { state.setMoveTarget({ type: 'deck', id: d.id, name: d.name }); state.setMoveBrowseFolderId(d.folder_id || state.currentFolderId); state.setMoveParentDeckId(null); }}
            onArchiveDeck={(id) => state.archiveDeck.mutate(id)}
            onDeleteDeck={(d) => actions.handleDeleteDeckRequest(d)}
            onDetachCommunityDeck={(d) => setDetachTarget({ id: d.id, name: d.name })}
            onReorderDecks={(reordered) => state.reorderDecks.mutate(reordered.map(d => d.id))}
            onPendingClick={handlePendingClick}
            decksWithPendingUpdates={state.decksWithPendingUpdates}
          />
        )}

        {/* Community followed sala: show turma decks in readOnly mode */}
        {state.isInsideSala && isCommunityFolder && (() => {
          const cDecks = communityTurmaInfo?.deckStats ?? [];
          const cRootDecks = cDecks.filter((d: any) => !d.parent_deck_id);
          const cGetSubDecks = (parentId: string) => cDecks.filter((d: any) => d.parent_deck_id === parentId);
          const cGetAggStats = (deck: any) => ({ new_count: deck.new_count, learning_count: 0, review_count: 0, reviewed_today: 0 });
          const noop = () => {};
          const noopD = (_d: any) => {};
          const noopS = (_s: string) => {};
          const getCLinkId = (_d: any) => null as string | null;
          
          
          if (cRootDecks.length === 0) {
            return (
              <div className="px-4 pt-3">
                <div className="rounded-xl border border-dashed border-border py-8 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum deck publicado</p>
                </div>
              </div>
            );
          }

          return (
            <div className="divide-y divide-border/50">
              {cRootDecks.map((deck: any) => (
                <DeckRow
                  key={deck.id}
                  deck={deck}
                  readOnly
                  readOnlyNavState={{ from: 'dashboard-sala', folderId: state.currentFolderId }}
                  deckSelectionMode={false}
                  selectedDeckIds={new Set()}
                  toggleDeckSelection={noopS}
                  getSubDecks={cGetSubDecks}
                  getAggregateStats={cGetAggStats}
                  getCommunityLinkId={getCLinkId}
                  navigateToCommunity={noopS}
                  onCreateSubDeck={noopS}
                  onRename={noopD}
                  onMove={noopD}
                  onArchive={noopS}
                  onDelete={noopD}
                  expandedDecks={new Set()}
                  toggleExpand={noopS}
                  expandedAccordionId={commAccordionId}
                  onAccordionToggle={(id) => setCommAccordionId(prev => prev === id ? null : id)}
                />
              ))}
            </div>
          );
        })()}

        {/* Archived section */}
        {state.totalArchived > 0 && (
          <div className="mt-4 px-4">
            <button
              onClick={() => state.setShowArchived(!state.showArchived)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <Archive className="h-4 w-4" />
              <span>Arquivados ({state.totalArchived})</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${state.showArchived ? 'rotate-180' : ''}`} />
            </button>
            {state.showArchived && (
              <div className="rounded-xl border border-border/50 bg-card/50 shadow-sm divide-y divide-border/50 opacity-70">
                {/* At root level: show archived salas (folders) */}
                {!state.isInsideSala && state.archivedFolders.map(folder => (
                  <div key={folder.id} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-muted-foreground truncate">{folder.name}</h3>
                      <p className="text-xs text-muted-foreground">Sala arquivada</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => state.archiveFolder.mutate(folder.id)}>
                        <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => state.setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {/* Inside a sala: show archived decks */}
                {state.isInsideSala && state.archivedDecks.map(deck => (
                  <div key={deck.id} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-muted-foreground truncate">{deck.name}</h3>
                      <p className="text-xs text-muted-foreground">Baralho arquivado</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => state.archiveDeck.mutate(deck.id)}>
                        <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => actions.handleDeleteDeckRequest(deck)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Community recommendations — disabled until Explorar is ready */}
        {/* <CommunityRecommendations /> */}
      </main>

      <DashboardDialogs
        createType={state.createType} setCreateType={state.setCreateType}
        createName={state.createName} setCreateName={state.setCreateName}
        createParentDeckId={state.createParentDeckId} setCreateParentDeckId={state.setCreateParentDeckId}
        onCreateSubmit={actions.handleCreateSubmit}
        isCreating={state.createDeck.isPending || state.createFolder.isPending}
        renameTarget={state.renameTarget} setRenameTarget={state.setRenameTarget}
        renameName={state.renameName} setRenameName={state.setRenameName}
        onRenameSubmit={actions.handleRenameSubmit}
        moveTarget={state.moveTarget} setMoveTarget={state.setMoveTarget}
        moveBrowseFolderId={state.moveBrowseFolderId} setMoveBrowseFolderId={state.setMoveBrowseFolderId}
        moveParentDeckId={state.moveParentDeckId} setMoveParentDeckId={state.setMoveParentDeckId}
        moveBreadcrumb={state.moveBreadcrumb} movableFolders={state.movableFolders}
        movableDecks={state.movableDecks}
        folders={state.folders}
        decks={state.decks}
        onMoveSubmit={actions.handleMoveSubmit}
        onCreateFolderInMove={() => { state.setCreateType('folder'); state.setCreateName(''); }}
        deleteTarget={state.deleteTarget} setDeleteTarget={state.setDeleteTarget}
        onDeleteSubmit={async () => {
          const isFolder = state.deleteTarget?.type === 'folder';
          await actions.handleDeleteSubmit();
          if (isFolder) {
            state.setCurrentFolderId(null);
            setSearchParams({}, { replace: true });
          }
        }}
        duplicateWarning={state.duplicateWarning} setDuplicateWarning={state.setDuplicateWarning}
        setCreateNameFromDuplicate={state.setCreateName}
        bulkMoveDeckOpen={state.bulkMoveDeckOpen} setBulkMoveDeckOpen={state.setBulkMoveDeckOpen}
        bulkMoveTargetFolder={state.bulkMoveTargetFolder} setBulkMoveTargetFolder={state.setBulkMoveTargetFolder}
        selectedDeckCount={state.selectedDeckIds.size}
        onBulkMoveSubmit={actions.handleBulkMoveSubmit}
      />

      <Suspense fallback={null}>
        {state.importOpen && (
          <ImportCardsDialog
            open={state.importOpen} onOpenChange={state.setImportOpen}
            onImport={async (deckName, cards, subdecks, revlog) => {
              const pendingStore = usePendingDecks.getState();
              const pendingId = `import-${Date.now()}`;
              const totalCards = subdecks && subdecks.length > 0
                ? subdecks.reduce(function cntAll(s: number, n: any): number { return s + (n.card_indices?.length || 0) + (n.children?.length ? n.children.reduce(cntAll, 0) : 0); }, 0)
                : cards.length;

              pendingStore.addPending({
                id: pendingId,
                name: deckName,
                folderId: null,
                status: 'saving',
                progress: { current: 0, total: totalCards },
              });

              state.setImportOpen(false);

              try {
                const { data: { user } } = await (await import('@/integrations/supabase/client')).supabase.auth.getUser();
                const progressCb = (current: number, total: number) => {
                  pendingStore.updatePending(pendingId, { progress: { current, total } });
                };
                let result: { insertedCount: number; totalCards: number };
                if (subdecks && subdecks.length > 0) {
                  const r = await importDeckWithSubdecks(
                    user!.id, deckName, null,
                    cards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType, progress: (c as any).progress })),
                    subdecks, defaultAlgorithm, revlog as any, progressCb,
                  );
                  result = { insertedCount: r.insertedCount, totalCards: r.totalCards };
                } else {
                  const r = await importDeck(
                    user!.id, deckName, null,
                    cards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType, progress: (c as any).progress })),
                    defaultAlgorithm, revlog as any, progressCb,
                  );
                  result = { insertedCount: r.insertedCount, totalCards: r.totalCards };
                }
                const revlogMsg = revlog ? ` + ${revlog.length.toLocaleString()} revisões` : '';
                const failedCount = result.totalCards - result.insertedCount;
                if (failedCount > 0) {
                  toast({ title: `${result.insertedCount.toLocaleString()} cartões importados (${failedCount} falharam)`, description: `Importado em "${deckName}"${revlogMsg}`, variant: 'destructive' });
                } else {
                  toast({ title: `${result.insertedCount.toLocaleString()} cartões importados!`, description: `${deckName}${revlogMsg}` });
                }
                pendingStore.updatePending(pendingId, { status: 'done', progress: { current: result.insertedCount, total: result.totalCards } });
                await queryClient.invalidateQueries({ queryKey: ['decks'] });
                await queryClient.invalidateQueries({ queryKey: ['allDeckStats'] });
                setTimeout(() => pendingStore.removePending(pendingId), 2000);
              } catch (err) {
                console.error('Import error:', err);
                pendingStore.updatePending(pendingId, { status: 'error' });
                toast({ title: 'Erro ao importar', description: 'Toque no item para remover.', variant: 'destructive' });
              }
            }}
          />
        )}
      </Suspense>

      <Suspense fallback={<SuspenseLoading />}>
        {state.aiDeckOpen && (
          <AICreateDeckDialog
            open={state.aiDeckOpen}
            onOpenChange={(open) => {
              state.setAiDeckOpen(open);
              if (!open) setPendingReviewData(null);
            }}
            folderId={pendingReviewData?.folderId ?? null}
            pendingReviewData={pendingReviewData}
          />
        )}
      </Suspense>
      <Suspense fallback={<SuspenseLoading />}>
        {state.premiumOpen && <PremiumModal open={state.premiumOpen} onClose={() => state.setPremiumOpen(false)} defaultTab={state.premiumTab} />}
      </Suspense>


      <Suspense fallback={null}>
        {studyWeightsOpen && (
          <StudyWeightsSheet
            open={studyWeightsOpen}
            onOpenChange={setStudyWeightsOpen}
            folders={state.folders}
            decks={state.decks}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            currentFolderId={state.currentFolderId}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {studySalaSheetOpen && (
          <StudySalaSheet
            open={studySalaSheetOpen}
            onOpenChange={setStudySalaSheetOpen}
            folders={state.folders}
            decks={state.decks}
            getAggregateStats={state.getAggregateStats}
            globalNewRemaining={state.globalNewRemaining}
            avgSecondsPerCard={avgSecondsPerCard}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {studySettingsOpen && (
          <StudySettingsSheet
            open={studySettingsOpen}
            onOpenChange={setStudySettingsOpen}
            decks={state.decks}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            currentFolderId={state.currentFolderId}
          />
        )}
      </Suspense>

      <AlertDialog open={!!detachTarget} onOpenChange={(open) => !open && setDetachTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar para meu deck pessoal</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Uma cópia independente de <strong>"{detachTarget?.name}"</strong> será criada no seu deck pessoal.</p>
              <p>A cópia:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Será um deck <strong>pessoal e editável</strong></li>
                <li><strong>Não receberá</strong> atualizações automáticas da comunidade</li>
                <li>O deck original da comunidade <strong>permanecerá intacto</strong></li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={detaching}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDetachDeck} disabled={detaching}>
              {detaching ? 'Copiando...' : 'Confirmar cópia'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sala image change dialog */}
      <Dialog open={salaImageOpen} onOpenChange={setSalaImageOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mudar imagem da sala</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:bg-muted/30 transition-colors">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {salaImageFile ? salaImageFile.name : 'Selecionar imagem'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setSalaImageFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              className="w-full"
              disabled={!salaImageFile}
              onClick={async () => {
                if (!salaImageFile || !state.currentFolderId) return;
                try {
                  const ext = salaImageFile.name.split('.').pop() || 'jpg';
                  const filePath = `sala-images/${state.currentFolderId}.${ext}`;
                  const { error: uploadErr } = await supabase.storage
                    .from('deck-covers')
                    .upload(filePath, salaImageFile, { upsert: true });
                  if (uploadErr) throw uploadErr;
                  const { data: urlData } = supabase.storage.from('deck-covers').getPublicUrl(filePath);
                  const imageUrl = urlData.publicUrl + '?t=' + Date.now();
                  await supabase.from('folders').update({ image_url: imageUrl } as any).eq('id', state.currentFolderId);
                  await queryClient.invalidateQueries({ queryKey: ['folders'] });
                  toast({ title: 'Imagem atualizada!' });
                  setSalaImageOpen(false);
                  setSalaImageFile(null);
                } catch (err) {
                  console.error(err);
                  toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
                }
              }}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share link modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Compartilhar sala</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Slug do link</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{window.location.origin}/c/</span>
                <input
                  type="text"
                  value={shareSlugEdit}
                  onChange={(e) => setShareSlugEdit(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase())}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="meu-link"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  const link = `${window.location.origin}/c/${shareSlugEdit}`;
                  await navigator.clipboard.writeText(link);
                  toast({ title: '🔗 Link copiado!' });
                }}
              >
                Copiar link
              </Button>
              <Button
                className="flex-1"
                disabled={savingSlug || !shareSlugEdit}
                onClick={async () => {
                  if (!userTurma?.id || !shareSlugEdit) return;
                  setSavingSlug(true);
                  try {
                    await supabase.from('turmas').update({ share_slug: shareSlugEdit } as any).eq('id', userTurma.id);
                    await refetchTurma();
                    toast({ title: 'Link atualizado!' });
                    setShareModalOpen(false);
                  } catch {
                    toast({ title: 'Erro ao salvar', variant: 'destructive' });
                  } finally {
                    setSavingSlug(false);
                  }
                }}
              >
                {savingSlug ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
