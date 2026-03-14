/**
 * Extracted from Dashboard.tsx — all mutation handlers for dashboard CRUD operations.
 * Keeps Dashboard.tsx focused on layout/rendering.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  renameDeck, deleteDeckCascade, bulkMoveDecks, bulkArchiveDecks,
  bulkDeleteDecks, getTurmaDeckNavInfo,
} from '@/services/deckService';

interface DashboardState {
  dashboardSection: 'personal' | 'community';
  decks: { id: string; name: string; parent_deck_id: string | null; folder_id: string | null; is_archived: boolean }[];
  folders: { id: string; name: string; parent_id: string | null; is_archived: boolean; section?: 'personal' | 'community' }[];
  currentFolderId: string | null;
  currentDecks: { id: string }[];

  // Dialog state setters
  createType: 'deck' | 'folder' | null;
  setCreateType: (v: 'deck' | 'folder' | null) => void;
  createName: string;
  setCreateName: (v: string) => void;
  createParentDeckId: string | null;
  setCreateParentDeckId: (v: string | null) => void;

  renameTarget: { type: 'deck' | 'folder'; id: string; name: string } | null;
  setRenameTarget: (v: any) => void;
  renameName: string;

  deleteTarget: { type: 'deck' | 'folder'; id: string; name: string } | null;
  setDeleteTarget: (v: any) => void;

  moveTarget: { type: 'deck' | 'folder'; id: string; name: string } | null;
  setMoveTarget: (v: any) => void;
  moveBrowseFolderId: string | null;
  setMoveBrowseFolderId: (v: string | null) => void;
  moveParentDeckId: string | null;
  setMoveParentDeckId: (v: string | null) => void;

  duplicateWarning: any;
  setDuplicateWarning: (v: any) => void;

  selectedDeckIds: Set<string>;
  setSelectedDeckIds: (v: Set<string>) => void;
  setDeckSelectionMode: (v: boolean) => void;
  setBulkMoveDeckOpen: (v: boolean) => void;

  // Mutations from useDashboardState
  createDeck: { mutate: (args: any, opts?: any) => void; isPending: boolean };
  createFolder: { mutate: (args: any, opts?: any) => void; isPending: boolean };
  updateFolder: { mutate: (args: any, opts?: any) => void };
  moveDeck: { mutate: (args: any, opts?: any) => void };
  moveFolder: { mutate: (args: any, opts?: any) => void };
  archiveDeck: { mutate: (id: string) => void };
  archiveFolder: { mutate: (id: string) => void };
  toggleExpand: (id: string) => void;
}

export function useDashboardActions(state: DashboardState, defaultAlgorithm: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  

  const doCreate = useCallback((name: string) => {
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
      state.createFolder.mutate({ name, parentId: state.currentFolderId, section: state.dashboardSection }, {
        onSuccess: () => { state.setCreateType(null); state.setCreateName(''); toast({ title: 'Classe criada!' }); },
        onError: () => toast({ title: 'Erro ao criar classe', variant: 'destructive' }),
      });
    }
  }, [state, defaultAlgorithm, toast]);

  /** Generate a unique name by appending (1), (2), etc. if duplicate exists */
  const getUniqueName = useCallback((baseName: string, existingNames: string[]): string => {
    const lower = existingNames.map(n => n.toLowerCase());
    if (!lower.includes(baseName.toLowerCase())) return baseName;
    let i = 1;
    while (lower.includes(`${baseName} (${i})`.toLowerCase())) i++;
    return `${baseName} (${i})`;
  }, []);

  const handleCreateSubmit = useCallback(() => {
    if (!state.createName.trim()) return;
    const trimmed = state.createName.trim();

    let finalName = trimmed;
    if (state.createType === 'deck') {
      const siblings = state.createParentDeckId
        ? state.decks.filter(d => d.parent_deck_id === state.createParentDeckId && !d.is_archived)
        : state.decks.filter(d => d.folder_id === state.currentFolderId && !d.parent_deck_id && !d.is_archived);
      finalName = getUniqueName(trimmed, siblings.map(d => d.name));
    } else {
      const siblingFolders = state.folders.filter(
        f => f.parent_id === state.currentFolderId && !f.is_archived && (f.section ?? 'personal') === state.dashboardSection
      );
      finalName = getUniqueName(trimmed, siblingFolders.map(f => f.name));
    }
    doCreate(finalName);
  }, [state, doCreate, getUniqueName]);

  const handleRenameSubmit = useCallback(async () => {
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
  }, [state, queryClient, toast]);

  const handleDeleteDeckRequest = useCallback(async (deck: { id: string; name: string }) => {
    state.setDeleteTarget({ type: 'deck', id: deck.id, name: deck.name });
  }, [state]);

  const handleDeleteSubmit = useCallback(async () => {
    if (!state.deleteTarget) return;
    try {
      if (state.deleteTarget.type === 'folder') {
        // Move all decks out of this folder before deleting (avoid FK constraint)
        await supabase.from('decks').update({ folder_id: null } as any).eq('folder_id', state.deleteTarget.id);
        // Clear source_turma references before deleting to avoid FK issues
        await supabase.from('folders').update({ source_turma_id: null, source_turma_subject_id: null } as any).eq('id', state.deleteTarget.id);
        const { error } = await supabase.from('folders').delete().eq('id', state.deleteTarget.id);
        if (error) throw error;
        toast({ title: 'Classe excluída' });
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
  }, [state, queryClient, toast]);

  const handleMoveSubmit = useCallback(() => {
    if (!state.moveTarget) return;
    if (state.moveTarget.type === 'deck') {
      const targetFolderId = state.moveParentDeckId ? null : state.moveBrowseFolderId;
      let folderId = targetFolderId;
      if (state.moveParentDeckId) {
        const parentDeck = state.decks.find(d => d.id === state.moveParentDeckId);
        folderId = parentDeck?.folder_id ?? null;
      }
      state.moveDeck.mutate(
        { id: state.moveTarget.id, folderId, parentDeckId: state.moveParentDeckId ?? null },
        {
          onSuccess: () => { state.setMoveTarget(null); state.setMoveParentDeckId(null); toast({ title: 'Baralho movido!' }); },
          onError: () => toast({ title: 'Erro ao mover', variant: 'destructive' }),
        }
      );
    } else {
      state.moveFolder.mutate({ id: state.moveTarget.id, parentId: state.moveBrowseFolderId }, {
        onSuccess: () => { state.setMoveTarget(null); toast({ title: 'Sala movida!' }); },
        onError: () => toast({ title: 'Erro ao mover', variant: 'destructive' }),
      });
    }
  }, [state, toast]);

  const handleBulkMoveSubmit = useCallback(async () => {
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
  }, [state, queryClient, toast]);

  const handleBulkArchive = useCallback(async () => {
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
  }, [state, queryClient, toast]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(state.selectedDeckIds);
    try {
      await bulkDeleteDecks(ids);
      toast({ title: `${ids.length} baralho(s) excluído(s)!` });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
    state.setSelectedDeckIds(new Set());
    state.setDeckSelectionMode(false);
  }, [state, queryClient, toast]);

  const handleNavigateCommunity = useCallback(async (sourceTurmaDeckId: string) => {
    const info = await getTurmaDeckNavInfo(sourceTurmaDeckId);
    if (info) {
      if (info.lesson_id) navigate(`/turmas/${info.turma_id}/lessons/${info.lesson_id}`);
      else navigate(`/turmas/${info.turma_id}`);
    }
  }, [navigate]);

  return {
    handleCreateSubmit,
    handleRenameSubmit,
    handleDeleteDeckRequest,
    handleDeleteSubmit,
    handleMoveSubmit,
    handleBulkMoveSubmit,
    handleBulkArchive,
    handleBulkDelete,
    handleNavigateCommunity,
  };
}
