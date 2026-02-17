import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as examFolderService from '@/services/examFolderService';

export type { ExamFolder } from '@/services/examFolderService';

export const useExamFolders = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ['exam-folders', user?.id],
    queryFn: () => examFolderService.fetchExamFolders(),
    enabled: !!user,
  });

  const createFolder = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      return examFolderService.createExamFolder(user.id, name, parentId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam-folders'] }),
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => examFolderService.updateExamFolder(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam-folders'] }),
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => examFolderService.deleteExamFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-folders'] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });

  const moveFolder = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) => examFolderService.moveExamFolder(id, parentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam-folders'] }),
  });

  return { folders: foldersQuery.data ?? [], isLoading: foldersQuery.isLoading, createFolder, updateFolder, deleteFolder, moveFolder };
};
