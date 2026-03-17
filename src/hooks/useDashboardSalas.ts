/**
 * useDashboardSalas — Salas Seguidas logic extracted from Dashboard.tsx.
 * Handles: turma query, community folder detection, bootstrap sync,
 * leave sala, publish toggle, detach community deck, share slug.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import {
  fetchUserOwnTurma, fetchCommunityFolderInfo, createTurmaWithOwner,
  updateTurma, publishDecksToTurma, removeTurmaMember, ensureShareSlug,
} from '@/services/turma/turmaCrud';
import { clearFolderTurmaLink, deleteFolder, uploadFolderImage } from '@/services/folderService';
import { detachCommunityDeck } from '@/services/deck/deckCrud';

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  is_archived: boolean;
  image_url?: string | null;
  source_turma_id?: string | null;
}

interface UseDashboardSalasArgs {
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  folders: Folder[];
  decks: { id: string; name: string; folder_id: string | null; is_archived: boolean; parent_deck_id: string | null }[];
}

export function useDashboardSalas({ currentFolderId, setCurrentFolderId, folders, decks }: UseDashboardSalasArgs) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setSearchParams] = useSearchParams();

  // Detect if current folder is a community-followed sala
  const currentFolder = folders.find(f => f.id === currentFolderId);
  const sourceTurmaId = currentFolder?.source_turma_id;
  const isCommunityFolder = !!sourceTurmaId;

  // Fetch user's turma for publish toggle
  const { data: userTurma, refetch: refetchTurma } = useQuery({
    queryKey: ['user-turma', user?.id],
    queryFn: () => fetchUserOwnTurma(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

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
    if (!user || !isCommunityFolder || !sourceTurmaId || !currentFolderId) return;
    if (bootstrapDoneRef.current.has(currentFolderId)) return;
    bootstrapDoneRef.current.add(currentFolderId);
    
    // Check if local decks already exist in this folder
    const localDecksInFolder = decks.filter(d => d.folder_id === currentFolderId && !d.is_archived);
    if (localDecksInFolder.length > 0) {
      // Decks exist — debounce incremental sync (2s delay, non-blocking)
      syncTimerRef.current = setTimeout(() => {
        import('@/services/followerBootstrap').then(({ syncFollowerDecks }) => {
          syncFollowerDecks(user.id, currentFolderId!).then((newCards) => {
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
      bootstrapFollowerDecks(user.id, sourceTurmaId, currentFolderId!).then((result) => {
        if (result.decks_created > 0) {
          queryClient.invalidateQueries({ queryKey: ['decks'] });
        }
      }).catch((err) => {
        console.error(err);
        toast({ title: 'Erro ao carregar decks da sala. Tente recarregar a página.', variant: 'destructive' });
      });
    });
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [user, isCommunityFolder, sourceTurmaId, currentFolderId]);

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
      setCurrentFolderId(null);
      setSearchParams({}, { replace: true });
      toast({ title: 'Sala removida do seu menu Início', description: 'Suas estatísticas e progresso ficam salvos por 30 dias.' });
    } catch (e: any) {
      toast({ title: 'Erro ao sair da sala', variant: 'destructive' });
    } finally {
      setLeaveSalaConfirm(null);
    }
  };

  // Publish/unpublish toggle
  const [publishing, setPublishing] = useState(false);
  const handleTogglePublish = useCallback(async () => {
    if (!user || !currentFolderId) return;

    setPublishing(true);
    try {
      let turmaId = userTurma?.id;
      const currentFolder = folders.find(f => f.id === currentFolderId);
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
      const folderDecks = decks.filter(d => d.folder_id === currentFolderId && !d.is_archived && !d.parent_deck_id);
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
  }, [user, userTurma, currentFolderId, folders, decks, refetchTurma, queryClient, toast]);

  // Detach community deck
  const [detachTarget, setDetachTarget] = useState<{ id: string; name: string } | null>(null);
  const [detaching, setDetaching] = useState(false);
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

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSlugEdit, setShareSlugEdit] = useState('');
  const [savingSlug, setSavingSlug] = useState(false);

  const openShareModal = useCallback(async () => {
    let turmaId = userTurma?.id;
    let slug = userTurma?.share_slug;
    if (!turmaId) {
      const cFolder = folders.find(f => f.id === currentFolderId);
      const fName = cFolder?.name ?? 'Minha Sala';
      const newTurma = await createTurmaWithOwner(user!.id, fName, { isPrivate: true });
      turmaId = newTurma.id;
      slug = newTurma.share_slug;
      await refetchTurma();
    }
    if (!slug && turmaId) {
      slug = await ensureShareSlug(turmaId);
      await refetchTurma();
    }
    setShareSlugEdit(slug || turmaId?.substring(0, 8) || '');
    setShareModalOpen(true);
  }, [userTurma, folders, currentFolderId, user, refetchTurma]);

  const handleSaveSlug = useCallback(async () => {
    if (!userTurma?.id || !shareSlugEdit) return;
    if (shareSlugEdit.length < 3) {
      toast({ title: 'O link precisa ter pelo menos 3 caracteres', variant: 'destructive' });
      return;
    }
    setSavingSlug(true);
    try {
      // Check uniqueness before saving
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: clash } = await supabase.from('turmas').select('id').eq('share_slug', shareSlugEdit).neq('id', userTurma.id).limit(1);
      if (clash && clash.length > 0) {
        toast({ title: 'Esse link já está em uso. Escolha outro!', variant: 'destructive' });
        setSavingSlug(false);
        return;
      }
      await updateTurma(userTurma.id, { shareSlug: shareSlugEdit });
      await refetchTurma();
      toast({ title: 'Link atualizado!' });
      setShareModalOpen(false);
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSavingSlug(false);
    }
  }, [userTurma, shareSlugEdit, refetchTurma, toast]);

  // Sala image (crop-based)
  const [salaImageOpen, setSalaImageOpen] = useState(false);
  const handleSalaImageCropped = useCallback(async (croppedFile: File) => {
    if (!currentFolderId) return;
    try {
      await uploadFolderImage(currentFolderId, croppedFile);
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: 'Imagem atualizada!' });
      setSalaImageOpen(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao enviar imagem', variant: 'destructive' });
    }
  }, [currentFolderId, queryClient, toast]);

  return {
    isCommunityFolder,
    sourceTurmaId,
    userTurma,
    refetchTurma,
    communityTurmaInfo,

    // Leave sala
    leaveSalaConfirm, setLeaveSalaConfirm,
    handleLeaveSala,

    // Publish
    publishing, handleTogglePublish,

    // Detach
    detachTarget, setDetachTarget,
    detaching, handleDetachDeck,

    // Share
    shareModalOpen, setShareModalOpen,
    shareSlugEdit, setShareSlugEdit,
    savingSlug, openShareModal, handleSaveSlug,

    // Sala image
    salaImageOpen, setSalaImageOpen,
    handleSalaImageCropped,
  };
}
