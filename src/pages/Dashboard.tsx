// ============= Refactored Dashboard.tsx — Slim Orchestrator =============

import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronDown, Play, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '@/components/GlobalLoading';
import { useSubscription } from '@/hooks/useSubscription';
import { useStudyPlan } from '@/hooks/useStudyPlan';

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
import { useDashboardActions } from '@/hooks/useDashboardActions';
import { useDashboardSalas } from '@/hooks/useDashboardSalas';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DeckList from '@/components/dashboard/DeckList';
import SalaList from '@/components/dashboard/SalaList';
import SalaHero from '@/components/dashboard/SalaHero';
import DashboardDialogs from '@/components/dashboard/DashboardDialogs';
import DashboardModals from '@/components/dashboard/DashboardModals';
import ShareSalaModal from '@/components/dashboard/ShareSalaModal';
const PremiumModal = lazy(() => import('@/components/dashboard/PremiumModal'));

const StudyWeightsSheet = lazy(() => import('@/components/dashboard/StudyWeightsSheet'));
const StudySalaSheet = lazy(() => import('@/components/dashboard/StudySalaSheet'));
const StudySettingsSheet = lazy(() => import('@/components/dashboard/StudySettingsSheet'));

import { importDeck, importDeckWithSubdecks } from '@/services/deckService';
import BottomNav from '@/components/BottomNav';
import { usePendingDecks, type PendingDeck } from '@/stores/usePendingDecks';

import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { GeneratedCard } from '@/types/ai';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plans, allDeckIds, avgSecondsPerCard, realStudyMetrics, metrics, globalCapacity } = useStudyPlan();
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

  planRootIdsRef.current = planRootIds;
  const { isPremium, refreshStatus } = useSubscription();
  const { missions } = useMissions();
  const { isAdmin } = useIsAdmin();
  const defaultAlgorithm = isPremium ? 'fsrs' : 'sm2';
  const claimableCount = missions.filter(m => m.isCompleted && !m.isClaimed).length;

  // Error notebook count
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

  // Salas hook (community bootstrap, leave, publish, detach, share, image)
  const salas = useDashboardSalas({
    currentFolderId: state.currentFolderId,
    setCurrentFolderId: state.setCurrentFolderId,
    folders: state.folders,
    decks: state.decks,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [organizeMode, setOrganizeMode] = useState(false);
  const [studyWeightsOpen, setStudyWeightsOpen] = useState(false);
  const [studySalaSheetOpen, setStudySalaSheetOpen] = useState(false);
  const [studySettingsOpen, setStudySettingsOpen] = useState(false);
  const [addMenuInfoType, setAddMenuInfoType] = useState<'deck' | 'materia' | 'deck-manual' | 'deck-ia' | null>(null);

  const [pendingReviewData, setPendingReviewData] = useState<{
    pendingId: string; cards: GeneratedCard[]; deckName: string; folderId: string | null; textSample?: string;
  } | null>(null);
  const [aiDeckParentId, setAiDeckParentId] = useState<string | null>(null);
  const [aiDeckParentName, setAiDeckParentName] = useState<string | null>(null);

  const activeSection = 'personal' as const;
  const actions = useDashboardActions({ ...state, dashboardSection: activeSection }, defaultAlgorithm);

  // Handle query param actions
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'ai-deck') {
      state.setAiDeckOpen(true);
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    } else if (action === 'create-deck') {
      state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(null);
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    } else if (action === 'import') {
      state.setImportOpen(true); state.setImportDeckId(null); state.setImportDeckName('');
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    } else if (action === 'create-sala') {
      state.setCreateType('folder'); state.setCreateName('');
      setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('action'); return p; }, { replace: true });
    }
  }, [searchParams]);

  // Listen for "+" button inside own sala
  const [salaAddMenuOpen, setSalaAddMenuOpen] = useState(false);
  useEffect(() => {
    const handler = () => {
      if (state.isInsideSala && !salas.isCommunityFolder) setSalaAddMenuOpen(true);
    };
    window.addEventListener('open-sala-add-menu', handler);
    return () => window.removeEventListener('open-sala-add-menu', handler);
  }, [state.isInsideSala, salas.isCommunityFolder]);

  // Handle payment return
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') {
      toast({ title: '🎉 Pagamento realizado!', description: 'Seu status será atualizado em instantes.' });
      refreshStatus(); setTimeout(refreshStatus, 5000);
      setSearchParams({}, { replace: true });
    } else if (payment === 'canceled') {
      toast({ title: 'Pagamento cancelado', description: 'Nenhuma cobrança foi feita.' });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, refreshStatus, setSearchParams, toast]);

  const handlePendingClick = useCallback((pending: PendingDeck) => {
    if (pending.status === 'review_ready' && pending.cards) {
      setPendingReviewData({
        pendingId: pending.id, cards: pending.cards as GeneratedCard[],
        deckName: pending.name, folderId: pending.folderId, textSample: pending.textSample,
      });
      state.setAiDeckOpen(true);
    }
  }, [state]);

  // Compute total due for the study button
  const totalDueToday = useMemo(() => {
    const roots = state.isInsideSala ? state.currentDecks : state.allRootDecks;
    let total = 0;
    for (const deck of roots) {
      const s = state.getAggregateStats(deck);
      total += s.new_count + s.learning_count + s.review_count;
    }
    return total;
  }, [state.currentDecks, state.allRootDecks, state.isInsideSala, state.getAggregateStats]);

  // Collect all deck IDs in the current sala
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

  // Compute difficulty stats
  const salaDifficultyStats = useMemo(() => {
    if (salaDeckIds.length === 0) return { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
    const deckMap = state.deckMap;
    let novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0;
    for (const id of salaDeckIds) {
      const dk = deckMap.get(id);
      if (!dk) continue;
      novo += dk.class_novo ?? 0; facil += dk.class_facil ?? 0;
      bom += dk.class_bom ?? 0; dificil += dk.class_dificil ?? 0; errei += dk.class_errei ?? 0;
    }
    return { novo, facil, bom, dificil, errei };
  }, [salaDeckIds, state.deckMap]);

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
        {/* Inside a Sala: Hero banner */}
        {state.isInsideSala && (
          <SalaHero
            state={state}
            user={user}
            isCommunityFolder={salas.isCommunityFolder}
            sourceTurmaId={salas.sourceTurmaId ?? null}
            communityTurmaInfo={salas.communityTurmaInfo}
            userTurma={salas.userTurma}
            publishing={salas.publishing}
            handleTogglePublish={salas.handleTogglePublish}
            openShareModal={salas.openShareModal}
            setSalaImageOpen={salas.setSalaImageOpen}
            setLeaveSalaConfirm={salas.setLeaveSalaConfirm}
            setStudySettingsOpen={setStudySettingsOpen}
            realStudyMetrics={realStudyMetrics}
            salaDifficultyStats={salaDifficultyStats}
            organizeMode={organizeMode}
            setOrganizeMode={setOrganizeMode}
          />
        )}

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
            folders={state.folders} decks={state.decks} isLoading={state.isLoading}
            getAggregateStats={state.getAggregateStats} onSalaClick={handleSalaClick}
          />
        )}

        {/* Inside Sala: Deck List */}
        {state.isInsideSala && (
          <DeckList
            isLoading={state.isLoading}
            currentDecks={state.currentDecks}
            searchQuery={searchQuery}
            deckSelectionMode={salas.isCommunityFolder ? false : state.deckSelectionMode}
            selectedDeckIds={salas.isCommunityFolder ? new Set<string>() : state.selectedDeckIds}
            expandedDecks={state.expandedDecks}
            toggleExpand={state.toggleExpand}
            toggleDeckSelection={state.toggleDeckSelection}
            getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats}
            getCommunityLinkId={state.getCommunityLinkId}
            navigateToCommunity={actions.handleNavigateCommunity}
            onCreateSubDeck={salas.isCommunityFolder ? () => {} : (deckId) => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(deckId); }}
            onCreateSubDeckAI={salas.isCommunityFolder ? undefined : (deckId) => {
              const parentDeck = state.decks.find(d => d.id === deckId);
              setAiDeckParentId(deckId); setAiDeckParentName(parentDeck?.name ?? null);
              state.setAiDeckOpen(true);
            }}
            onRenameDeck={salas.isCommunityFolder ? () => {} : (d) => { state.setRenameTarget({ type: 'deck', id: d.id, name: d.name }); state.setRenameName(d.name); }}
            onMoveDeck={salas.isCommunityFolder ? () => {} : (d) => { state.setMoveTarget({ type: 'deck', id: d.id, name: d.name }); state.setMoveBrowseFolderId(d.folder_id || state.currentFolderId); state.setMoveParentDeckId(null); }}
            onArchiveDeck={salas.isCommunityFolder ? () => {} : (id) => state.archiveDeck.mutate(id)}
            onDeleteDeck={salas.isCommunityFolder ? () => {} : (d) => actions.handleDeleteDeckRequest(d)}
            onDetachCommunityDeck={salas.isCommunityFolder ? undefined : (d) => salas.setDetachTarget({ id: d.id, name: d.name })}
            onReorderDecks={salas.isCommunityFolder ? undefined : (reordered) => state.reorderDecks.mutate(reordered.map(d => d.id))}
            onPendingClick={handlePendingClick}
            decksWithPendingUpdates={state.decksWithPendingUpdates}
            organizeMode={organizeMode}
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
        folders={state.folders} decks={state.decks}
        onMoveSubmit={actions.handleMoveSubmit}
        onCreateFolderInMove={() => { state.setCreateType('folder'); state.setCreateName(''); }}
        deleteTarget={state.deleteTarget} setDeleteTarget={state.setDeleteTarget}
        onDeleteSubmit={async () => {
          const isFolder = state.deleteTarget?.type === 'folder';
          await actions.handleDeleteSubmit();
          if (isFolder) { state.setCurrentFolderId(null); setSearchParams({}, { replace: true }); }
        }}
        duplicateWarning={state.duplicateWarning} setDuplicateWarning={state.setDuplicateWarning}
        setCreateNameFromDuplicate={state.setCreateName}
        bulkMoveDeckOpen={state.bulkMoveDeckOpen} setBulkMoveDeckOpen={state.setBulkMoveDeckOpen}
        bulkMoveTargetFolder={state.bulkMoveTargetFolder} setBulkMoveTargetFolder={state.setBulkMoveTargetFolder}
        selectedDeckCount={state.selectedDeckIds.size}
        onBulkMoveSubmit={actions.handleBulkMoveSubmit}
      />

      <DashboardModals
        addMenuInfoType={addMenuInfoType} setAddMenuInfoType={setAddMenuInfoType}
        detachTarget={salas.detachTarget} setDetachTarget={salas.setDetachTarget}
        detaching={salas.detaching} handleDetachDeck={salas.handleDetachDeck}
        salaImageOpen={salas.salaImageOpen} setSalaImageOpen={salas.setSalaImageOpen}
        onSalaImageCropped={salas.handleSalaImageCropped}
        leaveSalaConfirm={salas.leaveSalaConfirm} setLeaveSalaConfirm={salas.setLeaveSalaConfirm}
        handleLeaveSala={salas.handleLeaveSala}
        salaAddMenuOpen={salaAddMenuOpen} setSalaAddMenuOpen={setSalaAddMenuOpen}
        onCreateDeckManual={() => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(null); }}
        onCreateDeckAI={() => state.setAiDeckOpen(true)}
        onCreateMateria={() => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId('__materia__'); }}
        onImportCards={() => { state.setImportOpen(true); state.setImportDeckId(null); state.setImportDeckName(''); }}
      />

      <ShareSalaModal
        open={salas.shareModalOpen}
        onOpenChange={salas.setShareModalOpen}
        turmaId={salas.userTurma?.id}
        shareSlug={salas.shareSlugEdit}
        isPublished={salas.userTurma ? !salas.userTurma.is_private : false}
        onTogglePublish={salas.handleTogglePublish}
        publishing={salas.publishing}
        onCopyLink={async () => {
          const link = `${window.location.origin}/c/${salas.shareSlugEdit}`;
          await navigator.clipboard.writeText(link);
          toast({ title: '🔗 Link copiado!' });
        }}
        ownerName={salas.userTurma?.owner_name}
        onSlugChange={salas.setShareSlugEdit}
        onSlugSave={salas.handleSaveSlug}
        savingSlug={salas.savingSlug}
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

              pendingStore.addPending({ id: pendingId, name: deckName, folderId: null, status: 'saving', progress: { current: 0, total: totalCards } });
              state.setImportOpen(false);

              try {
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

      <Suspense fallback={null}>
        {studyWeightsOpen && (
          <StudyWeightsSheet open={studyWeightsOpen} onOpenChange={setStudyWeightsOpen}
            folders={state.folders} decks={state.decks} getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats} currentFolderId={state.currentFolderId} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {studySalaSheetOpen && (
          <StudySalaSheet open={studySalaSheetOpen} onOpenChange={setStudySalaSheetOpen}
            folders={state.folders} decks={state.decks} getAggregateStats={state.getAggregateStats}
            globalNewRemaining={state.globalNewRemaining} avgSecondsPerCard={avgSecondsPerCard} />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {studySettingsOpen && (
          <StudySettingsSheet open={studySettingsOpen} onOpenChange={setStudySettingsOpen}
            decks={state.decks} getSubDecks={state.getSubDecks}
            getAggregateStats={state.getAggregateStats} currentFolderId={state.currentFolderId} />
        )}
      </Suspense>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
