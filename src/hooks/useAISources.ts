/**
 * Hook for managing AI sources — persistent text/file context for AI generation.
 * Provides CRUD operations with React Query caching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import * as aiSourceService from '@/services/aiSourceService';
import type { AISource } from '@/services/aiSourceService';

const QUERY_KEY = ['ai-sources'];

export function useAISources() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sources = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: aiSourceService.fetchAISources,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const saveText = useMutation({
    mutationFn: ({ name, textContent }: { name: string; textContent: string }) =>
      aiSourceService.saveTextSource(user!.id, name, textContent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar fonte', description: err.message, variant: 'destructive' });
    },
  });

  const saveFile = useMutation({
    mutationFn: (file: File) => aiSourceService.saveFileSource(user!.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar arquivo', description: err.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: (source: AISource) => aiSourceService.deleteAISource(source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    sources,
    isLoading,
    saveText,
    saveFile,
    remove,
  };
}

export type { AISource };
