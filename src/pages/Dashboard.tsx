// ============= Refactored Dashboard.tsx =============

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getNewCardsForDayGlobal } from '@/hooks/useStudyPlan';
import { Users, GraduationCap, BookOpen, Archive, ArchiveRestore, ChevronDown, FolderOpen, Trash2, CalendarCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '@/components/GlobalLoading';
import { useEffect } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';


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


import { useDashboardState } from '@/components/dashboard/useDashboardState';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardActions from '@/components/dashboard/DashboardActions';
import DeckList from '@/components/dashboard/DeckList';
import DashboardDialogs from '@/components/dashboard/DashboardDialogs';
const PremiumModal = lazy(() => import('@/components/dashboard/PremiumModal'));
const CommunityDeleteBlockDialog = lazy(() => import('@/components/CommunityDeleteBlockDialog'));
import DeckCarousel from '@/components/dashboard/DeckCarousel';

import { renameDeck, deleteDeckCascade, deleteFolderCascade, bulkMoveDecks, bulkArchiveDecks, bulkDeleteDecks, importDeck, importDeckWithSubdecks, getTurmaDeckNavInfo } from '@/services/deckService';
import { usePendingDecks } from '@/stores/usePendingDecks';
import { supabase } from '@/integrations/supabase/client';
import { useMissions } from '@/hooks/useMissions';
import { useIsAdmin } from '@/hooks/useIsAdmin';

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plans, allDeckIds, avgSecondsPerCard, metrics, globalCapacity } = useStudyPlan();
  const { decks: allDecks } = useDecks();
  
  // Compute plan root IDs for scoping global new-card counting
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

  // Carousel helpers
  const hasPlan = plans.length > 0;
  const planDeckIds = allDeckIds;
  const planDeckOrder = useMemo(() => {
    return plans.flatMap(p => p.deck_ids ?? []);
  }, [plans]);
  const plansByDeckId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of plans) {
      for (const id of (p.deck_ids ?? [])) {
        if (!map[id]) map[id] = p.name;
      }
    }
    return map;
  }, [plans]);
  const getRootId = useCallback((deckId: string): string | null => {
    const d = (allDecks ?? []).find(x => x.id === deckId);
    if (!d) return null;
    if (!d.parent_deck_id) return d.id;
    return getRootId(d.parent_deck_id);
  }, [allDecks]);
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
  }, [searchParams]);

  const defaultAlgorithm = isPremium ? 'fsrs' : 'sm2';
  const claimableCount = missions.filter(m => m.isCompleted && !m.isClaimed).length;
  const [searchQuery, setSearchQuery] = useState('');
  const [dashboardTab, setDashboardTab] = useState<'personal' | 'community'>('personal');
  const [communityBlockTarget, setCommunityBlockTarget] = useState<{ id: string; name: string; type: 'deck' | 'folder' } | null>(null);

  // Handlers that perform side effects or complex logic
  const doCreate = (name: string) => {
    if (state.createType === 'deck') {
      state.createDeck.mutate(
        { name, folderId: state.createParentDeckId ? null : state.currentFolderId, parentDeckId: state.createParentDeckId, algorithmMode: defaultAlgorithm },
        {
          onSuccess: () => {
            state.setCreateType(null); state.setCreateName('');
            toast({ title: 'Baralho criado!' });
            if (state.createParentDeckId) state.toggleExpand(state.createParentDeckId);
            state.setCreateParentDeckId(null);
          },
          onError: () => toast({ title: 'Erro ao criar baralho', variant: 'destructive' }),
        }
      );
    } else {
      state.createFolder.mutate({ name, parentId: state.currentFolderId }, {
        onSuccess: () => { state.setCreateType(null); state.setCreateName(''); toast({ title: 'Pasta criada!' }); },
        onError: () => toast({ title: 'Erro ao criar pasta', variant: 'destructive' }),
      });
    }
  };

  const handleCreateSubmit = () => {
    if (!state.createName.trim()) return;
    const trimmed = state.createName.trim();
    let hasDuplicate = false;
    if (state.createType === 'deck') {
      const siblings = state.createParentDeckId
        ? state.decks.filter(d => d.parent_deck_id === state.createParentDeckId && !d.is_archived)
        : state.decks.filter(d => d.folder_id === state.currentFolderId && !d.parent_deck_id && !d.is_archived);
      hasDuplicate = siblings.some(d => d.name.toLowerCase() === trimmed.toLowerCase());
    } else {
      const siblingFolders = state.folders.filter(f => f.parent_id === state.currentFolderId && !f.is_archived);
      hasDuplicate = siblingFolders.some(f => f.name.toLowerCase() === trimmed.toLowerCase());
    }

    if (hasDuplicate) {
      state.setDuplicateWarning({
        name: trimmed,
        type: state.createType!,
        action: () => { doCreate(trimmed); state.setDuplicateWarning(null); },
      });
      return;
    }
    doCreate(trimmed);
  };

  const handleRenameSubmit = async () => {
    if (!state.renameTarget || !state.renameName.trim()) return;
    if (state.renameTarget.type === 'folder') {
      state.updateFolder.mutate({ id: state.renameTarget.id, name: state.renameName.trim() }, {
        onSuccess: () => { state.setRenameTarget(null); toast({ title: 'Renomeado!' }); },
      });
    } else {
      try {
        await renameDeck(state.renameTarget.id, state.renameName.trim());
        state.setRenameTarget(null);
        toast({ title: 'Renomeado!' });
        queryClient.invalidateQueries({ queryKey: ['decks'] });
      } catch {
        toast({ title: 'Erro ao renomear', variant: 'destructive' });
      }
    }
  };

  /** Check if deck (or any sub-deck) is shared in a community before allowing deletion. */
  const handleDeleteDeckRequest = async (deck: { id: string; name: string }) => {
    // Collect this deck + all descendant sub-decks
    const allIds = [deck.id];
    const collectChildren = (parentIds: string[]) => {
      const children = state.decks.filter(d => d.parent_deck_id && parentIds.includes(d.parent_deck_id));
      children.forEach(c => allIds.push(c.id));
      if (children.length > 0) collectChildren(children.map(c => c.id));
    };
    collectChildren([deck.id]);

    const { data: turmaRefs } = await supabase.from('turma_decks').select('deck_id, turma_id').in('deck_id', allIds).limit(1);
    console.log('[DELETE-CHECK] deck:', deck.name, 'allIds:', allIds, 'turmaRefs:', turmaRefs);
    if (turmaRefs && turmaRefs.length > 0) {
      const blockedId = turmaRefs[0].deck_id;
      const blockedDeck = state.decks.find(d => d.id === blockedId);
      const blockedName = blockedDeck ? blockedDeck.name : deck.name;
      console.log('[DELETE-CHECK] BLOCKED by turma_decks row:', turmaRefs[0], 'blockedName:', blockedName);
      setCommunityBlockTarget({ id: deck.id, name: blockedName, type: 'deck' });
      return;
    }
    state.setDeleteTarget({ type: 'deck', id: deck.id, name: deck.name });
  };

  const handleDeleteSubmit = async () => {
    if (!state.deleteTarget) return;
    try {
      if (state.deleteTarget.type === 'folder') {
        const { error: folderErr } = await supabase.from('folders').delete().eq('id', state.deleteTarget.id);
        if (folderErr) throw folderErr;
        toast({ title: 'Pasta excluída' });
      } else {
        await deleteDeckCascade(state.deleteTarget.id);
        toast({ title: 'Baralho excluído' });
      }
      state.setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const handleMoveSubmit = () => {
    if (!state.moveTarget) return;
    if (state.moveTarget.type === 'deck') {
      const targetFolderId = state.moveParentDeckId ? null : state.moveBrowseFolderId;
      // If moving into a parent deck, find that deck's folder_id
      let folderId = targetFolderId;
      if (state.moveParentDeckId) {
        const parentDeck = state.decks.find(d => d.id === state.moveParentDeckId);
        folderId = parentDeck?.folder_id ?? null;
      }
      state.moveDeck.mutate(
        { id: state.moveTarget.id, folderId: folderId, parentDeckId: state.moveParentDeckId ?? null },
        {
          onSuccess: () => { state.setMoveTarget(null); state.setMoveParentDeckId(null); toast({ title: 'Baralho movido!' }); },
          onError: () => toast({ title: 'Erro ao mover', variant: 'destructive' }),
        }
      );
    } else {
      state.moveFolder.mutate({ id: state.moveTarget.id, parentId: state.moveBrowseFolderId }, {
        onSuccess: () => { state.setMoveTarget(null); toast({ title: 'Pasta movida!' }); },
        onError: () => toast({ title: 'Erro ao mover', variant: 'destructive' }),
      });
    }
  };

  const handleBulkMoveSubmit = async () => {
    const ids = Array.from(state.selectedDeckIds);
    try {
      await bulkMoveDecks(ids, state.moveBrowseFolderId);
      toast({ title: `${ids.length} baralho(s) movido(s)!` });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    } catch {
      toast({ title: 'Erro ao mover', variant: 'destructive' });
    }
    state.setSelectedDeckIds(new Set());
    state.setDeckSelectionMode(false);
    state.setBulkMoveDeckOpen(false);
    state.setMoveBrowseFolderId(null);
    state.setMoveParentDeckId(null);
  };

  const handleBulkArchive = async () => {
    const ids = Array.from(state.selectedDeckIds);
    try {
      await bulkArchiveDecks(ids);
      toast({ title: `${ids.length} baralho(s) arquivado(s)!` });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    } catch {
      toast({ title: 'Erro ao arquivar', variant: 'destructive' });
    }
    state.setSelectedDeckIds(new Set());
    state.setDeckSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(state.selectedDeckIds);
    // Collect selected IDs + all their sub-deck IDs recursively
    const allRelatedIds = new Set(ids);
    const collectChildren = (parentIds: string[]) => {
      const children = state.decks.filter(d => d.parent_deck_id && parentIds.includes(d.parent_deck_id));
      children.forEach(c => { allRelatedIds.add(c.id); });
      if (children.length > 0) collectChildren(children.map(c => c.id));
    };
    collectChildren(ids);

    // Check if any selected or child deck is shared in a community
    const allIds = Array.from(allRelatedIds);
    const { data: turmaRefs } = await supabase.from('turma_decks').select('deck_id').in('deck_id', allIds);
    const communityLinkedIds = new Set((turmaRefs ?? []).map((r: any) => r.deck_id));
    const blocked = allIds.filter(id => communityLinkedIds.has(id));
    if (blocked.length > 0) {
      const blockedNames = blocked.map(id => state.decks.find(d => d.id === id)?.name ?? id).join(', ');
      setCommunityBlockTarget({ id: blocked[0], name: blockedNames, type: 'deck' });
      return;
    }
    try {
      await bulkDeleteDecks(ids);
      toast({ title: `${ids.length} baralho(s) excluído(s)!` });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
    state.setSelectedDeckIds(new Set());
    state.setDeckSelectionMode(false);
  };

  const handleNavigateCommunity = async (sourceTurmaDeckId: string) => {
    const info = await getTurmaDeckNavInfo(sourceTurmaDeckId);
    if (info) {
      if (info.lesson_id) navigate(`/turmas/${info.turma_id}/lessons/${info.lesson_id}`);
      else navigate(`/turmas/${info.turma_id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader 
        onCreditsOpen={() => { state.setPremiumTab('credits'); state.setPremiumOpen(true); }}
        onPremiumOpen={() => { state.setPremiumTab('plans'); state.setPremiumOpen(true); }}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Quick Nav */}
        <div className="mb-6 grid grid-cols-4 gap-2 sm:gap-3">
          {/* Comunidade */}
          {isAdmin ? (
            <button onClick={() => navigate('/turmas')} className="relative flex flex-col items-center gap-1 sm:gap-1.5 md:gap-2 rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-4 md:p-5 shadow-sm hover:bg-muted/50 hover:shadow-md transition-all">
              <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              <span className="text-[11px] sm:text-xs md:text-sm font-semibold text-foreground">Comunidade</span>
            </button>
          ) : (
            <div className="relative flex flex-col items-center gap-1 sm:gap-1.5 md:gap-2 rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-4 md:p-5 shadow-sm opacity-50 cursor-not-allowed">
              <Users className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
              <span className="text-[11px] sm:text-xs md:text-sm font-semibold text-muted-foreground">Comunidade</span>
              <span className="absolute -top-1.5 -right-1 text-[7px] sm:text-[8px] font-bold bg-muted text-muted-foreground rounded-full px-1 sm:px-1.5 py-0.5 whitespace-nowrap leading-none">
                em breve
              </span>
            </div>
          )}
          {[
            { label: 'Missões', icon: GraduationCap, path: '/missoes', badge: claimableCount },
            { label: 'Provas', icon: BookOpen, path: '/exam/new', badge: 0 },
            { label: 'Meu Plano', icon: CalendarCheck, path: '/plano', badge: 0 },
          ].map(item => (
            <button key={item.path} onClick={() => navigate(item.path)} className="relative flex flex-col items-center gap-1 sm:gap-1.5 md:gap-2 rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-4 md:p-5 shadow-sm hover:bg-muted/50 hover:shadow-md transition-all">
              <div className="relative">
                <item.icon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                {item.badge > 0 && (
                  <span className="absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shadow-sm animate-in zoom-in-50">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-xs md:text-sm font-semibold text-foreground">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Study deck carousel */}
        {allDecks && (
          <DeckCarousel
            decks={allDecks}
            avgSecondsPerCard={avgSecondsPerCard}
            hasPlan={hasPlan}
            planDeckIds={planDeckIds}
            planDeckOrder={planDeckOrder}
            plansByDeckId={plansByDeckId}
            globalNewRemaining={hasPlan ? state.globalNewRemaining : undefined}
            distributedNewByDeck={state.distributedNewByDeck}
          />
        )}


        <DashboardActions
          currentFolderId={state.currentFolderId}
          breadcrumb={state.breadcrumb}
          onNavigateFolder={state.setCurrentFolderId}
          onNavigateUp={() => {
            const current = state.folders.find(f => f.id === state.currentFolderId);
            state.setCurrentFolderId(current?.parent_id ?? null);
          }}
          hasDecks={state.currentDecks.length > 0}
          deckSelectionMode={state.deckSelectionMode}
          selectedCount={state.selectedDeckIds.size}
          isAllSelected={state.selectedDeckIds.size === state.currentDecks.length}
          toggleSelectionMode={() => { state.setDeckSelectionMode(!state.deckSelectionMode); state.setSelectedDeckIds(new Set()); }}
          toggleSelectAll={() => {
            if (state.selectedDeckIds.size === state.currentDecks.length) state.setSelectedDeckIds(new Set());
            else state.setSelectedDeckIds(new Set(state.currentDecks.map(d => d.id)));
          }}
          onCreateFolder={() => { state.setCreateType('folder'); state.setCreateName(''); state.setCreateParentDeckId(null); }}
          onCreateDeck={() => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(null); }}
          onCreateAI={() => state.setAiDeckOpen(true)}
          onImport={() => { state.setImportOpen(true); state.setImportDeckId(null); state.setImportDeckName(''); }}
          onBulkMove={() => { state.setBulkMoveDeckOpen(true); state.setMoveBrowseFolderId(null); state.setMoveParentDeckId(null); }}
          onBulkArchive={handleBulkArchive}
          onBulkDelete={handleBulkDelete}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Tab switcher: Meus Decks / Comunidade */}
        {!state.currentFolderId && (
          <div className="flex gap-1 mb-3 rounded-lg bg-muted p-1">
            <button
              onClick={() => setDashboardTab('personal')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                dashboardTab === 'personal' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Meus Decks
            </button>
            {isAdmin ? (
              <button
                onClick={() => setDashboardTab('community')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  dashboardTab === 'community' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <RefreshCw className="h-3 w-3" />
                Comunidade
              </button>
            ) : (
              <button
                disabled
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/60 cursor-not-allowed"
              >
                <RefreshCw className="h-3 w-3" />
                Comunidade
                <span className="ml-0.5 text-[7px] sm:text-[8px] font-semibold bg-muted-foreground/15 text-muted-foreground rounded-full px-1 sm:px-1.5 py-0.5 normal-case tracking-normal whitespace-nowrap leading-none">
                  em breve
                </span>
              </button>
            )}
          </div>
        )}

        {/* Personal decks tab (always shown since community is "em breve") */}
        {(dashboardTab === 'personal' || !!state.currentFolderId) && (
          <DeckList
            isLoading={state.isLoading}
            currentFolders={state.currentFolders}
            currentDecks={state.currentDecks}
            currentFolderId={state.currentFolderId}
            searchQuery={searchQuery}
            
            deckSelectionMode={state.deckSelectionMode}
            selectedDeckIds={state.selectedDeckIds}
            expandedDecks={state.expandedDecks}
            toggleExpand={state.toggleExpand}
            toggleDeckSelection={state.toggleDeckSelection}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            getCommunityLinkId={state.getCommunityLinkId}
            folderHasCommunityLink={state.folderHasCommunityLink}
            getFolderDueCount={state.getFolderDueCount}
            getFolderCommunityLinkId={state.getFolderCommunityLinkId}
            navigateToCommunity={handleNavigateCommunity}
            
            onFolderClick={state.setCurrentFolderId}
            onRenameFolder={(f) => { state.setRenameTarget({ type: 'folder', id: f.id, name: f.name }); state.setRenameName(f.name); }}
            onMoveFolder={(f) => { state.setMoveTarget({ type: 'folder', id: f.id, name: f.name }); state.setMoveBrowseFolderId(null); }}
            onArchiveFolder={(id) => state.archiveFolder.mutate(id)}
            onDeleteFolder={(f) => state.setDeleteTarget({ type: 'folder', id: f.id, name: f.name })}
            
            onCreateSubDeck={(deckId) => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(deckId); }}
            onRenameDeck={(d) => { state.setRenameTarget({ type: 'deck', id: d.id, name: d.name }); state.setRenameName(d.name); }}
            onMoveDeck={(d) => { state.setMoveTarget({ type: 'deck', id: d.id, name: d.name }); state.setMoveBrowseFolderId(null); state.setMoveParentDeckId(null); }}
            onArchiveDeck={(id) => state.archiveDeck.mutate(id)}
            onDeleteDeck={(d) => handleDeleteDeckRequest(d)}
            onReorderFolders={(reordered) => state.reorderFolders.mutate(reordered.map(f => f.id))}
            onReorderDecks={(reordered) => state.reorderDecks.mutate(reordered.map(d => d.id))}
          />
        )}

        {/* Community decks tab */}
        {dashboardTab === 'community' && !state.currentFolderId && state.communityDecks.length > 0 && (
          <DeckList
            isLoading={false}
            currentFolders={[]}
            currentDecks={state.communityDecks}
            currentFolderId={null}
            searchQuery={searchQuery}
            
            deckSelectionMode={false}
            selectedDeckIds={new Set()}
            expandedDecks={state.expandedDecks}
            toggleExpand={state.toggleExpand}
            toggleDeckSelection={() => {}}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            getCommunityLinkId={state.getCommunityLinkId}
            folderHasCommunityLink={() => false}
            getFolderDueCount={() => 0}
            getFolderCommunityLinkId={() => null}
            navigateToCommunity={handleNavigateCommunity}
            
            onFolderClick={() => {}}
            onRenameFolder={() => {}}
            onMoveFolder={() => {}}
            onArchiveFolder={() => {}}
            onDeleteFolder={() => {}}
            
            onCreateSubDeck={() => {}}
            onRenameDeck={() => {}}
            onMoveDeck={() => {}}
            onArchiveDeck={(id) => state.archiveDeck.mutate(id)}
            onDeleteDeck={(d) => handleDeleteDeckRequest(d)}
            decksWithPendingUpdates={state.decksWithPendingUpdates}
          />
        )}

        {/* Archived section */}
        {state.totalArchived > 0 && (
          <div className="mt-6">
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
                {state.archivedFolders.map(folder => (
                  <div key={folder.id} className="flex items-center gap-3 px-5 py-4">
                    <FolderOpen className="h-6 w-6 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-muted-foreground truncate">{folder.name}</h3>
                      <p className="text-xs text-muted-foreground">Pasta arquivada</p>
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
                {state.archivedDecks.map(deck => (
                  <div key={deck.id} className="flex items-center gap-3 px-5 py-4">
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-muted-foreground truncate">{deck.name}</h3>
                      <p className="text-xs text-muted-foreground">Baralho arquivado</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => state.archiveDeck.mutate(deck.id)}>
                        <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleDeleteDeckRequest(deck)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <DashboardDialogs
        createType={state.createType} setCreateType={state.setCreateType}
        createName={state.createName} setCreateName={state.setCreateName}
        createParentDeckId={state.createParentDeckId} setCreateParentDeckId={state.setCreateParentDeckId}
        onCreateSubmit={handleCreateSubmit}
        isCreating={state.createDeck.isPending || state.createFolder.isPending}

        renameTarget={state.renameTarget} setRenameTarget={state.setRenameTarget}
        renameName={state.renameName} setRenameName={state.setRenameName}
        onRenameSubmit={handleRenameSubmit}

        moveTarget={state.moveTarget} setMoveTarget={state.setMoveTarget}
        moveBrowseFolderId={state.moveBrowseFolderId} setMoveBrowseFolderId={state.setMoveBrowseFolderId}
        moveParentDeckId={state.moveParentDeckId} setMoveParentDeckId={state.setMoveParentDeckId}
        moveBreadcrumb={state.moveBreadcrumb} movableFolders={state.movableFolders}
        movableDecks={state.movableDecks}
        folders={state.folders}
        decks={state.decks}
        onMoveSubmit={handleMoveSubmit}
        onCreateFolderInMove={() => { state.setCreateType('folder'); state.setCreateName(''); }}

        deleteTarget={state.deleteTarget} setDeleteTarget={state.setDeleteTarget}
        onDeleteSubmit={handleDeleteSubmit}

        duplicateWarning={state.duplicateWarning} setDuplicateWarning={state.setDuplicateWarning}
        setCreateNameFromDuplicate={state.setCreateName}

        bulkMoveDeckOpen={state.bulkMoveDeckOpen} setBulkMoveDeckOpen={state.setBulkMoveDeckOpen}
        bulkMoveTargetFolder={state.bulkMoveTargetFolder} setBulkMoveTargetFolder={state.setBulkMoveTargetFolder}
        selectedDeckCount={state.selectedDeckIds.size}
        onBulkMoveSubmit={handleBulkMoveSubmit}
      />

      <Suspense fallback={null}>
        {state.importOpen && (
          <ImportCardsDialog
            open={state.importOpen} onOpenChange={state.setImportOpen}
            onImport={async (deckName, cards, subdecks) => {
              const pendingStore = usePendingDecks.getState();
              const pendingId = `import-${Date.now()}`;
              const totalCards = subdecks && subdecks.length > 0
                ? subdecks.reduce(function cntAll(s: number, n: any): number { return s + (n.card_indices?.length || 0) + (n.children?.length ? n.children.reduce(cntAll, 0) : 0); }, 0)
                : cards.length;

              pendingStore.addPending({
                id: pendingId,
                name: deckName,
                folderId: state.currentFolderId ?? null,
                status: 'saving',
                progress: { current: 0, total: totalCards },
              });

              state.setImportOpen(false);

              try {
                const { data: { user } } = await (await import('@/integrations/supabase/client')).supabase.auth.getUser();
                if (subdecks && subdecks.length > 0) {
                  await importDeckWithSubdecks(
                    user!.id,
                    deckName,
                    state.currentFolderId,
                    cards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType })),
                    subdecks,
                    defaultAlgorithm
                  );
                  toast({ title: `${totalCards} cartões importados em "${deckName}"!` });
                } else {
                  await importDeck(
                    user!.id,
                    deckName,
                    state.currentFolderId,
                    cards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType })),
                    defaultAlgorithm
                  );
                  toast({ title: `${cards.length} cartões importados!` });
                }
                pendingStore.updatePending(pendingId, { status: 'done', progress: { current: totalCards, total: totalCards } });
                await queryClient.invalidateQueries({ queryKey: ['decks'] });
                await queryClient.invalidateQueries({ queryKey: ['folders'] });
                await queryClient.invalidateQueries({ queryKey: ['allDeckStats'] });
                setTimeout(() => pendingStore.removePending(pendingId), 2000);
              } catch (err) {
                pendingStore.updatePending(pendingId, { status: 'error' });
                toast({ title: 'Erro ao importar', variant: 'destructive' });
                setTimeout(() => pendingStore.removePending(pendingId), 4000);
              }
            }}
          />
        )}
      </Suspense>

      <Suspense fallback={<SuspenseLoading />}>
        {state.aiDeckOpen && <AICreateDeckDialog open={state.aiDeckOpen} onOpenChange={state.setAiDeckOpen} folderId={state.currentFolderId} />}
      </Suspense>
      <Suspense fallback={<SuspenseLoading />}>
        {state.premiumOpen && <PremiumModal open={state.premiumOpen} onClose={() => state.setPremiumOpen(false)} defaultTab={state.premiumTab} />}
      </Suspense>

      <Suspense fallback={null}>
        {!!communityBlockTarget && (
          <CommunityDeleteBlockDialog
            open={!!communityBlockTarget}
            onOpenChange={(open) => !open && setCommunityBlockTarget(null)}
            itemName={communityBlockTarget?.name ?? ''}
            itemType="deck"
            onArchive={() => {
              state.archiveDeck.mutate(communityBlockTarget.id);
              setCommunityBlockTarget(null);
              toast({ title: 'Baralho arquivado!' });
            }}
          />
        )}
      </Suspense>
    </div>
  );
};

export default Dashboard;
