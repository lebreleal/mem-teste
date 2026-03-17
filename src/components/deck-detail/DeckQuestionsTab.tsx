/**
 * DeckQuestionsTab — slim orchestrator (~120 lines).
 * All logic extracted per Lei 2B into:
 *   - useDeckQuestions (hook)
 *   - QuestionPractice (practice mode)
 *   - QuestionDialogs (create/edit/paste/preview)
 *   - QuestionList (card list)
 *   - QuestionFilters (search, filters, progress, selection bar)
 */
import QuestionPractice from '@/components/deck-detail/QuestionPractice';
import {
  CreateQuestionDialog, PasteQuestionsDialog, EditQuestionDialog,
  QuestionPreviewDialog, CommunityWarningDialog,
} from '@/components/deck-detail/QuestionDialogs';
import QuestionList from '@/components/deck-detail/QuestionList';
import {
  QuestionHeader, SelectionBar, StatsProgressBar, SearchAndFilters,
} from '@/components/deck-detail/QuestionFilters';
import { useDeckQuestions } from '@/hooks/useDeckQuestions';

const DeckQuestionsTab = ({
  deckId, isReadOnly = false, sourceDeckId, autoStart, autoCreate, conceptFilter,
}: {
  deckId: string; isReadOnly?: boolean; sourceDeckId?: string | null;
  autoStart?: boolean; autoCreate?: 'ai' | 'manual' | null; conceptFilter?: string | string[];
}) => {
  const state = useDeckQuestions({ deckId, isReadOnly, sourceDeckId, autoStart, autoCreate, conceptFilter });

  const {
    createOpen, setCreateOpen, createMode, setCreateMode,
    practicing, setPracticing,
    filter, setFilter, searchQuery, setSearchQuery,
    showFilters, setShowFilters,
    selectionMode, setSelectionMode, selectedQuestions, setSelectedQuestions,
    previewQuestion, setPreviewQuestion,
    editQuestion, setEditQuestion,
    communityWarningOpen, setCommunityWarningOpen,
    pasteOpen, setPasteOpen,
    effectiveDeckId,
    questions, isLoading, statsData, filteredQuestions,
    deleteMutation, bulkDeleteMutation, toggleSelection, isCommunityQuestion,
  } = state;

  const hasActiveFilter = filter !== 'all';

  // Practice mode
  if (practicing && filteredQuestions.length > 0) {
    return <QuestionPractice questions={filteredQuestions} deckId={deckId} onClose={() => setPracticing(false)} />;
  }

  return (
    <div className="space-y-3">
      <QuestionHeader
        filteredCount={filteredQuestions.length}
        questionsCount={questions.length}
        hasActiveFilter={hasActiveFilter}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        setSelectedQuestions={setSelectedQuestions}
        isReadOnly={!!isReadOnly}
        onCreateManual={() => { setCreateMode('manual'); setCreateOpen(true); }}
        onCreateAI={() => { setCreateMode('ai'); setCreateOpen(true); }}
        onPaste={() => setPasteOpen(true)}
      />

      {selectionMode && (
        <SelectionBar
          selectedCount={selectedQuestions.size}
          onDeselect={() => setSelectedQuestions(new Set())}
          onBulkDelete={() => { if (selectedQuestions.size > 0) bulkDeleteMutation.mutate([...selectedQuestions]); }}
          isReadOnly={!!isReadOnly}
        />
      )}

      <StatsProgressBar statsData={statsData} selectionMode={selectionMode} />

      <SearchAndFilters
        questionsCount={questions.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showFilters={showFilters}
        filter={filter}
        setFilter={setFilter}
        statsData={statsData}
        hasActiveFilter={hasActiveFilter}
      />

      <QuestionList
        questions={filteredQuestions}
        statsData={statsData}
        selectionMode={selectionMode}
        selectedQuestions={selectedQuestions}
        isReadOnly={!!isReadOnly}
        onToggleSelection={toggleSelection}
        onPreview={setPreviewQuestion}
        onEdit={setEditQuestion}
        onDelete={(id) => deleteMutation.mutate(id)}
        onCommunityWarning={() => setCommunityWarningOpen(true)}
        isCommunityQuestion={isCommunityQuestion}
        isLoading={isLoading}
        hasActiveFilter={hasActiveFilter}
        searchQuery={searchQuery}
      />

      {/* Dialogs */}
      <QuestionPreviewDialog question={previewQuestion} onClose={() => setPreviewQuestion(null)} />

      {editQuestion && !isReadOnly && (
        <EditQuestionDialog
          question={editQuestion}
          open={!!editQuestion}
          onOpenChange={(v) => { if (!v) setEditQuestion(null); }}
          deckId={deckId}
          effectiveDeckId={effectiveDeckId}
        />
      )}

      <CommunityWarningDialog open={communityWarningOpen} onOpenChange={setCommunityWarningOpen} />

      {!isReadOnly && (
        <>
          <CreateQuestionDialog open={createOpen} onOpenChange={setCreateOpen} deckId={deckId} mode={createMode} />
          <PasteQuestionsDialog open={pasteOpen} onOpenChange={setPasteOpen} deckId={deckId} />
        </>
      )}
    </div>
  );
};

export default DeckQuestionsTab;
