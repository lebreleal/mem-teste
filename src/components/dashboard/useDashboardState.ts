/**
 * Custom hook encapsulating all Dashboard local state and derived data.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDecks, type DeckWithStats } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';

export interface BreadcrumbItem { id: string | null; name: string }

export function useDashboardState() {
  const { decks, isLoading: decksLoading, createDeck, deleteDeck, archiveDeck, duplicateDeck, resetProgress, moveDeck } = useDecks();
  const { folders, isLoading: foldersLoading, createFolder, updateFolder, deleteFolder, archiveFolder, moveFolder } = useFolders();

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
    () => folders.filter(f => f.parent_id === currentFolderId && !f.is_archived),
    [folders, currentFolderId]
  );

  const currentDecks = useMemo(
    () => decks.filter(d => d.folder_id === currentFolderId && !d.parent_deck_id && !d.is_archived),
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

  const getAggregateStats = (deck: DeckWithStats): { new_count: number; learning_count: number; review_count: number; reviewed_today: number } => {
    const subs = getSubDecks(deck.id);
    let n = deck.new_count, l = deck.learning_count, r = deck.review_count;
    for (const sub of subs) {
      const s = getAggregateStats(sub);
      n += s.new_count; l += s.learning_count; r += s.review_count;
    }
    return { new_count: n, learning_count: l, review_count: r, reviewed_today: 0 };
  };

  const getDescendantIds = (folderId: string): string[] => {
    const children = folders.filter(f => f.parent_id === folderId);
    return [folderId, ...children.flatMap(c => getDescendantIds(c.id))];
  };

  const movableFolders = useMemo(() => {
    if (!moveTarget) return [];
    const excludeIds = moveTarget.type === 'folder' ? getDescendantIds(moveTarget.id) : [];
    return folders.filter(f =>
      f.parent_id === moveBrowseFolderId && !f.is_archived && !excludeIds.includes(f.id)
    );
  }, [moveTarget, moveBrowseFolderId, folders]);

  const moveBreadcrumb = useMemo(() => {
    const path: BreadcrumbItem[] = [{ id: null, name: 'Início' }];
    if (!moveBrowseFolderId) return path;
    const buildPath = (fId: string) => {
      const folder = folders.find(f => f.id === fId);
      if (!folder) return;
      if (folder.parent_id) buildPath(folder.parent_id);
      path.push({ id: folder.id, name: folder.name });
    };
    buildPath(moveBrowseFolderId);
    return path;
  }, [moveBrowseFolderId, folders]);

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
    createDeck, deleteDeck, archiveDeck, duplicateDeck, resetProgress, moveDeck,
    createFolder, updateFolder, deleteFolder, archiveFolder, moveFolder,

    // Dialog states
    createType, setCreateType, createName, setCreateName,
    createParentDeckId, setCreateParentDeckId,
    deleteTarget, setDeleteTarget,
    renameTarget, setRenameTarget, renameName, setRenameName,
    moveTarget, setMoveTarget, moveBrowseFolderId, setMoveBrowseFolderId,
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
    getFolderDueCount,
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
}
