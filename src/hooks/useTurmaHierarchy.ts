import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as turmaService from '@/services/turmaService';
import type { TurmaRole, TurmaMember, TurmaSemester, TurmaSubject, TurmaLesson, TurmaDeck } from '@/types/turma';

export type { TurmaRole, TurmaMember, TurmaSemester, TurmaSubject, TurmaLesson, TurmaDeck } from '@/types/turma';

export const useTurmaRole = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-role', turmaId, user?.id],
    queryFn: () => turmaService.fetchTurmaRole(user!.id, turmaId),
    enabled: !!user && !!turmaId,
  });
};

export const useTurmaMembers = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-members', turmaId],
    queryFn: () => turmaService.fetchTurmaMembers(turmaId),
    enabled: !!user && !!turmaId,
  });
};

export const useTurmaSemesters = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-semesters', turmaId],
    queryFn: () => turmaService.fetchTurmaSemesters(turmaId),
    enabled: !!user && !!turmaId,
  });
};

export const useTurmaSubjects = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-subjects', turmaId],
    queryFn: () => turmaService.fetchTurmaSubjects(turmaId),
    enabled: !!user && !!turmaId,
  });
};

export const useTurmaLessons = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-lessons', turmaId],
    queryFn: () => turmaService.fetchTurmaLessons(turmaId),
    enabled: !!user && !!turmaId,
  });
};

export const useTurmaDecks = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-decks', turmaId],
    queryFn: () => turmaService.fetchTurmaDecks(turmaId),
    enabled: !!user && !!turmaId,
  });
};

export const useTurmaHierarchyMutations = (turmaId: string) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const createSemester = useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.createSemester(turmaId, user.id, name, description);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-semesters', turmaId] }),
  });

  const deleteSemester = useMutation({
    mutationFn: (id: string) => turmaService.deleteSemester(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['turma-semesters', turmaId] }); qc.invalidateQueries({ queryKey: ['turma-subjects', turmaId] }); },
  });

  const createSubject = useMutation({
    mutationFn: (params: { name: string; description?: string; semesterId?: string | null; parentId?: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.createSubject(turmaId, user.id, params);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-subjects', turmaId] }),
  });

  const updateSubject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => turmaService.updateSubject(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-subjects', turmaId] }),
  });

  const deleteSubject = useMutation({
    mutationFn: (id: string) => turmaService.deleteSubject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['turma-subjects', turmaId] }); qc.invalidateQueries({ queryKey: ['turma-lessons', turmaId] }); },
  });

  const createLesson = useMutation({
    mutationFn: (params: { subjectId?: string | null; name: string; description?: string; lessonDate?: string | null; isPublished?: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.createLesson(turmaId, user.id, params);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-lessons', turmaId] }),
  });

  const deleteLesson = useMutation({
    mutationFn: (id: string) => turmaService.deleteLesson(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-lessons', turmaId] }),
  });

  const updateLesson = useMutation({
    mutationFn: ({ id, name, lessonDate, isPublished }: { id: string; name?: string; lessonDate?: string | null; isPublished?: boolean }) =>
      turmaService.updateLesson(id, { name, lessonDate, isPublished }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-lessons', turmaId] }),
  });

  const shareDeck = useMutation({
    mutationFn: (params: { deckId: string; subjectId?: string | null; lessonId?: string | null; price?: number; priceType?: string; allowDownload?: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.shareDeck(turmaId, user.id, params);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-decks', turmaId] }),
  });

  const updateDeckPricing = useMutation({
    mutationFn: ({ id, price, priceType, allowDownload }: { id: string; price: number; priceType: string; allowDownload?: boolean }) =>
      turmaService.updateDeckPricing(id, { price, priceType, allowDownload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-decks', turmaId] }),
  });

  const unshareDeck = useMutation({
    mutationFn: (id: string) => turmaService.unshareDeck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-decks', turmaId] }),
  });

  const changeMemberRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TurmaRole }) => turmaService.changeMemberRole(turmaId, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-members', turmaId] }),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => turmaService.removeMember(turmaId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-members', turmaId] }),
  });

  const toggleSubscriber = useMutation({
    mutationFn: ({ userId, isSubscriber }: { userId: string; isSubscriber: boolean }) => turmaService.toggleSubscriber(turmaId, userId, isSubscriber),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-members', turmaId] }),
  });

  const updateLessonContent = useMutation({
    mutationFn: ({ id, summary, materials }: { id: string; summary?: string; materials?: { title: string; url: string }[] }) =>
      turmaService.updateLessonContent(id, { summary, materials }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turma-lessons', turmaId] }),
  });

  return { createSemester, deleteSemester, createSubject, updateSubject, deleteSubject, createLesson, deleteLesson, updateLesson, updateLessonContent, shareDeck, updateDeckPricing, unshareDeck, changeMemberRole, removeMember, toggleSubscriber };
};
