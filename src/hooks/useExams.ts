import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import * as examService from '@/services/examService';
import type { Exam, ExamQuestion } from '@/types/exam';

// Re-export for backward compatibility
export type { Exam, ExamQuestion } from '@/types/exam';

export const useExams = (deckId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const examsQuery = useQuery({
    queryKey: ['exams', user?.id, deckId],
    queryFn: () => examService.fetchExams(user!.id, deckId),
    enabled: !!user,
  });

  const createExam = useMutation({
    mutationFn: (params: {
      deckId: string;
      title: string;
      folderId?: string | null;
      questions: Array<{
        question_type: string;
        question_text: string;
        options?: string[];
        correct_answer: string;
        correct_indices?: number[];
        points: number;
        sort_order: number;
        card_id?: string;
      }>;
      timeLimitSeconds?: number;
    }) => {
      if (!user) throw new Error('Not authenticated');
      return examService.createExam({ userId: user.id, ...params });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });

  const updateExam = useMutation({
    mutationFn: async (params: {
      examId: string;
      title?: string;
      timeLimitSeconds?: number | null;
      questions?: Array<{
        id?: string;
        question_type: string;
        question_text: string;
        options?: string[];
        correct_answer: string;
        correct_indices?: number[];
        points: number;
        sort_order: number;
      }>;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const examUpdates: Record<string, any> = {};
      if (params.title !== undefined) examUpdates.title = params.title;
      if (params.timeLimitSeconds !== undefined) examUpdates.time_limit_seconds = params.timeLimitSeconds;

      if (Object.keys(examUpdates).length > 0) {
        const { error } = await (supabase.from('exams' as any) as any).update(examUpdates).eq('id', params.examId);
        if (error) throw error;
      }

      if (params.questions) {
        await (supabase.from('exam_questions' as any) as any).delete().eq('exam_id', params.examId);
        const totalPoints = params.questions.reduce((sum, q) => sum + q.points, 0);
        const questionsToInsert = params.questions.map(q => ({
          exam_id: params.examId,
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options ?? null,
          correct_answer: q.correct_answer,
          correct_indices: q.correct_indices || null,
          points: q.points,
          sort_order: q.sort_order,
        }));
        const { error: qError } = await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
        if (qError) throw qError;
        await (supabase.from('exams' as any) as any).update({ total_points: totalPoints }).eq('id', params.examId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam'] });
      queryClient.invalidateQueries({ queryKey: ['exam-questions'] });
    },
  });

  const deleteExam = useMutation({
    mutationFn: (examId: string) => examService.deleteExam(examId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });

  const restartExam = useMutation({
    mutationFn: (examId: string) => examService.restartExam(examId),
    onSuccess: (_data, examId) => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exam-questions', examId] });
    },
  });

  const startExam = useMutation({
    mutationFn: (examId: string) => examService.startExam(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam'] });
    },
  });

  const moveExam = useMutation({
    mutationFn: ({ examId, folderId }: { examId: string; folderId: string | null }) => examService.moveExam(examId, folderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });

  return { exams: examsQuery.data ?? [], isLoading: examsQuery.isLoading, createExam, updateExam, deleteExam, restartExam, startExam, moveExam };
};

export const useExamDetail = (examId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const examQuery = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => examService.fetchExam(examId),
    enabled: !!user && !!examId,
  });

  const questionsQuery = useQuery({
    queryKey: ['exam-questions', examId],
    queryFn: () => examService.fetchExamQuestions(examId),
    enabled: !!user && !!examId,
  });

  const submitAnswer = useMutation({
    mutationFn: async (params: { questionId: string; userAnswer?: string; selectedIndices?: number[] }) => {
      const updates: Record<string, any> = {};
      if (params.userAnswer !== undefined) updates.user_answer = params.userAnswer;
      if (params.selectedIndices !== undefined) updates.selected_indices = params.selectedIndices;
      const { error } = await (supabase.from('exam_questions' as any) as any).update(updates).eq('id', params.questionId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exam-questions', examId] }),
  });

  const completeExam = useMutation({
    mutationFn: async () => {
      const questions = questionsQuery.data ?? [];
      let totalScored = 0;

      for (const q of questions) {
        if (q.question_type === 'multiple_choice' || q.question_type === 'multi_select') {
          const correctIndices = q.correct_indices ?? [];
          const selectedIndices = q.selected_indices ?? [];
          let scored = 0;

          if (q.question_type === 'multiple_choice') {
            if (selectedIndices.length === 1 && correctIndices.includes(selectedIndices[0])) {
              scored = q.points;
            }
          } else {
            const correctSet = new Set(correctIndices);
            const selectedSet = new Set(selectedIndices);
            let correct = 0;
            let wrong = 0;
            for (const s of selectedSet) {
              if (correctSet.has(s)) correct++;
              else wrong++;
            }
            if (correctSet.size > 0) {
              scored = Math.max(0, ((correct - wrong) / correctSet.size) * q.points);
            }
          }

          totalScored += scored;
          await (supabase.from('exam_questions' as any) as any)
            .update({ scored_points: scored, is_graded: true })
            .eq('id', q.id);
        }
      }

      await (supabase.from('exams' as any) as any)
        .update({ status: 'completed', completed_at: new Date().toISOString(), scored_points: totalScored })
        .eq('id', examId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exam-questions', examId] });
    },
  });

  const gradeWritten = useMutation({
    mutationFn: async (params: { questionId: string; userAnswer: string; correctAnswer: string; questionText: string; aiModel?: string }) => {
      const { aiModel, ...bodyParams } = params;
      const { data, error } = await supabase.functions.invoke('grade-exam', {
        body: { ...bodyParams, aiModel: aiModel || 'flash' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const scorePercent = data.score as number;
      const question = questionsQuery.data?.find(q => q.id === params.questionId);
      const maxPoints = question?.points ?? 1;
      const scored = (scorePercent / 100) * maxPoints;

      await (supabase.from('exam_questions' as any) as any)
        .update({ scored_points: scored, is_graded: true, ai_feedback: data.feedback })
        .eq('id', params.questionId);

      const allQuestions = questionsQuery.data ?? [];
      let newTotal = 0;
      for (const q of allQuestions) {
        newTotal += q.id === params.questionId ? scored : q.scored_points;
      }
      await (supabase.from('exams' as any) as any)
        .update({ scored_points: newTotal })
        .eq('id', examId);

      return { score: scorePercent, feedback: data.feedback, scored, freeGradingsRemaining: data.freeGradingsRemaining };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exam-questions', examId] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return {
    exam: examQuery.data,
    questions: questionsQuery.data ?? [],
    isLoading: examQuery.isLoading || questionsQuery.isLoading,
    submitAnswer,
    completeExam,
    gradeWritten,
  };
};
