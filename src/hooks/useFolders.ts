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
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      return folderService.createFolder(user.id, name, parentId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders'] }),
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => folderService.updateFolder(id, name),
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

  return {
    folders: foldersQuery.data ?? [],
    isLoading: foldersQuery.isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    archiveFolder,
    moveFolder,
  };
};
