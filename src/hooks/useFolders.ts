import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as folderService from '@/services/folderService';
import type { Folder } from '@/types/folder';

// Re-export for backward compatibility
export type { Folder } from '@/types/folder';

export const useFolders = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ['folders', user?.id],
    queryFn: () => folderService.fetchFolders(user!.id),
    enabled: !!user,
  });

  const createFolder = useMutation({
    mutationFn: ({ name, parentId, section }: { name: string; parentId?: string | null; section?: Folder['section'] }) => {
      if (!user) throw new Error('Not authenticated');
      return folderService.createFolder(user.id, name, parentId, section ?? 'personal');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, name, image_url }: { id: string; name?: string; image_url?: string | null }) => folderService.updateFolder(id, { name, image_url }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => folderService.deleteFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  const archiveFolder = useMutation({
    mutationFn: (id: string) => folderService.archiveFolder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const moveFolder = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) => folderService.moveFolder(id, parentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const reorderFolders = useMutation({
    mutationFn: (orderedIds: string[]) => folderService.reorderFolders(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ['folders', user?.id] });
      const previous = queryClient.getQueryData<Folder[]>(['folders', user?.id]);
      if (previous) {
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
        const updated = previous.map(f => orderMap.has(f.id) ? { ...f, sort_order: orderMap.get(f.id)! } : f);
        queryClient.setQueryData(['folders', user?.id], updated);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['folders', user?.id], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  return {
    folders: foldersQuery.data ?? [],
    isLoading: foldersQuery.isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    archiveFolder,
    moveFolder,
    reorderFolders,
  };
};
