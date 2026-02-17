import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import * as feedbackService from '@/services/feedbackService';
import type { FeatureComment, FeatureRequest } from '@/types/feedback';

export type { FeatureComment, FeatureRequest } from '@/types/feedback';

export function useFeatureRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: features = [], isLoading } = useQuery({
    queryKey: ['feature-requests'],
    queryFn: () => feedbackService.fetchFeatureRequests(user!.id),
    enabled: !!user,
  });

  const createFeature = useMutation({
    mutationFn: ({ title, description, category: cat }: { title: string; description: string; category: string }) => {
      if (!user) throw new Error('Not authenticated');
      return feedbackService.createFeatureRequest(user.id, title, description, cat);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      toast({ title: 'Sugestão enviada!' });
    },
    onError: () => toast({ title: 'Erro ao enviar', variant: 'destructive' }),
  });

  const toggleVote = useMutation({
    mutationFn: ({ featureId, hasVoted }: { featureId: string; hasVoted: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      return feedbackService.toggleVote(user.id, featureId, hasVoted);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-requests'] }),
  });

  const deleteFeature = useMutation({
    mutationFn: (featureId: string) => feedbackService.deleteFeatureRequest(featureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      toast({ title: 'Sugestão removida' });
    },
  });

  const updateFeature = useMutation({
    mutationFn: ({ featureId, updates }: { featureId: string; updates: { title?: string; description?: string; category?: string } }) =>
      feedbackService.updateFeatureRequest(featureId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      toast({ title: 'Feedback atualizado!' });
    },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  });

  return { features, isLoading, createFeature, toggleVote, deleteFeature, updateFeature };
}

export function useFeatureComments(featureId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['feature-comments', featureId],
    queryFn: () => feedbackService.fetchFeatureComments(featureId!),
    enabled: !!user && !!featureId,
  });

  const addComment = useMutation({
    mutationFn: (content: string) => {
      if (!user || !featureId) throw new Error('Not ready');
      return feedbackService.addFeatureComment(user.id, featureId, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-comments', featureId] });
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
    },
    onError: () => toast({ title: 'Erro ao comentar', variant: 'destructive' }),
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => feedbackService.deleteFeatureComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-comments', featureId] });
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
    },
  });

  return { comments, isLoading, addComment, deleteComment };
}
