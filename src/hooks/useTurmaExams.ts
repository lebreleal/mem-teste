import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as turmaService from '@/services/turmaService';
import type { TurmaExam, TurmaExamQuestion, TurmaExamAttempt } from '@/types/turma';

export type { TurmaExam, TurmaExamQuestion, TurmaExamAttempt } from '@/types/turma';

export const useTurmaExams = (turmaId: string) => {
  return useQuery({
    queryKey: ['turma-exams', turmaId],
    queryFn: () => turmaService.fetchTurmaExams(turmaId),
    enabled: !!turmaId,
  });
};

export const useTurmaExamQuestions = (examId: string) => {
  return useQuery({
    queryKey: ['turma-exam-questions', examId],
    queryFn: () => turmaService.fetchTurmaExamQuestions(examId),
    enabled: !!examId,
  });
};

export const useTurmaExamMutations = (turmaId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createExam = useMutation({
    mutationFn: (params: { title: string; description?: string; subjectId?: string; lessonId?: string; timeLimitSeconds?: number }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.createTurmaExam(turmaId, user.id, params);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }),
  });

  const addQuestionToExam = useMutation({
    mutationFn: (params: { examId: string; questionText: string; questionType: string; options?: any; correctAnswer: string; correctIndices?: number[]; points?: number; questionId?: string }) =>
      turmaService.addQuestionToExam(params),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-exam-questions'] }); queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }); },
  });

  const addQuestionsFromBank = useMutation({
    mutationFn: (params: { examId: string; questionIds: string[] }) => turmaService.addQuestionsFromBank(params.examId, params.questionIds),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-exam-questions'] }); queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }); },
  });

  const addQuestionsFromDeck = useMutation({
    mutationFn: (params: { examId: string; deckId: string; count?: number }) => turmaService.addQuestionsFromDeck(params.examId, params.deckId, params.count),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-exam-questions'] }); queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }); },
  });

  const publishExam = useMutation({
    mutationFn: (params: { examId: string; isMarketplace?: boolean; price?: number }) => turmaService.publishTurmaExam(params.examId, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }),
  });

  const deleteExam = useMutation({
    mutationFn: (examId: string) => turmaService.deleteTurmaExam(examId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }),
  });

  const toggleSubscribersOnly = useMutation({
    mutationFn: (params: { examId: string; subscribersOnly: boolean }) => turmaService.toggleExamSubscribersOnly(params.examId, params.subscribersOnly),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }),
  });

  return { createExam, addQuestionToExam, addQuestionsFromBank, addQuestionsFromDeck, publishExam, deleteExam, toggleSubscribersOnly };
};

export const useTurmaExamAttempt = (examId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const attemptsQuery = useQuery({
    queryKey: ['turma-exam-attempts', examId, user?.id],
    queryFn: () => turmaService.fetchTurmaExamAttempts(examId, user!.id),
    enabled: !!examId && !!user,
  });

  const startAttempt = useMutation({
    mutationFn: (totalPoints: number) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.startTurmaExamAttempt(examId, user.id, totalPoints);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exam-attempts', examId] }),
  });

  const submitAnswer = useMutation({
    mutationFn: (params: { attemptId: string; questionId: string; userAnswer?: string; selectedIndices?: number[]; scoredPoints: number }) =>
      turmaService.submitTurmaExamAnswer(params),
  });

  const completeAttempt = useMutation({
    mutationFn: (params: { attemptId: string; scoredPoints: number }) => turmaService.completeTurmaExamAttempt(params.attemptId, params.scoredPoints),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exam-attempts', examId] }),
  });

  const restartExam = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.restartTurmaExam(examId, user.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exam-attempts', examId] }),
  });

  return { attempts: attemptsQuery.data ?? [], isLoading: attemptsQuery.isLoading, startAttempt, submitAnswer, completeAttempt, restartExam };
};
