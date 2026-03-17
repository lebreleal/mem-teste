// ============= Refactored Dashboard.tsx =============

import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronDown, ChevronLeft, Trash2, Play, SlidersHorizontal, MoreVertical, Pencil, ImageIcon, SquarePlus, RotateCcw, Layers, Clock, Info, User, Compass, EyeOff, Share2, RefreshCw, LogOut, Sparkles } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getNewCardsForDayGlobal } from '@/hooks/useStudyPlan';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { showGlobalLoading, hideGlobalLoading } from '@/components/GlobalLoading';
import { useSubscription } from '@/hooks/useSubscription';
import { useStudyPlan } from '@/hooks/useStudyPlan';
// useDecks removed — state.decks from useDashboardState is the single source of truth
import { fetchUserOwnTurma, fetchCommunityFolderInfo, createTurmaWithOwner, updateTurma, publishDecksToTurma, removeTurmaMember, ensureShareSlug } from '@/services/turma/turmaCrud';
import { clearFolderTurmaLink, deleteFolder, uploadFolderImage } from '@/services/folderService';
import { detachCommunityDeck } from '@/services/deck/deckCrud';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  // planRootIds computed after state is created (uses state.decks)
  const planRootIdsRef = useRef<Set<string> | undefined>(undefined);

  const planDeckOrderEarly = useMemo(() => plans.flatMap(p => p.deck_ids ?? []), [plans]);
  const state = useDashboardState(planRootIdsRef.current, planDeckOrderEarly);

  // Compute planRootIds using state.decks (single source) — update ref for next render
  const planRootIds = useMemo(() => {
    if (plans.length === 0 || state.decks.length === 0) return undefined;
    const deckMap = state.deckMap;
    const getRootIdLocal = (deckId: string): string | null => {
      const d = deckMap.get(deckId);
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
  }, [plans, allDeckIds, state.decks, state.deckMap]);

  // Keep ref in sync for the next render cycle
  planRootIdsRef.current = planRootIds;
  const { isPremium, refreshStatus } = useSubscription();
  const { missions } = useMissions();
  const { isAdmin } = useIsAdmin();
  const defaultAlgorithm = isPremium ? 'fsrs' : 'sm2';

  const claimableCount = missions.filter(m => m.isCompleted && !m.isClaimed).length;

  // Error notebook count (cards in the error deck)
  const { data: errorCount = 0 } = useQuery({
    queryKey: ['error-notebook-count'],
    queryFn: async () => {
      if (!user) return 0;
      const { getErrorDeckCount } = await import('@/services/errorDeckService');
      return getErrorDeckCount(user.id);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Fetch user's turma for publish toggle
  const { data: userTurma, refetch: refetchTurma } = useQuery({
    queryKey: ['user-turma', user?.id],
    queryFn: () => fetchUserOwnTurma(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Detect if current folder is a community-followed sala
  const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
  const sourceTurmaId = currentFolder?.source_turma_id;
  const isCommunityFolder = !!sourceTurmaId;

  // Fetch turma info (owner name, cover) for community folders — lightweight query
  const { data: communityTurmaInfo } = useQuery({
    queryKey: ['community-folder-turma-info', sourceTurmaId],
    queryFn: () => fetchCommunityFolderInfo(sourceTurmaId!),
    enabled: !!sourceTurmaId,
    staleTime: 60_000,
  });

  // Auto-bootstrap: ensure local deck copies exist for community folders
  const bootstrapDoneRef = useRef(new Set<string>());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!user || !isCommunityFolder || !sourceTurmaId || !state.currentFolderId) return;
    if (bootstrapDoneRef.current.has(state.currentFolderId)) return;
    bootstrapDoneRef.current.add(state.currentFolderId);
    
    // Check if local decks already exist in this folder
    const localDecksInFolder = state.decks.filter(d => d.folder_id === state.currentFolderId && !d.is_archived);
    if (localDecksInFolder.length > 0) {
      // Decks exist — debounce incremental sync (2s delay, non-blocking)
      syncTimerRef.current = setTimeout(() => {
        import('@/services/followerBootstrap').then(({ syncFollowerDecks }) => {
          syncFollowerDecks(user.id, state.currentFolderId!).then((newCards) => {
            if (newCards > 0) {
              queryClient.invalidateQueries({ queryKey: ['decks'] });
              toast({ title: `${newCards} novos cartões sincronizados!` });
            }
          }).catch(console.error);
        });
      }, 2000);
      return;
    }
    
    // No local decks — run full bootstrap (immediate)
    import('@/services/followerBootstrap').then(({ bootstrapFollowerDecks }) => {
      bootstrapFollowerDecks(user.id, sourceTurmaId, state.currentFolderId!).then((result) => {
        if (result.decks_created > 0) {
          queryClient.invalidateQueries({ queryKey: ['decks'] });
        }
      }).catch((err) => {
        console.error(err);
        toast({ title: 'Erro ao carregar decks da sala. Tente recarregar a página.', variant: 'destructive' });
      });
    });
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [user, isCommunityFolder, sourceTurmaId, state.currentFolderId]);


  // Leave sala confirmation
  const [leaveSalaConfirm, setLeaveSalaConfirm] = useState<{ folderId: string; turmaId: string } | null>(null);
  const handleLeaveSala = async () => {
    if (!user || !leaveSalaConfirm) return;
    const { folderId, turmaId } = leaveSalaConfirm;
    try {
      // Cleanup local mirrored decks and cards first
      const { cleanupFollowerDecks } = await import('@/services/followerBootstrap');
      await cleanupFollowerDecks(user.id, folderId);
      
      await removeTurmaMember(turmaId, user.id);
      await clearFolderTurmaLink(folderId);
      await deleteFolder(folderId);
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['turmas'] });
      queryClient.invalidateQueries({ queryKey: ['turma-members'] });
      queryClient.invalidateQueries({ queryKey: ['turma-role'] });
      queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
      queryClient.invalidateQueries({ queryKey: ['turma-public'] });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      state.setCurrentFolderId(null);
      setSearchParams({}, { replace: true });
      toast({ title: 'Sala removida do seu menu Início', description: 'Suas estatísticas e progresso ficam salvos por 30 dias.' });
    } catch (e: any) {
      toast({ title: 'Erro ao sair da sala', variant: 'destructive' });
    } finally {
      setLeaveSalaConfirm(null);
    }
  };

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
        const newTurma = await createTurmaWithOwner(user.id, folderName, { isPrivate: false, coverImageUrl: folderImage });
        turmaId = newTurma.id;
      } else {
        const newPrivate = !userTurma!.is_private;
        await updateTurma(turmaId, { isPrivate: newPrivate, name: folderName, coverImageUrl: folderImage ?? undefined });
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
      const folderDecks = state.decks.filter(d => d.folder_id === state.currentFolderId && !d.is_archived && !d.parent_deck_id);
      await publishDecksToTurma(turmaId!, user.id, folderDecks.map(d => d.id));

      await refetchTurma();
      queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
      toast({ title: '🌍 Sala publicada no Explorar!' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao publicar', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  }, [user, userTurma, state.currentFolderId, state.folders, state.decks, refetchTurma, queryClient, toast]);

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
  
  const [pendingReviewData, setPendingReviewData] = useState<{
    pendingId: string;
    cards: GeneratedCard[];
    deckName: string;
    folderId: string | null;
    textSample?: string;
  } | null>(null);
  const [aiDeckParentId, setAiDeckParentId] = useState<string | null>(null);
  const [aiDeckParentName, setAiDeckParentName] = useState<string | null>(null);

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

  // Listen for "+" button inside own sala → open add menu sheet
  const [salaAddMenuOpen, setSalaAddMenuOpen] = useState(false);
  const [addMenuStep, setAddMenuStep] = useState<'main' | 'create-deck'>('main');
  const [addMenuInfoType, setAddMenuInfoType] = useState<'deck' | 'materia' | 'deck-manual' | 'deck-ia' | null>(null);
  useEffect(() => {
    const handler = () => {
      if (state.isInsideSala && !isCommunityFolder) {
        setSalaAddMenuOpen(true);
      }
    };
    window.addEventListener('open-sala-add-menu', handler);
    return () => window.removeEventListener('open-sala-add-menu', handler);
  }, [state.isInsideSala, isCommunityFolder]);

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
    if (!detachTarget || !user) return;
    setDetaching(true);
    try {
      await detachCommunityDeck(user.id, detachTarget.id);
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Deck copiado!', description: 'Uma cópia pessoal independente foi criada.' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    } finally {
      setDetaching(false);
      setDetachTarget(null);
    }
  }, [detachTarget, user, queryClient, toast]);

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

  // Collect all deck IDs in the current sala (including nested sub-decks) — O(1) via childrenIndex
  const salaDeckIds = useMemo(() => {
    if (!state.isInsideSala) return [] as string[];
    const ids: string[] = [];
    const childrenIndex = state.childrenIndex;
    const collect = (deckId: string) => {
      ids.push(deckId);
      const children = childrenIndex.get(deckId) ?? [];
      for (const c of children) { if (!c.is_archived) collect(c.id); }
    };
    for (const deck of state.currentDecks) collect(deck.id);
    return ids;
  }, [state.isInsideSala, state.currentDecks, state.childrenIndex]);

  // Compute difficulty stats from already-loaded deck data (no extra query) — O(n) via deckMap
  const salaDifficultyStats = useMemo(() => {
    if (salaDeckIds.length === 0) return { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
    const deckMap = state.deckMap;
    let novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0;
    for (const id of salaDeckIds) {
      const dk = deckMap.get(id);
      if (!dk) continue;
      novo += dk.class_novo ?? 0;
      facil += dk.class_facil ?? 0;
      bom += dk.class_bom ?? 0;
      dificil += dk.class_dificil ?? 0;
      errei += dk.class_errei ?? 0;
    }
    return { novo, facil, bom, dificil, errei };
  }, [salaDeckIds, state.deckMap]);

  // Sala-scoped study stats for the compact study card
  const salaStudyStats = useMemo(() => {
    if (!state.isInsideSala) return null;
    const deckMap = state.deckMap;
    const childrenIndex = state.childrenIndex;

    let rawNewCount = 0;
    let newCountTodayByDeckLimits = 0;
    let learningCount = 0;
    let reviewCount = 0;
    let reviewedToday = 0;
    let totalCards = 0;

    const collectTotalCards = (deckId: string): number => {
      const dk = deckMap.get(deckId);
      if (!dk) return 0;
      let t = dk.total_cards;
      for (const c of (childrenIndex.get(deckId) ?? [])) { if (!c.is_archived) t += collectTotalCards(c.id); }
      return t;
    };

    let totalDailyReviewLimit = 0;
    let totalReviewReviewedToday = 0;

    const collectHierarchyNew = (parentId: string): { newCount: number; newReviewed: number } => {
      let nc = 0, nr = 0;
      for (const c of (childrenIndex.get(parentId) ?? [])) {
        if (c.is_archived) continue;
        nc += c.new_count ?? 0;
        nr += c.new_reviewed_today ?? 0;
        const sub = collectHierarchyNew(c.id);
        nc += sub.newCount;
        nr += sub.newReviewed;
      }
      return { newCount: nc, newReviewed: nr };
    };

    const collectStudyStats = (deckId: string, isRoot: boolean) => {
      const dk = deckMap.get(deckId);
      if (!dk || dk.is_archived) return;

      learningCount += dk.learning_count ?? 0;
      reviewCount += dk.review_count ?? 0;
      reviewedToday += dk.reviewed_today ?? 0;
      const deckNewGraduatedToday = dk.new_graduated_today ?? 0;
      totalReviewReviewedToday += Math.max(0, (dk.reviewed_today ?? 0) - deckNewGraduatedToday);

      if (isRoot) {
        totalDailyReviewLimit += dk.daily_review_limit ?? 100;
        let hierarchyNewCount = dk.new_count ?? 0;
        let hierarchyNewReviewed = dk.new_reviewed_today ?? 0;
        const childNew = collectHierarchyNew(deckId);
        hierarchyNewCount += childNew.newCount;
        hierarchyNewReviewed += childNew.newReviewed;
        rawNewCount += hierarchyNewCount;
        const remaining = Math.max(0, (dk.daily_new_limit ?? 20) - hierarchyNewReviewed);
        newCountTodayByDeckLimits += Math.min(hierarchyNewCount, remaining);
      }

      for (const c of (childrenIndex.get(deckId) ?? [])) { if (!c.is_archived) collectStudyStats(c.id, false); }
    };

    for (const deck of state.currentDecks) {
      collectStudyStats(deck.id, true);
      totalCards += collectTotalCards(deck.id);
    }

    const newCountToday = newCountTodayByDeckLimits;
    const cappedReviewCount = Math.max(0, Math.min(reviewCount, totalDailyReviewLimit - totalReviewReviewedToday));
    const totalDue = newCountToday + learningCount + cappedReviewCount;
    const totalSession = totalDue + reviewedToday;
    const progressPct = totalSession > 0 ? Math.round((reviewedToday / totalSession) * 100) : 0;

    const remainingSeconds = calculateRealStudyTime(newCountToday, learningCount, cappedReviewCount, realStudyMetrics);
    const remainingMin = Math.ceil(remainingSeconds / 60);
    const timeLabel = remainingMin >= 60
      ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
      : `${remainingMin}min`;

    const ds = salaDifficultyStats ?? { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
    const classifiedTotal = ds.novo + ds.facil + ds.bom + ds.dificil + ds.errei;
    const effectiveTotal = classifiedTotal > 0 ? classifiedTotal : totalCards;
    const masteredCount = effectiveTotal - ds.novo;

    return {
      newCount: rawNewCount, newCountToday, learningCount, reviewCount, reviewedToday,
      totalDue, progressPct, timeLabel, totalCards: effectiveTotal, masteredCount, ...ds,
    };
  }, [state.isInsideSala, state.currentDecks, state.deckMap, state.childrenIndex, salaDifficultyStats, realStudyMetrics]);

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
                              onClick={() => setLeaveSalaConfirm({ folderId: state.currentFolderId!, turmaId: sourceTurmaId! })}
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

        {/* Inside Sala: Deck List (unified for own + community folders) */}
        {state.isInsideSala && (
          <DeckList
            isLoading={state.isLoading}
            currentDecks={state.currentDecks}
            searchQuery={searchQuery}
            deckSelectionMode={isCommunityFolder ? false : state.deckSelectionMode}
            selectedDeckIds={isCommunityFolder ? new Set<string>() : state.selectedDeckIds}
            expandedDecks={state.expandedDecks}
            toggleExpand={state.toggleExpand}
            toggleDeckSelection={state.toggleDeckSelection}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            getCommunityLinkId={state.getCommunityLinkId}
            navigateToCommunity={actions.handleNavigateCommunity}
            onCreateSubDeck={isCommunityFolder ? () => {} : (deckId) => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(deckId); }}
            onCreateSubDeckAI={isCommunityFolder ? undefined : (deckId) => {
              const parentDeck = state.decks.find(d => d.id === deckId);
              setAiDeckParentId(deckId);
              setAiDeckParentName(parentDeck?.name ?? null);
              state.setAiDeckOpen(true);
            }}
            onRenameDeck={isCommunityFolder ? () => {} : (d) => { state.setRenameTarget({ type: 'deck', id: d.id, name: d.name }); state.setRenameName(d.name); }}
            onMoveDeck={isCommunityFolder ? () => {} : (d) => { state.setMoveTarget({ type: 'deck', id: d.id, name: d.name }); state.setMoveBrowseFolderId(d.folder_id || state.currentFolderId); state.setMoveParentDeckId(null); }}
            onArchiveDeck={isCommunityFolder ? () => {} : (id) => state.archiveDeck.mutate(id)}
            onDeleteDeck={isCommunityFolder ? () => {} : (d) => actions.handleDeleteDeckRequest(d)}
            onDetachCommunityDeck={isCommunityFolder ? undefined : (d) => setDetachTarget({ id: d.id, name: d.name })}
            onReorderDecks={isCommunityFolder ? undefined : (reordered) => state.reorderDecks.mutate(reordered.map(d => d.id))}
            onPendingClick={handlePendingClick}
            decksWithPendingUpdates={state.decksWithPendingUpdates}
          />
        )}

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
              if (!open) { setPendingReviewData(null); setAiDeckParentId(null); setAiDeckParentName(null); }
            }}
            folderId={pendingReviewData?.folderId ?? state.currentFolderId}
            existingDeckId={aiDeckParentId}
            existingDeckName={aiDeckParentName}
            pendingReviewData={pendingReviewData}
          />
        )}
      </Suspense>
      <Suspense fallback={<SuspenseLoading />}>
        {state.premiumOpen && <PremiumModal open={state.premiumOpen} onClose={() => state.setPremiumOpen(false)} defaultTab={state.premiumTab} />}
      </Suspense>

      {/* Info modal for add menu items */}
      <Dialog open={addMenuInfoType !== null} onOpenChange={(v) => { if (!v) setAddMenuInfoType(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
               {addMenuInfoType === 'materia' && 'O que é uma Matéria?'}
               {addMenuInfoType === 'deck' && 'O que é um Baralho?'}
               {addMenuInfoType === 'deck-manual' && 'Criar baralho manualmente'}
               {addMenuInfoType === 'deck-ia' && 'Criar baralho com IA'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-2 space-y-2">
              {addMenuInfoType === 'materia' && (
                <>
                  <p>Uma <strong>Matéria</strong> é um agrupador que organiza seus decks por tema ou disciplina.</p>
                  <p>Por exemplo, dentro da matéria <em>"Farmacologia"</em> você pode ter os decks <em>"Antibióticos"</em>, <em>"Anti-inflamatórios"</em>, etc.</p>
                  <p>Ao estudar, você pode revisar todos os decks de uma matéria de uma só vez.</p>
                </>
              )}
               {addMenuInfoType === 'deck' && (
                 <>
                   <p>Um <strong>Baralho</strong> é um conjunto de flashcards sobre um assunto específico.</p>
                   <p>Você pode criar baralhos manualmente ou usar a IA para gerar cartões automaticamente.</p>
                 </>
               )}
               {addMenuInfoType === 'deck-manual' && (
                 <>
                   <p>Você escolhe o nome do baralho e adiciona os cartões (flashcards) um a um.</p>
                   <p>Ideal quando você quer ter controle total sobre o conteúdo dos seus cartões.</p>
                 </>
               )}
              {addMenuInfoType === 'deck-ia' && (
                <>
                  <p>Envie seu material de estudo (PDF, imagem ou texto) e a inteligência artificial gera os cartões automaticamente.</p>
                  <p>Ideal para transformar anotações, slides ou apostilas em flashcards rapidamente.</p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

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
                  await uploadFolderImage(state.currentFolderId, salaImageFile);
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

      {/* Leave Sala Confirmation */}
      <AlertDialog open={!!leaveSalaConfirm} onOpenChange={(open) => { if (!open) setLeaveSalaConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da sala?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Tem certeza que deseja sair desta sala?</span>
              <span className="block text-sm font-medium text-foreground/80 mt-2">
                📊 Suas estatísticas e progresso de estudo ficam salvos por 30 dias. Se voltar a entrar nesse período, tudo estará como antes.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeaveSala} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sair da sala
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add menu sheet for own sala */}
      <Sheet open={salaAddMenuOpen} onOpenChange={(v) => { setSalaAddMenuOpen(v); if (!v) setAddMenuStep('main'); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-4">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base font-bold">
              {addMenuStep === 'main' ? 'Adicionar' : 'Criar baralho'}
            </SheetTitle>
          </SheetHeader>

          {addMenuStep === 'main' && (
            <div className="flex flex-col gap-1">
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => setAddMenuStep('create-deck')}
              >
                <span className="text-sm font-medium text-foreground">Criar baralho</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setAddMenuInfoType('deck'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { setSalaAddMenuOpen(false); setAddMenuStep('main'); state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId('__materia__'); }}
              >
                <span className="text-sm font-medium text-foreground">Criar matéria</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setAddMenuInfoType('materia'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { setSalaAddMenuOpen(false); setAddMenuStep('main'); state.setImportOpen(true); state.setImportDeckId(null); state.setImportDeckName(''); }}
              >
                <span className="text-sm font-medium text-foreground">Importar cartões</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
            </div>
          )}

          {addMenuStep === 'create-deck' && (
            <div className="flex flex-col gap-1">
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { setSalaAddMenuOpen(false); setAddMenuStep('main'); state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(null); }}
              >
                <span className="text-sm font-medium text-foreground">Criar baralho manualmente</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setAddMenuInfoType('deck-manual'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <button
                className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
                onClick={() => { setSalaAddMenuOpen(false); setAddMenuStep('main'); state.setAiDeckOpen(true); }}
              >
                <span className="text-sm font-medium text-foreground">Criar baralho com IA</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setAddMenuInfoType('deck-ia'); }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 ml-auto shrink-0" />
              </button>
              <Button variant="ghost" size="sm" className="mt-2 self-start text-xs gap-1" onClick={() => setAddMenuStep('main')}>
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
