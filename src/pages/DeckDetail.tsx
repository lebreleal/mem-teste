import { useState, useMemo, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';
import QuestionStatsCard from '@/components/deck-detail/QuestionStatsCard';
import ConceptStatsCard from '@/components/deck-detail/ConceptStatsCard';
import ConceptList from '@/components/deck-detail/ConceptList';
import { useConceptMastery } from '@/hooks/useConceptMastery';
import { TagInput } from '@/components/TagInput';
import { useDeckTags, useDeckTagMutations } from '@/hooks/useTags';
import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Settings, Layers, RefreshCw, Pencil, Check, MessageSquare, HelpCircle, BrainCircuit } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const SuggestCorrectionModal = lazy(() => import('@/components/SuggestCorrectionModal'));
const DeckQuestionsTab = lazy(() => import('@/components/deck-detail/DeckQuestionsTab'));

/** Detect if a deck is linked to a community/marketplace source */
function checkIsLinkedDeck(deck: any): boolean {
  if (!deck) return false;
  return !!(deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck);
}

/** Resolve source deck ID from a linked deck — single unified query */
async function resolveSourceDeckId(deck: any): Promise<string | null> {
  const sourceTurmaDeckId = deck?.source_turma_deck_id;
  const sourceListingId = deck?.source_listing_id;

  if (sourceTurmaDeckId) {
    const { data: td } = await supabase.from('turma_decks').select('deck_id').eq('id', sourceTurmaDeckId).maybeSingle();
    if (td?.deck_id) return td.deck_id;
  }

  if (sourceListingId) {
    const { data: listing } = await supabase.from('marketplace_listings').select('deck_id').eq('id', sourceListingId).maybeSingle();
    if (listing?.deck_id) return listing.deck_id;
  }

  if (deck?.is_live_deck) {
    const { data: original } = await supabase
      .from('decks').select('id')
      .eq('name', deck.name).eq('is_public', true).neq('user_id', deck.user_id)
      .limit(1).maybeSingle();
    if (original?.id) return original.id;
  }

  return null;
}

const DeckDetailContent = () => {
  const { deck, deckLoading, allCardsLoading, deckId, navigate, toast, setAlgorithmModalOpen, cardCounts, decks } = useDeckDetail();
  const location = useLocation();
  const fromCommunity = (location.state as any)?.from === 'community';
  const communityTurmaId = (location.state as any)?.turmaId;
  const [suggestOpen, setSuggestOpen] = useState(false);

  const isLinkedDeck = useMemo(() => checkIsLinkedDeck(deck), [deck]);

  // Unified source resolution: resolves source deck ID, owner name, and updatedAt in one query
  const { data: sourceData } = useQuery({
    queryKey: ['linked-deck-source', deckId],
    queryFn: async () => {
      const sourceDeckId = await resolveSourceDeckId(deck);
      if (!sourceDeckId) return null;

      const [deckResult, profileResult] = await Promise.all([
        supabase.from('decks').select('user_id, updated_at').eq('id', sourceDeckId).single(),
        // We'll get the profile after we know the user_id
        Promise.resolve(null),
      ]);

      if (!deckResult.data) return { sourceDeckId, ownerName: 'Criador', updatedAt: null };

      const { data: profile } = await supabase.from('profiles').select('name').eq('id', deckResult.data.user_id).single();

      return {
        sourceDeckId,
        ownerName: profile?.name ?? 'Criador',
        updatedAt: deckResult.data.updated_at,
      };
    },
    enabled: isLinkedDeck && !!deck,
    staleTime: 120_000,
  });

  if (deckLoading || allCardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalCards = cardCounts?.total ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 gap-2 overflow-hidden">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={() => fromCommunity && communityTurmaId ? navigate(`/turmas/${communityTurmaId}`, { replace: true }) : navigate('/dashboard', { replace: true })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-base sm:text-xl font-bold text-foreground truncate">
                {(deck as any)?.name ?? 'Baralho'}
              </h1>
              {isLinkedDeck && sourceData ? (
                <p className="text-[11px] text-muted-foreground">
                  por <span className="font-semibold text-foreground">{sourceData.ownerName}</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {totalCards} cards
                  </span>
                  {sourceData.updatedAt && (
                    <>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(sourceData.updatedAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    </>
                  )}
                </p>
              ) : (
                <button
                  onClick={() => {
                    if ((deck as any)?.parent_deck_id) {
                      toast({ title: 'Algoritmo herdado', description: 'Este sub-baralho herda o algoritmo do baralho pai. Altere pelo pai.' });
                      return;
                    }
                    setAlgorithmModalOpen(true);
                  }}
                  className="text-xs cursor-pointer transition-colors hover:underline"
                >
                  <span className="text-foreground">Algoritmo:</span>{' '}
                  <span className="font-medium text-info">
                    {(deck as any)?.algorithm_mode === 'quick_review' ? 'Revisão Rápida' : 'FSRS-6'}
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isLinkedDeck && (
              <>
                <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
                  Inscrito <Check className="h-3 w-3" />
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSuggestOpen(true)}
                  title="Sugerir correção"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 shrink-0" onClick={() => navigate(`/decks/${deckId}/settings`)}>
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {isLinkedDeck ? (
          <LinkedDeckTabs deckId={deckId!} resolvedSourceDeckId={sourceData?.sourceDeckId ?? null} isLinkedDeck={isLinkedDeck} />
        ) : (
          <PersonalDeckTabs deckId={deckId!} isLinkedDeck={isLinkedDeck} />
        )}
      </main>

      <DeckDetailDialogs />

      {suggestOpen && (
        <Suspense fallback={null}>
          <SuggestCorrectionModal
            open={suggestOpen}
            onOpenChange={setSuggestOpen}
            deckId={deckId!}
          />
        </Suspense>
      )}
    </div>
  );
};

/** Tabs component for linked decks: Cards + Questões + Sugestões */
const LinkedDeckTabs = ({ deckId, resolvedSourceDeckId, isLinkedDeck }: { deckId: string; resolvedSourceDeckId: string | null; isLinkedDeck: boolean }) => {
  const { cardCounts } = useDeckDetail();
  const effectiveDeckId = resolvedSourceDeckId ?? deckId;
  const [activeTab, setActiveTab] = useState('cards');

  const { data: suggestionCount = 0 } = useQuery({
    queryKey: ['suggestion-count', effectiveDeckId],
    queryFn: async () => {
      const { count } = await supabase
        .from('deck_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', effectiveDeckId)
        .eq('status', 'pending');
      return count ?? 0;
    },
    enabled: !!effectiveDeckId,
    staleTime: 60_000,
  });

  const { data: questionCount = 0 } = useQuery({
    queryKey: ['deck-questions-count', effectiveDeckId],
    queryFn: async () => {
      const { count } = await supabase
        .from('deck_questions' as any)
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', effectiveDeckId);
      return count ?? 0;
    },
    enabled: !!effectiveDeckId,
    staleTime: 60_000,
  });

  const totalCards = cardCounts?.total ?? 0;

  const [questionAction, setQuestionAction] = useState<'practice' | 'ai' | null>(null);

  return (
    <>
      {activeTab === 'cards' && <DeckStatsCard />}
      {activeTab === 'questions' && (
        <QuestionStatsCard
          deckId={deckId}
          sourceDeckId={resolvedSourceDeckId}
          isReadOnly
          onPractice={() => setQuestionAction('practice')}
          onCreateAI={() => setQuestionAction('ai')}
        />
      )}
      <DeckTagsSection deckId={deckId} isLinkedDeck={isLinkedDeck} />
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setQuestionAction(null); }} className="w-full">
        <TabsList className="w-full grid grid-cols-3 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
          <TabsTrigger
            value="cards"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <Layers className="h-4 w-4" /> Cards ({totalCards})
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <HelpCircle className="h-4 w-4" /> Questões ({questionCount})
          </TabsTrigger>
          <TabsTrigger
            value="suggestions"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <MessageSquare className="h-4 w-4" /> Sugestões ({suggestionCount})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cards" className="mt-4">
          <CardList />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <Suspense fallback={null}>
            <DeckQuestionsTab
              deckId={deckId}
              isReadOnly
              sourceDeckId={effectiveDeckId}
              autoStart={questionAction === 'practice'}
              autoCreate={questionAction === 'ai' ? 'ai' : null}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="suggestions" className="mt-4">
          <SuggestionsList deckId={effectiveDeckId} />
        </TabsContent>
      </Tabs>
    </>
  );
};

const PersonalDeckTabs = ({ deckId, isLinkedDeck }: { deckId: string; isLinkedDeck: boolean }) => {
  const { cardCounts, navigate } = useDeckDetail();
  const totalCards = cardCounts?.total ?? 0;
  const [activeTab, setActiveTab] = useState('cards');
  const [questionAction, setQuestionAction] = useState<'practice' | 'ai' | null>(null);

  // Concepts state
  const { concepts, createConcept, renameConcept, deleteConcept, updateConceptCards, isLoading: conceptsLoading } = useDeckConcepts(deckId);
  const [createConceptOpen, setCreateConceptOpen] = useState(false);
  const [editCardsTarget, setEditCardsTarget] = useState<{ id: string; name: string } | null>(null);

  const handleStudyConcept = (conceptId: string) => {
    navigate(`/study/${deckId}?conceptId=${conceptId}`);
  };

  return (
    <>
      {activeTab === 'cards' && <DeckStatsCard />}
      {activeTab === 'questions' && (
        <QuestionStatsCard
          deckId={deckId}
          onPractice={() => setQuestionAction('practice')}
          onCreateAI={() => setQuestionAction('ai')}
        />
      )}
      {activeTab === 'concepts' && (
        <ConceptStatsCard
          concepts={concepts}
          onStudyWeak={() => {
            // Find first due concept to study
            const due = concepts.find(c => new Date(c.scheduled_date) <= new Date() || c.state === 0);
            if (due) handleStudyConcept(due.id);
          }}
          onCreate={() => setCreateConceptOpen(true)}
        />
      )}
      <DeckTagsSection deckId={deckId} isLinkedDeck={isLinkedDeck} />
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setQuestionAction(null); }} className="w-full">
        <TabsList className="w-full grid grid-cols-3 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
          <TabsTrigger
            value="cards"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <Layers className="h-4 w-4" /> Cards ({totalCards})
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <HelpCircle className="h-4 w-4" /> Questões
          </TabsTrigger>
          <TabsTrigger
            value="concepts"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <BrainCircuit className="h-4 w-4" /> Conceitos ({concepts.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cards" className="mt-4">
          <CardList />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <Suspense fallback={null}>
            <DeckQuestionsTab
              deckId={deckId}
              autoStart={questionAction === 'practice'}
              autoCreate={questionAction === 'ai' ? 'ai' : null}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="concepts" className="mt-4">
          <ConceptList
            deckId={deckId}
            concepts={concepts}
            onRename={(id, name) => renameConcept.mutate({ conceptId: id, newName: name })}
            onDelete={(id) => deleteConcept.mutate(id)}
            onEditCards={(id) => {
              const c = concepts.find(c => c.id === id);
              if (c) setEditCardsTarget({ id: c.id, name: c.name });
            }}
            onStudyConcept={handleStudyConcept}
          />
        </TabsContent>
      </Tabs>

      <CreateConceptDialog
        open={createConceptOpen}
        onOpenChange={setCreateConceptOpen}
        deckId={deckId}
        onConfirm={(name, cardIds) => createConcept.mutate({ name, cardIds })}
      />

      {editCardsTarget && (
        <EditConceptCardsDialog
          open={!!editCardsTarget}
          onOpenChange={(o) => !o && setEditCardsTarget(null)}
          deckId={deckId}
          conceptId={editCardsTarget.id}
          conceptName={editCardsTarget.name}
          onConfirm={(cardIds) => updateConceptCards.mutate({ conceptId: editCardsTarget.id, cardIds })}
        />
      )}
    </>
  );
};

/** List of suggestions for a deck */
const SuggestionsList = ({ deckId }: { deckId: string }) => {
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['deck-suggestions-list', deckId],
    queryFn: async () => {
      const { data } = await supabase
        .from('deck_suggestions')
        .select('*')
        .eq('deck_id', deckId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!data || data.length === 0) return [];
      const userIds = [...new Set(data.map((s: any) => s.suggester_user_id))];
      const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));
      return data.map((s: any) => ({ ...s, suggester_name: profileMap.get(s.suggester_user_id) ?? 'Anônimo' }));
    },
    enabled: !!deckId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <h3 className="font-display text-base font-semibold text-foreground">Nenhuma sugestão pendente</h3>
        <p className="mt-1 text-sm text-muted-foreground">As sugestões de correção aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s: any) => (
        <div key={s.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{s.suggester_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{s.rationale}</p>
          {s.suggestion_type === 'card' && s.suggested_content && (
            <div className="text-xs text-muted-foreground/70">
              {(s.suggested_content as any)?.front_content && <span className="text-primary">Frente editada</span>}
              {(s.suggested_content as any)?.front_content && (s.suggested_content as any)?.back_content && ' · '}
              {(s.suggested_content as any)?.back_content && <span className="text-primary">Verso editado</span>}
            </div>
          )}
          {s.suggestion_type === 'deck' && (s.suggested_content as any)?.new_card && (
            <span className="text-xs text-primary">Novo card sugerido</span>
          )}
          {s.suggested_tags && (
            <span className="text-xs text-primary">Tags modificadas</span>
          )}
        </div>
      ))}
    </div>
  );
};

const DeckTagsSection = ({ deckId, isLinkedDeck }: { deckId: string; isLinkedDeck: boolean }) => {
  const { data: tags = [] } = useDeckTags(deckId);
  const { addTag, removeTag } = useDeckTagMutations(deckId);

  if (isLinkedDeck) {
    if (tags.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag: any) => (
            <span key={tag.id} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const { deck } = useDeckDetail();

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Tags</p>
      <TagInput
        tags={tags}
        onAdd={(tag) => addTag.mutate(tag)}
        onRemove={(tagId) => removeTag.mutate(tagId)}
        placeholder="Buscar ou criar tag..."
        aiContext={{ deckName: (deck as any)?.name }}
        
      />
    </div>
  );
};

const DeckDetail = () => (
  <DeckDetailProvider>
    <DeckDetailContent />
  </DeckDetailProvider>
);

export default DeckDetail;
