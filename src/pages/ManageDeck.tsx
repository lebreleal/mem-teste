import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useManageDeck } from '@/hooks/useManageDeck';
import { CardEditorDialog } from '@/components/manage-deck/CardEditorDialog';
import { ManageDeckCardList } from '@/components/manage-deck/ManageDeckCardList';
import { ImprovePreviewDialog, DeleteCardDialog, SuggestCorrectionWrapper } from '@/components/manage-deck/ManageDeckDialogs';

const ManageDeck = () => {
  const state = useManageDeck();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => state.navigate(`/decks/${state.deckId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-display text-xl font-bold text-foreground">
              {state.isCommunityDeck ? 'Cards do Deck' : 'Gerenciar Cards'}
            </h1>
          </div>
          {!state.isCommunityDeck && (
            <Button onClick={state.openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Card</span>
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        <ManageDeckCardList
          cards={state.cards}
          isLoading={state.isLoading}
          isCommunityDeck={state.isCommunityDeck}
          openNew={state.openNew}
          openEdit={state.openEdit}
          setDeleteId={state.setDeleteId}
          setSuggestCard={state.setSuggestCard}
        />
      </main>

      <CardEditorDialog
        editorOpen={state.editorOpen}
        setEditorOpen={state.setEditorOpen}
        editingId={state.editingId}
        editorType={state.editorType}
        setEditorType={state.setEditorType}
        front={state.front}
        setFront={state.setFront}
        back={state.back}
        setBack={state.setBack}
        mcOptions={state.mcOptions}
        setMcOptions={state.setMcOptions}
        mcCorrectIndex={state.mcCorrectIndex}
        setMcCorrectIndex={state.setMcCorrectIndex}
        isSaving={state.isSaving}
        isImproving={state.isImproving}
        occlusionModalOpen={state.occlusionModalOpen}
        setOcclusionModalOpen={state.setOcclusionModalOpen}
        resetForm={state.resetForm}
        handleSave={state.handleSave}
        handleImprove={state.handleImprove}
        addMcOption={state.addMcOption}
        removeMcOption={state.removeMcOption}
      />

      <ImprovePreviewDialog
        open={state.improveModalOpen}
        onOpenChange={state.setImproveModalOpen}
        improvePreview={state.improvePreview}
        editorType={state.editorType}
        onApply={state.applyImprovement}
        onDiscard={() => { state.setImproveModalOpen(false); }}
      />

      <DeleteCardDialog
        deleteId={state.deleteId}
        setDeleteId={state.setDeleteId}
        handleDelete={state.handleDelete}
      />

      <SuggestCorrectionWrapper
        suggestCard={state.suggestCard}
        setSuggestCard={state.setSuggestCard}
      />
    </div>
  );
};

export default ManageDeck;
