/**
 * Custom hook encapsulating all Dashboard local state and derived data.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDecks, type DeckWithStats } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';

export interface BreadcrumbItem { id: string | null; name: string }

export function useDashboardState() {
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
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [deckSelectionMode, setDeckSelectionMode] = useState(false);
  const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
  const [bulkMoveDeckOpen, setBulkMoveDeckOpen] = useState(false);
  const [bulkMoveTargetFolder, setBulkMoveTargetFolder] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; type: 'deck' | 'folder'; action: () => void } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const currentDecks = useMemo(
    () => decks.filter(d => d.folder_id === currentFolderId && !d.parent_deck_id && !d.is_archived)
      .sort((a, b) => (a as any).sort_order - (b as any).sort_order || a.name.localeCompare(b.name)),
    [decks, currentFolderId]
  );

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

  /** Aggregates descendant counts then caps using THIS deck's limits */
  const getAggregateStats = (deck: DeckWithStats): { new_count: number; learning_count: number; review_count: number; reviewed_today: number } => {
    const raw = getRawAggregateStats(deck);
    const dailyNewLimit = deck.daily_new_limit ?? 20;
    const dailyReviewLimit = deck.daily_review_limit ?? 100;
    const effectiveNew = Math.max(0, Math.min(raw.new_count, dailyNewLimit - raw.newReviewed));
    const reviewReviewedToday = Math.max(0, raw.reviewed - raw.newGraduated);
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
        path.push({ id: `deck:${deck.id}`, name: `📦 ${deck.name}` });
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
    currentFolders, currentDecks,
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
