/**
 * Custom hook encapsulating all Dashboard local state and derived data.
 */

import { useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDecks, type DeckWithStats } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface BreadcrumbItem { id: string | null; name: string }

export function useDashboardState(planRootIds?: Set<string>) {
  const { user } = useAuth();
  const { decks, isLoading: decksLoading, createDeck, deleteDeck, archiveDeck, duplicateDeck, resetProgress, moveDeck, reorderDecks } = useDecks();
  const { folders, isLoading: foldersLoading, createFolder, updateFolder, deleteFolder, archiveFolder, moveFolder, reorderFolders } = useFolders();

  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get('folder') || null;
  const setCurrentFolderId = (id: string | null) => {
    if (id) setSearchParams({ folder: id }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  const [expandedDecks, setExpandedDecks] = useState<Set<string>>(new Set());

  // Dialog states
  const [createType, setCreateType] = useState<'deck' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const [createParentDeckId, setCreateParentDeckId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'deck' | 'folder'; id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ type: 'deck' | 'folder'; id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [moveTarget, setMoveTarget] = useState<{ type: 'deck' | 'folder'; id: string; name: string } | null>(null);
  const [moveBrowseFolderId, setMoveBrowseFolderId] = useState<string | null>(null);
  const [moveParentDeckId, setMoveParentDeckId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importDeckId, setImportDeckId] = useState<string | null>(null);
  const [importDeckName, setImportDeckName] = useState('');
  const [aiDeckOpen, setAiDeckOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [premiumTab, setPremiumTab] = useState<'plans' | 'credits'>('plans');
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [deckSelectionMode, setDeckSelectionMode] = useState(false);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
  const [bulkMoveDeckOpen, setBulkMoveDeckOpen] = useState(false);
  const [bulkMoveTargetFolder, setBulkMoveTargetFolder] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; type: 'deck' | 'folder'; action: () => void } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const rawGlobalNewLimit = globalNewLimitQuery.data?.daily_new_cards_limit ?? 9999;
  const weeklyNewCardsProfile = globalNewLimitQuery.data?.weekly_new_cards as Record<string, number> | null;
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayGlobalNewLimit = (weeklyNewCardsProfile && weeklyNewCardsProfile[DAY_KEYS[new Date().getDay()]] != null)
    ? weeklyNewCardsProfile[DAY_KEYS[new Date().getDay()]]
    : rawGlobalNewLimit;

  // Sum new_reviewed_today scoped to plan decks (when plan exists) or all decks
  const globalNewReviewedToday = useMemo(() => {
    const roots = decks.filter(d => !d.parent_deck_id && !d.is_archived);
    const scopedRoots = planRootIds && planRootIds.size > 0
      ? roots.filter(d => planRootIds.has(d.id))
      : roots;
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
  }, [decks, planRootIds]);

  const globalNewRemaining = Math.max(0, todayGlobalNewLimit - globalNewReviewedToday);

  const isLoading = decksLoading || foldersLoading;

  const toggleExpand = (deckId: string) => {
    setExpandedDecks(prev => {
      const next = new Set(prev);
      next.has(deckId) ? next.delete(deckId) : next.add(deckId);
      return next;
    });
  };

  // Breadcrumb
  const breadcrumb = useMemo(() => {
    const path: BreadcrumbItem[] = [{ id: null, name: 'Início' }];
    if (!currentFolderId) return path;
    const buildPath = (fId: string) => {
      const folder = folders.find(f => f.id === fId);
      if (!folder) return;
      if (folder.parent_id) buildPath(folder.parent_id);
      path.push({ id: folder.id, name: folder.name });
    };
    buildPath(currentFolderId);
    return path;
  }, [currentFolderId, folders]);

  const currentFolders = useMemo(
    () => folders.filter(f => f.parent_id === currentFolderId && !f.is_archived)
      .sort((a, b) => (a as any).sort_order - (b as any).sort_order || a.name.localeCompare(b.name)),
    [folders, currentFolderId]
  );

  /** A deck is community-imported if it has source_turma_deck_id, source_listing_id, or is_live_deck */
  const isCommunityDeck = (d: DeckWithStats) => !!(d.source_turma_deck_id || d.source_listing_id || (d as any).is_live_deck);

  const currentDecks = useMemo(
    () => decks.filter(d => d.folder_id === currentFolderId && !d.parent_deck_id && !d.is_archived && !isCommunityDeck(d))
      .sort((a, b) => (a as any).sort_order - (b as any).sort_order || a.name.localeCompare(b.name)),
    [decks, currentFolderId]
  );

  /** Community decks: imported from turma or marketplace. Only shown at root level. */
  const communityDecks = useMemo(
    () => decks.filter(d => !d.parent_deck_id && !d.is_archived && isCommunityDeck(d))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [decks]
  );

  /** Check which community decks have pending updates (source updated_at > local synced_at). */
  const sourceTurmaDeckIds = useMemo(
    () => communityDecks.map(d => d.source_turma_deck_id!).filter(Boolean),
    [communityDecks]
  );
  const pendingUpdatesQuery = useQuery({
    queryKey: ['community-deck-updates', sourceTurmaDeckIds],
    queryFn: async () => {
      if (sourceTurmaDeckIds.length === 0) return new Set<string>();
      const { data } = await supabase
        .from('turma_decks')
        .select('id, deck_id')
        .in('id', sourceTurmaDeckIds);
      if (!data || data.length === 0) return new Set<string>();
      // Get source deck updated_at
      const sourceDeckIds = data.map((td: any) => td.deck_id);
      const { data: sourceDecks } = await supabase
        .from('decks')
        .select('id, updated_at')
        .in('id', sourceDeckIds);
      const sourceUpdatedMap = new Map<string, string>();
      for (const sd of (sourceDecks ?? []) as any[]) {
        sourceUpdatedMap.set(sd.id, sd.updated_at);
      }
      // Build turma_deck_id -> source_updated_at map
      const turmaDeckToSourceUpdated = new Map<string, string>();
      for (const td of data as any[]) {
        const updated = sourceUpdatedMap.get(td.deck_id);
        if (updated) turmaDeckToSourceUpdated.set(td.id, updated);
      }
      // Compare with user's synced_at
      const pending = new Set<string>();
      for (const cd of communityDecks) {
        const sourceUpdated = turmaDeckToSourceUpdated.get(cd.source_turma_deck_id!);
        if (sourceUpdated && cd.source_turma_deck_id) {
          const syncedAt = (cd as any).synced_at;
          if (!syncedAt || new Date(sourceUpdated) > new Date(syncedAt)) {
            pending.add(cd.id);
          }
        }
      }
      return pending;
    },
    enabled: !!user && sourceTurmaDeckIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const decksWithPendingUpdates = pendingUpdatesQuery.data ?? new Set<string>();

  const archivedDecks = useMemo(
    () => {
      // Include archived top-level decks in current folder
      const topLevel = decks.filter(d => d.is_archived && !d.parent_deck_id && d.folder_id === currentFolderId);
      // Include archived sub-decks whose parent is in the current folder (and parent is NOT archived)
      const archivedSubs = decks.filter(d => d.is_archived && d.parent_deck_id && !topLevel.some(t => t.id === d.id));
      const subsInFolder = archivedSubs.filter(d => {
        const parent = decks.find(p => p.id === d.parent_deck_id);
        return parent && parent.folder_id === currentFolderId && !parent.is_archived;
      });
      return [...topLevel, ...subsInFolder];
    },
    [decks, currentFolderId]
  );

  const archivedFolders = useMemo(
    () => folders.filter(f => f.is_archived && f.parent_id === currentFolderId),
    [folders, currentFolderId]
  );

  const totalArchived = archivedDecks.length + archivedFolders.length;

  const getSubDecks = (parentId: string) =>
    decks.filter(d => d.parent_deck_id === parentId && !d.is_archived);

  // For community link detection, include archived sub-decks too
  const getAllSubDecks = (parentId: string) =>
    decks.filter(d => d.parent_deck_id === parentId);

  /** Returns raw (uncapped) aggregated counts across all descendants */
  const getRawAggregateStats = (deck: DeckWithStats): { new_count: number; learning_count: number; review_count: number; newReviewed: number; newGraduated: number; reviewed: number } => {
    const subs = getSubDecks(deck.id);
    let n = deck.new_count, l = deck.learning_count, r = deck.review_count;
    let newReviewed = deck.new_reviewed_today ?? 0;
    let newGraduated = deck.new_graduated_today ?? 0;
    let reviewed = deck.reviewed_today ?? 0;
    for (const sub of subs) {
      const s = getRawAggregateStats(sub);
      n += s.new_count; l += s.learning_count; r += s.review_count;
      newReviewed += s.newReviewed;
      newGraduated += s.newGraduated;
      reviewed += s.reviewed;
    }
    return { new_count: n, learning_count: l, review_count: r, newReviewed, newGraduated, reviewed };
  };

  /** Aggregates descendant counts then caps using ROOT ancestor's limits. */
  const getAggregateStats = (deck: DeckWithStats): { new_count: number; learning_count: number; review_count: number; reviewed_today: number } => {
    const raw = getRawAggregateStats(deck);

    // Find root ancestor — its config governs the entire hierarchy
    let rootDeck = deck;
    while (rootDeck.parent_deck_id) {
      const parent = decks.find(d => d.id === rootDeck.parent_deck_id);
      if (!parent) break;
      rootDeck = parent;
    }

    const dailyNewLimit = rootDeck.daily_new_limit ?? 20;
    const dailyReviewLimit = rootDeck.daily_review_limit ?? 100;

    // Count newReviewed across the ENTIRE root hierarchy (not just this deck's subtree)
    const rootRaw = rootDeck.id === deck.id ? raw : getRawAggregateStats(rootDeck);

    // When plan exists, global limit overrides deck limit; otherwise use min of both
    const hasPlanActive = planRootIds && planRootIds.size > 0;
    const deckRemaining = Math.max(0, dailyNewLimit - rootRaw.newReviewed);
    const effectiveNew = hasPlanActive
      ? Math.max(0, Math.min(raw.new_count, globalNewRemaining))
      : Math.max(0, Math.min(raw.new_count, deckRemaining, globalNewRemaining));
    const reviewReviewedToday = Math.max(0, rootRaw.reviewed - rootRaw.newGraduated);
    const effectiveReview = Math.max(0, Math.min(raw.review_count, dailyReviewLimit - reviewReviewedToday));
    return { new_count: effectiveNew, learning_count: raw.learning_count, review_count: effectiveReview, reviewed_today: raw.reviewed };
  };

  const getDescendantIds = (folderId: string): string[] => {
    const children = folders.filter(f => f.parent_id === folderId);
    return [folderId, ...children.flatMap(c => getDescendantIds(c.id))];
  };

  const getDescendantDeckIds = (deckId: string): string[] => {
    const children = decks.filter(d => d.parent_deck_id === deckId);
    return [deckId, ...children.flatMap(c => getDescendantDeckIds(c.id))];
  };

  const movableFolders = useMemo(() => {
    if (!moveTarget) return [];
    if (moveParentDeckId) return []; // browsing inside a deck — no folders to show
    const excludeIds = moveTarget.type === 'folder' ? getDescendantIds(moveTarget.id) : [];
    return folders.filter(f =>
      f.parent_id === moveBrowseFolderId && !f.is_archived && !excludeIds.includes(f.id)
    );
  }, [moveTarget, moveBrowseFolderId, moveParentDeckId, folders]);

  /** Decks available as move targets (potential parents) in current browse context */
  const movableDecks = useMemo(() => {
    if (!moveTarget || moveTarget.type === 'folder') return [];
    const excludeIds = getDescendantDeckIds(moveTarget.id);
    if (moveParentDeckId) {
      // Show sub-decks of the currently browsed deck
      return decks.filter(d =>
        d.parent_deck_id === moveParentDeckId && !d.is_archived && !excludeIds.includes(d.id)
      );
    }
    // Show root decks in the current browsed folder
    return decks.filter(d =>
      d.folder_id === moveBrowseFolderId && !d.parent_deck_id && !d.is_archived && !excludeIds.includes(d.id)
    );
  }, [moveTarget, moveBrowseFolderId, moveParentDeckId, decks]);

  const moveBreadcrumb = useMemo(() => {
    const path: BreadcrumbItem[] = [{ id: null, name: 'Início' }];
    if (moveBrowseFolderId) {
      const buildFolderPath = (fId: string) => {
        const folder = folders.find(f => f.id === fId);
        if (!folder) return;
        if (folder.parent_id) buildFolderPath(folder.parent_id);
        path.push({ id: folder.id, name: folder.name });
      };
      buildFolderPath(moveBrowseFolderId);
    }
    if (moveParentDeckId) {
      const buildDeckPath = (dId: string) => {
        const deck = decks.find(d => d.id === dId);
        if (!deck) return;
        if (deck.parent_deck_id) buildDeckPath(deck.parent_deck_id);
        path.push({ id: `deck:${deck.id}`, name: deck.name });
      };
      buildDeckPath(moveParentDeckId);
    }
    return path;
  }, [moveBrowseFolderId, moveParentDeckId, folders, decks]);

  const getCommunityLinkId = (deck: DeckWithStats): string | null => {
    if (deck.source_turma_deck_id) return deck.source_turma_deck_id;
    // Check ALL sub-decks (including archived) for community link
    const subs = getAllSubDecks(deck.id);
    for (const sub of subs) {
      const id = getCommunityLinkId(sub);
      if (id) return id;
    }
    return null;
  };

  const getFolderCommunityLinkId = (folderId: string): string | null => {
    const folderDecks = decks.filter(d => d.folder_id === folderId);
    for (const d of folderDecks) {
      const id = getCommunityLinkId(d);
      if (id) return id;
    }
    return null;
  };

  const toggleDeckSelection = (id: string) => {
    setSelectedDeckIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return {
    // Data
    decks, folders, isLoading,
    currentFolderId, setCurrentFolderId,
    currentFolders, currentDecks, communityDecks, decksWithPendingUpdates,
    archivedDecks, archivedFolders, totalArchived,
    breadcrumb, moveBreadcrumb, movableFolders,
    expandedDecks, toggleExpand,

    // Mutations
    createDeck, deleteDeck, archiveDeck, duplicateDeck, resetProgress, moveDeck, reorderDecks,
    createFolder, updateFolder, deleteFolder, archiveFolder, moveFolder, reorderFolders,

    // Dialog states
    createType, setCreateType, createName, setCreateName,
    createParentDeckId, setCreateParentDeckId,
    deleteTarget, setDeleteTarget,
    renameTarget, setRenameTarget, renameName, setRenameName,
    moveTarget, setMoveTarget, moveBrowseFolderId, setMoveBrowseFolderId,
    moveParentDeckId, setMoveParentDeckId,
    importOpen, setImportOpen, importDeckId, setImportDeckId,
    importDeckName, setImportDeckName,
    aiDeckOpen, setAiDeckOpen,
    premiumOpen, setPremiumOpen,
    premiumTab, setPremiumTab,
    creditsOpen, setCreditsOpen,
    deckSelectionMode, setDeckSelectionMode,
    selectedDeckIds, setSelectedDeckIds,
    bulkMoveDeckOpen, setBulkMoveDeckOpen,
    bulkMoveTargetFolder, setBulkMoveTargetFolder,
    duplicateWarning, setDuplicateWarning,
    showArchived, setShowArchived,
    toggleDeckSelection,

    // Helpers
    getSubDecks, getAggregateStats, getCommunityLinkId, getFolderCommunityLinkId,
    getFolderDueCount, folderHasCommunityLink,
    movableDecks,
    globalNewRemaining,
  };

  function getFolderDueCount(folderId: string): number {
    const childFolderIds = folders.filter(f => f.parent_id === folderId && !f.is_archived).map(f => f.id);
    const folderDecksHere = decks.filter(d => d.folder_id === folderId && !d.parent_deck_id && !d.is_archived);
    let total = 0;
    for (const d of folderDecksHere) {
      const s = getAggregateStats(d);
      total += s.new_count + s.learning_count + s.review_count;
    }
    for (const cfId of childFolderIds) {
      total += getFolderDueCount(cfId);
    }
    return total;
  }

  /** Returns true if folder contains any community-linked deck (direct or via sub-decks). */
  function folderHasCommunityLink(folderId: string): boolean {
    const folderDecksHere = decks.filter(d => d.folder_id === folderId);
    for (const d of folderDecksHere) {
      // Check this deck and all its sub-decks recursively
      if (getCommunityLinkId(d)) return true;
    }
    // Check sub-folders recursively (including non-archived ones)
    const childFolders = folders.filter(f => f.parent_id === folderId);
    for (const cf of childFolders) {
      if (folderHasCommunityLink(cf.id)) return true;
    }
    return false;
  }
}
