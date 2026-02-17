/**
 * TurmaDetailContext – centralises all turma-detail state, queries, mutations
 * and derived data so sub-components can consume via useTurmaDetail() instead
 * of receiving long prop lists.
 */

import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTurmas } from '@/hooks/useTurmas';
import {
  useTurmaRole, useTurmaMembers, useTurmaSubjects, useTurmaLessons,
  useTurmaDecks, useTurmaHierarchyMutations,
} from '@/hooks/useTurmaHierarchy';
import { useTurmaExams, useTurmaExamMutations } from '@/hooks/useTurmaExams';
import { useToast } from '@/hooks/use-toast';
import type { BreadcrumbItem } from './constants';

// ─── Context value shape ────────────────────────────────
interface TurmaDetailContextValue {
  // Core data
  turmaId: string;
  turma: any;
  myRole: string | null | undefined;
  members: any[];
  subjects: any[];
  lessons: any[];
  turmaExams: any[];
  turmaDecks: any[];
  lessonFiles: { id: string; lesson_id: string }[];
  user: any;

  // Derived permissions
  isAdmin: boolean;
  isMod: boolean;
  canEdit: boolean;

  // Subscription
  hasSubscription: boolean;
  isSubscriber: boolean;
  activeSubscription: any;
  subscriptionPrice: number;
  subscribing: boolean;
  handleSubscribe: () => Promise<void>;

  // Navigation
  contentFolderId: string | null;
  setContentFolderId: (id: string | null) => void;
  examFolderId: string | null;
  setExamFolderId: (id: string | null) => void;
  contentBreadcrumb: BreadcrumbItem[];
  examBreadcrumb: BreadcrumbItem[];

  // Calendar
  lessonDates: Date[];
  lessonDateMap: Map<string, any[]>;

  // Mutations
  mutations: ReturnType<typeof useTurmaHierarchyMutations>;
  examMutations: ReturnType<typeof useTurmaExamMutations>;
  updateTurma: any;

  // Dialog states
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showAddSubject: boolean;
  setShowAddSubject: (v: boolean) => void;
  showAddLesson: string | null;
  setShowAddLesson: (v: string | null) => void;
  newName: string;
  setNewName: (v: string) => void;
  newDesc: string;
  setNewDesc: (v: string) => void;
  newLessonDate: string;
  setNewLessonDate: (v: string) => void;
  newLessonPublished: boolean;
  setNewLessonPublished: (v: boolean) => void;
  editingSubject: { id: string; name: string } | null;
  setEditingSubject: (v: { id: string; name: string } | null) => void;
  editingLesson: { id: string; name: string; lesson_date: string | null } | null;
  setEditingLesson: (v: { id: string; name: string; lesson_date: string | null } | null) => void;
  editItemName: string;
  setEditItemName: (v: string) => void;
  editLessonDate: string;
  setEditLessonDate: (v: string) => void;

  // Handlers
  handleCreateSubject: () => void;
  handleCreateLesson: () => void;
  handleImportExam: (exam: any) => Promise<void>;

  // Toast
  toast: ReturnType<typeof useToast>['toast'];
  navigate: ReturnType<typeof useNavigate>;
}

const TurmaDetailContext = createContext<TurmaDetailContextValue | null>(null);

export const useTurmaDetail = () => {
  const ctx = useContext(TurmaDetailContext);
  if (!ctx) throw new Error('useTurmaDetail must be used within TurmaDetailProvider');
  return ctx;
};

// ─── Provider ───────────────────────────────────────────
export const TurmaDetailProvider = ({ children }: { children: ReactNode }) => {
  const { turmaId } = useParams<{ turmaId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const { turmas, updateTurma } = useTurmas();
  const turma = turmas.find(t => t.id === turmaId);

  // Queries
  const { data: myRole } = useTurmaRole(turmaId!);
  const { data: members = [] } = useTurmaMembers(turmaId!);
  const { data: subjects = [] } = useTurmaSubjects(turmaId!);
  const { data: lessons = [] } = useTurmaLessons(turmaId!);
  const { data: turmaExams = [] } = useTurmaExams(turmaId!);
  const { data: turmaDecks = [] } = useTurmaDecks(turmaId!);
  const mutations = useTurmaHierarchyMutations(turmaId!);
  const examMutations = useTurmaExamMutations(turmaId!);

  const { data: lessonFiles = [] } = useQuery({
    queryKey: ['turma-lesson-files', turmaId],
    queryFn: async () => {
      if (!turmaId) return [];
      const { data } = await supabase.from('turma_lesson_files' as any).select('id, lesson_id').eq('turma_id', turmaId);
      return (data ?? []) as unknown as { id: string; lesson_id: string }[];
    },
    enabled: !!turmaId,
  });

  // Permissions
  const isAdmin = myRole === 'admin';
  const isMod = myRole === 'moderator';
  const canEdit = isAdmin || isMod;

  // Subscription
  const currentMember = members.find(m => m.user_id === user?.id);
  const isSubscriber = currentMember?.is_subscriber ?? false;
  const subscriptionPrice = turma?.subscription_price ?? 0;
  const hasSubscription = subscriptionPrice > 0;
  const [subscribing, setSubscribing] = useState(false);

  const { data: activeSubscription } = useQuery({
    queryKey: ['turma-active-sub', turmaId, user?.id],
    queryFn: async () => {
      if (!user || !turmaId) return null;
      const { data } = await supabase.from('turma_subscriptions').select('*')
        .eq('turma_id', turmaId).eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false }).limit(1);
      return (data && data.length > 0) ? data[0] : null;
    },
    enabled: !!user && !!turmaId,
  });

  useEffect(() => {
    if (activeSubscription && currentMember && !currentMember.is_subscriber && turmaId && user) {
      supabase.rpc('restore_subscription_status', { p_turma_id: turmaId })
        .then(({ data }) => {
          if (data) queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
        });
    }
  }, [activeSubscription, currentMember, turmaId, user]);

  const handleSubscribe = async () => {
    if (!user || !turmaId || !turma) return;
    setSubscribing(true);
    try {
      const { error } = await supabase.rpc('process_turma_subscription', { p_turma_id: turmaId });
      if (error) {
        if (error.message.includes('Insufficient credits')) toast({ title: 'Créditos insuficientes', description: `Você precisa de ${subscriptionPrice} créditos.`, variant: 'destructive' });
        else if (error.message.includes('Already subscribed')) toast({ title: 'Já assinado', description: 'Sua assinatura ainda está ativa.' });
        else throw error;
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turma-active-sub', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['energy'] });
      toast({ title: 'Assinatura ativada! 🎉', description: 'Você agora tem acesso por 7 dias.' });
    } catch (e: any) { toast({ title: 'Erro ao assinar', description: e.message, variant: 'destructive' }); }
    finally { setSubscribing(false); }
  };

  // Navigation
  const [contentFolderId, setContentFolderId] = useState<string | null>(searchParams.get('folder'));
  const [examFolderId, setExamFolderId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Dialog states
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLessonDate, setNewLessonDate] = useState('');
  const [newLessonPublished, setNewLessonPublished] = useState(true);
  const [editingSubject, setEditingSubject] = useState<{ id: string; name: string } | null>(null);
  const [editingLesson, setEditingLesson] = useState<{ id: string; name: string; lesson_date: string | null } | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editLessonDate, setEditLessonDate] = useState('');

  // Breadcrumb builder
  const buildFolderBreadcrumb = (folderId: string | null): BreadcrumbItem[] => {
    const path: BreadcrumbItem[] = [{ id: null, name: 'Conteúdo' }];
    if (!folderId) return path;
    const buildPath = (fId: string) => {
      const folder = subjects.find(s => s.id === fId);
      if (!folder) return;
      if ((folder as any).parent_id) buildPath((folder as any).parent_id);
      path.push({ id: folder.id, name: folder.name });
    };
    buildPath(folderId);
    return path;
  };

  const contentBreadcrumb = buildFolderBreadcrumb(contentFolderId);
  const examBreadcrumb = buildFolderBreadcrumb(examFolderId);

  // Calendar
  const lessonDateMap = useMemo(() => {
    const map = new Map<string, typeof lessons>();
    lessons.forEach(l => {
      if (l.lesson_date) {
        const key = l.lesson_date;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(l);
      }
    });
    return map;
  }, [lessons]);

  const lessonDates = useMemo(() =>
    Array.from(lessonDateMap.keys()).map(d => new Date(d + 'T00:00:00')),
    [lessonDateMap]
  );

  // Handlers
  const handleCreateSubject = () => {
    if (!newName.trim()) return;
    const trimmed = newName.trim().slice(0, 40);
    mutations.createSubject.mutate({ name: trimmed, description: newDesc.trim(), parentId: contentFolderId }, {
      onSuccess: () => { setShowAddSubject(false); setNewName(''); setNewDesc(''); toast({ title: 'Pasta criada!' }); },
      onError: () => toast({ title: 'Erro ao criar pasta', variant: 'destructive' }),
    });
  };

  const handleCreateLesson = () => {
    if (!newName.trim() || !newLessonDate) return;
    const trimmed = newName.trim().slice(0, 60);
    mutations.createLesson.mutate({ subjectId: contentFolderId, name: trimmed, description: newDesc.trim(), lessonDate: newLessonDate || null, isPublished: newLessonPublished }, {
      onSuccess: () => { setShowAddLesson(null); setNewName(''); setNewDesc(''); setNewLessonDate(''); setNewLessonPublished(true); toast({ title: 'Conteúdo criado!' }); },
      onError: () => toast({ title: 'Erro ao criar conteúdo', variant: 'destructive' }),
    });
  };

  const handleImportExam = async (exam: any) => {
    try {
      // Check if already imported
      const { data: existing } = await supabase.from('exams').select('id').eq('user_id', user!.id).eq('source_turma_exam_id', exam.id).limit(1);
      if (existing && existing.length > 0) {
        // Already imported, navigate directly
        navigate(`/exam/${existing[0].id}`);
        return;
      }

      const { data: questions, error } = await supabase.from('turma_exam_questions').select('*').eq('exam_id', exam.id).order('sort_order', { ascending: true });
      if (error) throw error;
      const { data: userDecks } = await supabase.from('decks').select('id').eq('user_id', user!.id).limit(1);
      let deckId = userDecks?.[0]?.id;
      if (!deckId) { const { data: newDeck } = await supabase.from('decks').insert({ user_id: user!.id, name: 'Provas Importadas' }).select().single(); deckId = newDeck?.id; }
      if (!deckId) throw new Error('Sem baralho disponível');
      const totalPoints = (questions ?? []).reduce((sum: number, q: any) => sum + (q.points || 1), 0);
      const { data: newExam, error: examError } = await (supabase.from('exams' as any) as any)
        .insert({ user_id: user!.id, deck_id: deckId, title: exam.title, status: 'pending', total_points: totalPoints, time_limit_seconds: exam.time_limit_seconds || null, source_turma_exam_id: exam.id })
        .select().single();
      if (examError) throw examError;
      const questionsToInsert = (questions ?? []).map((q: any, idx: number) => ({
        exam_id: newExam.id, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer, correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      const { error: qError } = await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
      if (qError) throw qError;
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast({ title: 'Prova importada!', description: 'A prova foi adicionada à sua seção de provas.' });
      navigate(`/exam/${newExam.id}`);
    } catch (err: any) { toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' }); }
  };

  const value: TurmaDetailContextValue = {
    turmaId: turmaId!,
    turma, myRole, members, subjects, lessons, turmaExams, turmaDecks, lessonFiles, user,
    isAdmin, isMod, canEdit,
    hasSubscription, isSubscriber, activeSubscription, subscriptionPrice, subscribing, handleSubscribe,
    contentFolderId, setContentFolderId, examFolderId, setExamFolderId,
    contentBreadcrumb, examBreadcrumb,
    lessonDates, lessonDateMap,
    mutations, examMutations, updateTurma,
    showSettings, setShowSettings,
    showAddSubject, setShowAddSubject,
    showAddLesson, setShowAddLesson,
    newName, setNewName, newDesc, setNewDesc,
    newLessonDate, setNewLessonDate, newLessonPublished, setNewLessonPublished,
    editingSubject, setEditingSubject, editingLesson, setEditingLesson,
    editItemName, setEditItemName, editLessonDate, setEditLessonDate,
    handleCreateSubject, handleCreateLesson, handleImportExam,
    toast, navigate,
  };

  return <TurmaDetailContext.Provider value={value}>{children}</TurmaDetailContext.Provider>;
};
