// ============= Refactored Dashboard.tsx =============

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getNewCardsForDayGlobal } from '@/hooks/useStudyPlan';
import { Users, GraduationCap, BookOpen, Archive, ArchiveRestore, ChevronDown, FolderOpen, Trash2, CalendarCheck, BookX, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '@/components/GlobalLoading';
import { useSubscription } from '@/hooks/useSubscription';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';


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
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import DashboardActions from '@/components/dashboard/DashboardActions';
import DeckList from '@/components/dashboard/DeckList';
import DashboardDialogs from '@/components/dashboard/DashboardDialogs';
const PremiumModal = lazy(() => import('@/components/dashboard/PremiumModal'));
const CommunityDeleteBlockDialog = lazy(() => import('@/components/CommunityDeleteBlockDialog'));
import DeckCarousel from '@/components/dashboard/DeckCarousel';
import MiniStatsStrip from '@/components/dashboard/MiniStatsStrip';
import DashboardDueThemes from '@/components/dashboard/DashboardDueThemes';
import { importDeck, importDeckWithSubdecks } from '@/services/deckService';
import { usePendingDecks, type PendingDeck } from '@/stores/usePendingDecks';
import { useMissions } from '@/hooks/useMissions';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { GeneratedCard } from '@/types/ai';

const Dashboard = () => {
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

  // Error notebook count
  const { data: errorCount = 0 } = useQuery({
    queryKey: ['error-notebook-count'],
    queryFn: async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return 0;
      const { data: attempts } = await supabase
        .from('deck_question_attempts' as any)
        .select('question_id, is_correct, answered_at')
        .eq('user_id', u.id)
        .order('answered_at', { ascending: false });
      if (!attempts) return 0;
      const latestByQ = new Map<string, boolean>();
      for (const a of attempts as any[]) {
        if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a.is_correct);
      }
      return [...latestByQ.values()].filter(v => !v).length;
    },
    staleTime: 60_000,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [detachTarget, setDetachTarget] = useState<{ id: string; name: string } | null>(null);
  const [detaching, setDetaching] = useState(false);
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

  // Carousel helpers
  const hasPlan = plans.length > 0;
  const planDeckIds = allDeckIds;
  const plansByDeckId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of plans) {
      for (const id of (p.deck_ids ?? [])) {
        if (!map[id]) map[id] = p.name;
      }
    }
    return map;
  }, [plans]);

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

      // Duplicate the deck as a personal copy (no community links)
      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', detachTarget.id).single();
      if (!originalDeck) throw new Error('Deck not found');

      const { data: newDeck, error } = await supabase.from('decks').insert({
        name: `${(originalDeck as any).name}`,
        user_id: currentUser.id,
        folder_id: null,
      } as any).select().single();
      if (error || !newDeck) throw error || new Error('Failed to create deck');

      // Copy cards
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader 
        onCreditsOpen={() => { state.setPremiumTab('credits'); state.setPremiumOpen(true); }}
        onPremiumOpen={() => { state.setPremiumTab('plans'); state.setPremiumOpen(true); }}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Quick Nav */}
        <div className="mb-6 grid grid-cols-5 gap-2 sm:gap-3">
          <button onClick={() => navigate('/turmas')} className="relative flex flex-col items-center gap-1 sm:gap-1.5 md:gap-2 rounded-xl sm:rounded-2xl border border-border/50 bg-card p-3 sm:p-4 md:p-5 shadow-sm hover:bg-muted/50 hover:shadow-md transition-all">
            <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-foreground">Comunidade</span>
          </button>
          {[
            { label: 'Missões', icon: GraduationCap, path: '/missoes', badge: claimableCount },
            { label: 'Provas', icon: BookOpen, path: '/exam/new', badge: 0 },
            { label: 'Questões', icon: Library, path: '/banco-questoes', badge: 0 },
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
              <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-foreground">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Caderno de Erros shortcut */}
        {errorCount > 0 && (
          <button
            onClick={() => navigate('/caderno-de-erros')}
            className="mb-6 w-full flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 hover:bg-destructive/10 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <BookX className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-foreground">Caderno de Erros</p>
              <p className="text-[11px] text-muted-foreground">{errorCount} {errorCount === 1 ? 'questão errada' : 'questões erradas'} para revisar</p>
            </div>
            <Badge variant="destructive" className="text-xs">{errorCount}</Badge>
          </button>
        )}

        {/* Mini Stats Strip */}
        <MiniStatsStrip />

        {/* Due Themes Section */}
        <DashboardDueThemes />

        {/* Study deck carousel */}
        {allDecks && (
          <DeckCarousel
            decks={allDecks}
            avgSecondsPerCard={avgSecondsPerCard}
            studyMetrics={realStudyMetrics}
            hasPlan={hasPlan}
            planDeckIds={planDeckIds}
            planDeckOrder={planDeckOrderEarly}
            plansByDeckId={plansByDeckId}
            globalNewRemaining={hasPlan ? state.globalNewRemaining : undefined}
            distributedNewByDeck={state.distributedNewByDeck}
          />
        )}

        <DashboardActions
          mode="personal"
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
          isAllSelected={state.currentDecks.length > 0 && state.selectedDeckIds.size === state.currentDecks.length}
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
          onBulkArchive={actions.handleBulkArchive}
          onBulkDelete={actions.handleBulkDelete}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

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
          navigateToCommunity={actions.handleNavigateCommunity}
          onFolderClick={state.setCurrentFolderId}
          onRenameFolder={(f) => { state.setRenameTarget({ type: 'folder', id: f.id, name: f.name }); state.setRenameName(f.name); }}
          onMoveFolder={(f) => { state.setMoveTarget({ type: 'folder', id: f.id, name: f.name }); state.setMoveBrowseFolderId(null); }}
          onArchiveFolder={(id) => state.archiveFolder.mutate(id)}
          onDeleteFolder={(f) => state.setDeleteTarget({ type: 'folder', id: f.id, name: f.name })}
          onCreateSubDeck={(deckId) => { state.setCreateType('deck'); state.setCreateName(''); state.setCreateParentDeckId(deckId); }}
          onRenameDeck={(d) => { state.setRenameTarget({ type: 'deck', id: d.id, name: d.name }); state.setRenameName(d.name); }}
          onMoveDeck={(d) => { state.setMoveTarget({ type: 'deck', id: d.id, name: d.name }); state.setMoveBrowseFolderId(null); state.setMoveParentDeckId(null); }}
          onArchiveDeck={(id) => state.archiveDeck.mutate(id)}
          onDeleteDeck={(d) => actions.handleDeleteDeckRequest(d)}
          onDetachCommunityDeck={(d) => setDetachTarget({ id: d.id, name: d.name })}
          onReorderFolders={(reordered) => state.reorderFolders.mutate(reordered.map(f => f.id))}
          onReorderDecks={(reordered) => state.reorderDecks.mutate(reordered.map(d => d.id))}
          onPendingClick={handlePendingClick}
          decksWithPendingUpdates={state.decksWithPendingUpdates}
        />

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
        folders={state.folders}
        decks={state.decks}
        onMoveSubmit={actions.handleMoveSubmit}
        onCreateFolderInMove={() => { state.setCreateType('folder'); state.setCreateName(''); }}
        deleteTarget={state.deleteTarget} setDeleteTarget={state.setDeleteTarget}
        onDeleteSubmit={actions.handleDeleteSubmit}
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
                folderId: state.currentFolderId ?? null,
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
                    user!.id, deckName, state.currentFolderId,
                    cards.map(c => ({ frontContent: c.frontContent, backContent: c.backContent, cardType: c.cardType, progress: (c as any).progress })),
                    subdecks, defaultAlgorithm, revlog as any, progressCb,
                  );
                  result = { insertedCount: r.insertedCount, totalCards: r.totalCards };
                } else {
                  const r = await importDeck(
                    user!.id, deckName, state.currentFolderId,
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
                await queryClient.invalidateQueries({ queryKey: ['folders'] });
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
            folderId={pendingReviewData?.folderId ?? state.currentFolderId}
            pendingReviewData={pendingReviewData}
          />
        )}
      </Suspense>
      <Suspense fallback={<SuspenseLoading />}>
        {state.premiumOpen && <PremiumModal open={state.premiumOpen} onClose={() => state.setPremiumOpen(false)} defaultTab={state.premiumTab} />}
      </Suspense>

      <Suspense fallback={null}>
        {!!actions.communityBlockTarget && (
          <CommunityDeleteBlockDialog
            open={!!actions.communityBlockTarget}
            onOpenChange={(open) => !open && actions.setCommunityBlockTarget(null)}
            itemName={actions.communityBlockTarget?.name ?? ''}
            itemType="deck"
            onArchive={() => {
              state.archiveDeck.mutate(actions.communityBlockTarget!.id);
              actions.setCommunityBlockTarget(null);
              toast({ title: 'Baralho arquivado!' });
            }}
          />
        )}
      </Suspense>

      {/* Copy community deck dialog */}
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
    </div>
  );
};

export default Dashboard;
