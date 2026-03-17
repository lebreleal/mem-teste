/**
 * TurmaDetailContext – centralises all turma-detail state, queries, mutations
 * and derived data so sub-components can consume via useTurmaDetail() instead
 * of receiving long prop lists.
 */

import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react';
import type { Turma, TurmaMember, TurmaSubject, TurmaLesson, TurmaExam, TurmaDeck } from '@/types/turma';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { fetchTurmaPublic, fetchTurmaLessonFiles, fetchActiveSubscription, restoreSubscriptionStatus, processSubscription, importTurmaExam } from '@/services/turmaDetailService';
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
/** Subscription row shape */
interface ActiveSubscription {
  id: string;
  turma_id: string;
  user_id: string;
  status: string;
  started_at: string;
  expires_at: string;
}

interface TurmaDetailContextValue {
  // Core data
  turmaId: string;
  turma: Turma | null | undefined;
  myRole: string | null | undefined;
  members: TurmaMember[];
  subjects: TurmaSubject[];
  lessons: TurmaLesson[];
  turmaExams: TurmaExam[];
  turmaDecks: TurmaDeck[];
  lessonFiles: { id: string; lesson_id: string }[];
  user: { id: string } | null;

  // Derived permissions
  isMember: boolean;
  isAdmin: boolean;
  isMod: boolean;
  canEdit: boolean;

  // Subscription
  hasSubscription: boolean;
  isSubscriber: boolean;
  activeSubscription: ActiveSubscription | null | undefined;
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
  lessonDateMap: Map<string, TurmaLesson[]>;

  // Mutations
  mutations: ReturnType<typeof useTurmaHierarchyMutations>;
  examMutations: ReturnType<typeof useTurmaExamMutations>;
  updateTurma: ReturnType<typeof useTurmas>['updateTurma'];

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

  // Loading
  isLoading: boolean;

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
  const { turmas, updateTurma, isLoading: turmasLoading } = useTurmas();
  const myTurma = turmas.find(t => t.id === turmaId);

  // Fetch turma directly if user is not a member (public view)
  const { data: fetchedTurma, isLoading: fetchingTurma } = useQuery({
    queryKey: ['turma-public', turmaId],
    queryFn: async () => {
      if (!turmaId) return null;
      return fetchTurmaPublic(turmaId);
    },
    enabled: !!turmaId && !myTurma,
    staleTime: 60_000,
  });

  const turma = myTurma ?? fetchedTurma;
  const isLoading = turmasLoading || (!myTurma && fetchingTurma);

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
      return fetchTurmaLessonFiles(turmaId);
    },
    enabled: !!turmaId,
  });

  // Permissions
  const isMember = !!myRole;
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
      return fetchActiveSubscription(turmaId, user.id);
    },
    enabled: !!user && !!turmaId,
  });

  useEffect(() => {
    if (activeSubscription && currentMember && !currentMember.is_subscriber && turmaId && user) {
      restoreSubscriptionStatus(turmaId)
        .then((restored) => {
          if (restored) queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
        });
    }
  }, [activeSubscription, currentMember, turmaId, user]);

  const handleSubscribe = async () => {
    if (!user || !turmaId || !turma) return;
    setSubscribing(true);
    try {
      await processSubscription(turmaId);
      const error = null as any;
        if (error.message.includes('Insufficient credits')) toast({ title: 'Créditos insuficientes', description: `Você precisa de ${subscriptionPrice} créditos.`, variant: 'destructive' });
        else if (error.message.includes('Already subscribed')) toast({ title: 'Já assinado', description: 'Sua assinatura ainda está ativa.' });
        else throw error;
        return;
      queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turma-active-sub', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({ title: 'Assinatura ativada! 🎉', description: 'Você agora tem acesso por 7 dias.' });
    } catch (e: any) {
      if (e.message?.includes('Insufficient credits')) toast({ title: 'Créditos insuficientes', description: `Você precisa de ${subscriptionPrice} créditos.`, variant: 'destructive' });
      else if (e.message?.includes('Already subscribed')) toast({ title: 'Já assinado', description: 'Sua assinatura ainda está ativa.' });
      else toast({ title: 'Erro ao assinar', description: e.message, variant: 'destructive' });
    }
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
    if (!newName.trim()) return;
    const trimmed = newName.trim().slice(0, 60);
    mutations.createLesson.mutate({ subjectId: contentFolderId, name: trimmed, description: newDesc.trim(), lessonDate: newLessonDate || null, isPublished: newLessonPublished }, {
      onSuccess: () => { setShowAddLesson(null); setNewName(''); setNewDesc(''); setNewLessonDate(''); setNewLessonPublished(true); toast({ title: 'Conteúdo criado!' }); },
      onError: () => toast({ title: 'Erro ao criar conteúdo', variant: 'destructive' }),
    });
  };

  const handleImportExam = async (exam: any) => {
    try {
      const examId = await importTurmaExam(user!.id, exam);
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast({ title: 'Prova importada!', description: 'A prova foi adicionada à sua seção de provas.' });
      navigate(`/exam/${examId}`);
    } catch (err: any) { toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' }); }
  };

  const value: TurmaDetailContextValue = {
    turmaId: turmaId!,
    turma, myRole, members, subjects, lessons, turmaExams, turmaDecks, lessonFiles, user, isLoading,
    isMember, isAdmin, isMod, canEdit,
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
