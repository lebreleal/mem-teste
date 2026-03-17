/**
 * useDeckQuestions — all state, queries, mutations, and computed data
 * for the DeckQuestionsTab feature.
 * Extracted per Lei 2B from DeckQuestionsTab.tsx (copy-paste integral).
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import {
  fetchDeckQuestions, fetchQuestionAttempts,
  deleteQuestion, bulkDeleteQuestions,
} from '@/services/deckQuestionService';
import type { DeckQuestion, QuestionAttempt, QuestionFilter, QuestionStatsData } from '@/components/deck-detail/question-types';

interface UseDeckQuestionsArgs {
  deckId: string;
  isReadOnly?: boolean;
  sourceDeckId?: string | null;
  autoStart?: boolean;
  autoCreate?: 'ai' | 'manual' | null;
  conceptFilter?: string | string[];
}

export function useDeckQuestions({
  deckId, isReadOnly, sourceDeckId, autoStart, autoCreate, conceptFilter,
}: UseDeckQuestionsArgs) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { decks } = useDecks();
  const [createOpen, setCreateOpen] = useState(!!autoCreate);
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>(autoCreate === 'manual' ? 'manual' : 'ai');
  const [practicing, setPracticing] = useState(!!autoStart);

  // Sync autoStart/autoCreate prop changes (component may already be mounted)
  useEffect(() => {
    if (autoStart) setPracticing(true);
  }, [autoStart]);

  useEffect(() => {
    if (autoCreate) {
      setCreateOpen(true);
      setCreateMode(autoCreate === 'manual' ? 'manual' : 'ai');
    }
  }, [autoCreate]);
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [previewQuestion, setPreviewQuestion] = useState<DeckQuestion | null>(null);
  const [editQuestion, setEditQuestion] = useState<DeckQuestion | null>(null);
  const [communityWarningOpen, setCommunityWarningOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const effectiveDeckId = sourceDeckId || deckId;

  // Check if deck is linked to community
  const isLinkedDeck = useMemo(() => {
    // If sourceDeckId is provided and different from deckId, it's a linked deck
    return !!sourceDeckId && sourceDeckId !== deckId;
  }, [sourceDeckId, deckId]);

  // Compute hierarchy deck IDs in-memory from already-loaded decks (same pattern as cards tab)
  const hierarchyDeckIds = useMemo(() => {
    const allIds: string[] = [effectiveDeckId];
    if (!decks.length) return allIds;
    const queue = [effectiveDeckId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const children = decks.filter(d => d.parent_deck_id === current && !d.is_archived);
      for (const child of children) { allIds.push(child.id); queue.push(child.id); }
    }
    return allIds;
  }, [decks, effectiveDeckId]);

  // Stable key for the hierarchy to avoid unnecessary refetches
  const hierarchyKey = useMemo(() => hierarchyDeckIds.join(','), [hierarchyDeckIds]);

  const prevQuestionsRef = useRef<DeckQuestion[]>([]);

  const { data: questions = prevQuestionsRef.current, isLoading } = useQuery({
    queryKey: ['deck-questions', effectiveDeckId, hierarchyKey],
    queryFn: async () => {
      const rawData = await fetchDeckQuestions(hierarchyDeckIds);
      const result = (rawData).map((q: any) => {
        let opts: string[] = [];
        if (Array.isArray(q.options)) {
          opts = q.options.map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || JSON.stringify(o)));
        } else if (typeof q.options === 'string') {
          try { const parsed = JSON.parse(q.options); if (Array.isArray(parsed)) opts = parsed.map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || JSON.stringify(o))); } catch {}
        } else if (q.options && typeof q.options === 'object') {
          const values = Object.values(q.options);
          if (values.length > 0) opts = values.map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || JSON.stringify(o)));
        }
        return {
          ...q,
          options: opts,
          concepts: Array.isArray(q.concepts) ? q.concepts : [],
        };
      }) as DeckQuestion[];
      prevQuestionsRef.current = result;
      return result;
    },
    enabled: !!effectiveDeckId && hierarchyDeckIds.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Fetch user's attempts for stats
  const { data: attempts = [] } = useQuery({
    queryKey: ['question-attempts', effectiveDeckId],
    queryFn: async () => {
      if (!user) return [];
      const questionIds = questions.map(q => q.id);
      if (questionIds.length === 0) return [];
      const data = await fetchQuestionAttempts(user.id, questionIds);
      return data as unknown as QuestionAttempt[];
    },
    enabled: !!user && questions.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Compute stats
  const statsData: QuestionStatsData = useMemo(() => {
    const total = questions.length;
    const latestByQ = new Map<string, QuestionAttempt>();
    for (const a of attempts) {
      const prev = latestByQ.get(a.question_id);
      if (!prev || a.answered_at > prev.answered_at) latestByQ.set(a.question_id, a);
    }
    const answered = latestByQ.size;
    let correct = 0, wrong = 0;
    const errorQuestionIds = new Set<string>();
    const answeredQuestionIds = new Set<string>();

    for (const [qId, a] of latestByQ) {
      answeredQuestionIds.add(qId);
      if (a.is_correct) correct++;
      else { wrong++; errorQuestionIds.add(qId); }
    }
    return { total, answered, correct, wrong, errorQuestionIds, answeredQuestionIds };
  }, [questions, attempts]);

  // Filter + search questions
  const filteredQuestions = useMemo(() => {
    let filtered = questions;
    // Apply concept filter from Concepts tab (single string or array for interleaving)
    if (conceptFilter) {
      if (Array.isArray(conceptFilter)) {
        const cfSet = new Set(conceptFilter.map(c => c.toLocaleLowerCase('pt-BR')));
        filtered = filtered.filter(q =>
          (q.concepts ?? []).some(c => cfSet.has(c.toLocaleLowerCase('pt-BR')))
        );
        // Shuffle for interleaving (Bjork, 2001)
        filtered = [...filtered].sort(() => Math.random() - 0.5);
      } else {
        const cf = conceptFilter.toLocaleLowerCase('pt-BR');
        filtered = filtered.filter(q =>
          (q.concepts ?? []).some(c => c.toLocaleLowerCase('pt-BR') === cf)
        );
      }
    }
    if (filter === 'unanswered') filtered = filtered.filter(q => !statsData.answeredQuestionIds.has(q.id));
    if (filter === 'errors') filtered = filtered.filter(q => statsData.errorQuestionIds.has(q.id));
    if (filter === 'correct') filtered = filtered.filter(q => statsData.answeredQuestionIds.has(q.id) && !statsData.errorQuestionIds.has(q.id));
    if (searchQuery.trim()) {
      const lq = searchQuery.toLowerCase();
      filtered = filtered.filter(q => {
        const plain = (q.question_text ?? '').replace(/<[^>]+>/g, '').toLowerCase();
        const optsText = (q.options ?? []).join(' ').toLowerCase();
        const conceptsText = (q.concepts ?? []).join(' ').toLowerCase();
        return plain.includes(lq) || optsText.includes(lq) || conceptsText.includes(lq);
      });
    }
    return filtered;
  }, [questions, filter, statsData, searchQuery, conceptFilter]);

  const deleteMutation = useMutation({
    mutationFn: async (questionId: string) => {
      await deleteQuestion(questionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', effectiveDeckId] });
      toast({ title: 'Questão removida' });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await bulkDeleteQuestions(ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', effectiveDeckId] });
      setSelectedQuestions(new Set());
      setSelectionMode(false);
      toast({ title: `${selectedQuestions.size} questões removidas` });
    },
  });

  const toggleSelection = useCallback((id: string) => {
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Only treat as community content if the deck itself is linked to a community source
  const isCommunityQuestion = useCallback((_q: DeckQuestion) => {
    return isLinkedDeck;
  }, [isLinkedDeck]);

  return {
    // Auth
    user,
    // State
    createOpen, setCreateOpen,
    createMode, setCreateMode,
    practicing, setPracticing,
    filter, setFilter,
    searchQuery, setSearchQuery,
    showFilters, setShowFilters,
    selectionMode, setSelectionMode,
    selectedQuestions, setSelectedQuestions,
    previewQuestion, setPreviewQuestion,
    editQuestion, setEditQuestion,
    communityWarningOpen, setCommunityWarningOpen,
    pasteOpen, setPasteOpen,
    // Computed
    effectiveDeckId,
    isLinkedDeck,
    hierarchyDeckIds,
    questions,
    isLoading,
    attempts,
    statsData,
    filteredQuestions,
    // Mutations
    deleteMutation,
    bulkDeleteMutation,
    toggleSelection,
    isCommunityQuestion,
  };
}
