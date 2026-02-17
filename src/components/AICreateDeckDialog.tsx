/**
 * AI Create Deck Dialog — orchestrator component.
 * All state and logic live in useAIDeckFlow; UI is split into step components.
 */

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Brain } from 'lucide-react';
import { useAIDeckFlow } from '@/components/ai-deck/useAIDeckFlow';
import UploadStep from '@/components/ai-deck/UploadStep';
import LoadingPagesStep from '@/components/ai-deck/LoadingPagesStep';
import PageSelectionStep from '@/components/ai-deck/PageSelectionStep';
import ConfigStep from '@/components/ai-deck/ConfigStep';
import GenerationProgress from '@/components/ai-deck/GenerationProgress';
import CardReviewStep from '@/components/ai-deck/CardReviewStep';
import AnalysisStep from '@/components/ai-deck/AnalysisStep';

interface AICreateDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
  existingDeckId?: string | null;
  existingDeckName?: string | null;
}

const AICreateDeckDialog = ({ open, onOpenChange, folderId, existingDeckId, existingDeckName }: AICreateDeckDialogProps) => {
  const flow = useAIDeckFlow({ onOpenChange, folderId, existingDeckId, existingDeckName });

  const stepTitle: Record<string, string> = {
    pages: 'Selecione as páginas',
    config: 'Configurações de IA',
    review: 'Revisar Cartões',
    analysis: 'Análise de Cobertura',
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!flow.busy) { onOpenChange(v); if (!v) flow.resetState(); } }}>
      <DialogContent className="sm:max-w-3xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col p-4 sm:p-6" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Brain className="h-5 w-5" style={{ color: 'hsl(var(--energy-purple))' }} />
            {stepTitle[flow.step] || 'Criar Baralho com IA'}
          </DialogTitle>
        </DialogHeader>

        {flow.step === 'upload' && (
          <UploadStep
            deckName={flow.deckName}
            onDeckNameChange={flow.setDeckName}
            inputMode={flow.inputMode}
            onInputModeChange={flow.setInputMode}
            rawText={flow.rawText}
            onRawTextChange={flow.setRawText}
            fileInputRef={flow.fileInputRef}
            onFileSelect={flow.handleFileSelect}
            onTextContinue={flow.handleTextContinue}
          />
        )}

        {flow.step === 'loading-pages' && (
          <LoadingPagesStep loadProgress={flow.loadProgress} />
        )}

        {flow.step === 'pages' && (
          <PageSelectionStep
            pages={flow.pages}
            deckName={flow.deckName}
            onDeckNameChange={flow.setDeckName}
            selectedCount={flow.selectedPages.length}
            totalCredits={flow.totalCredits}
            energy={flow.energy}
            onTogglePage={flow.togglePage}
            onSelectAll={flow.selectAll}
            onDeselectAll={flow.deselectAll}
            onContinue={() => flow.setStep('config')}
          />
        )}

        {flow.step === 'config' && (
          <ConfigStep
            detailLevel={flow.detailLevel}
            onDetailLevelChange={flow.setDetailLevel}
            cardFormats={flow.cardFormats}
            onToggleFormat={flow.toggleFormat}
            targetCardCount={flow.targetCardCount}
            onTargetCardCountChange={flow.setTargetCardCount}
            customInstructions={flow.customInstructions}
            onCustomInstructionsChange={flow.setCustomInstructions}
            model={flow.model}
            onModelChange={flow.setModel}
            selectedPageCount={flow.selectedPages.length}
            totalCredits={flow.totalCredits}
            energy={flow.energy}
            getCost={flow.getCost}
            onBack={() => flow.setStep('pages')}
            onGenerate={flow.handleGenerate}
          />
        )}

        {(flow.step === 'generating' || flow.step === 'analyzing') && (
          <GenerationProgress step={flow.step} genProgress={flow.genProgress} />
        )}

        {flow.step === 'review' && (
          <CardReviewStep
            cards={flow.cards}
            editingIdx={flow.editingIdx}
            editFront={flow.editFront}
            editBack={flow.editBack}
            onEditFrontChange={flow.setEditFront}
            onEditBackChange={flow.setEditBack}
            onStartEdit={flow.startEdit}
            onSaveEdit={flow.saveEdit}
            onCancelEdit={() => flow.setStep('review')}
            onDeleteCard={flow.deleteCard}
            onToggleType={flow.toggleType}
            onAnalyze={flow.handleAnalyze}
            onSave={flow.handleSave}
            onBack={() => { flow.setStep('config'); }}
            isSaving={flow.isSaving}
          />
        )}

        {flow.step === 'analysis' && flow.analysis && (
          <AnalysisStep
            analysis={flow.analysis}
            onBack={() => flow.setStep('review')}
            onFillGaps={flow.handleFillGaps}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AICreateDeckDialog;
