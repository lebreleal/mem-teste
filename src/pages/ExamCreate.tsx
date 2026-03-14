/**
 * Exam creation / editing page – thin visual orchestrator.
 * All state and logic lives in useExamCreateFlow hook.
 */

import BuyCreditsDialog from '@/components/BuyCreditsDialog';
import ExamCreateHeader from '@/components/exam-create/ExamCreateHeader';
import ExamModeSelector from '@/components/exam-create/ExamModeSelector';
import AIExamConfig from '@/components/exam-create/AIExamConfig';
import FileExamFlow from '@/components/exam-create/FileExamFlow';
import ManualQuestionsEditor from '@/components/exam-create/ManualQuestionsEditor';
import ProModelConfirmDialog from '@/components/ProModelConfirmDialog';
import { useExamCreateFlow } from '@/hooks/useExamCreateFlow';

const ExamCreate = () => {
  const flow = useExamCreateFlow();

  if (flow.isEditing && flow.examLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ExamCreateHeader
        isEditing={flow.isEditing}
        creationMode={flow.creationMode}
        fileStep={flow.fileStep}
        streak={flow.studyStats?.streak ?? 0}
        energy={flow.energy}
        onCreditsOpen={() => flow.setCreditsOpen(true)}
        onBack={flow.handleBack}
      />

      <div className="overflow-y-auto h-[calc(100vh-57px)]">
        <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6 pb-12">

          {/* Mode selector – only for new exams */}
          {!flow.isEditing && flow.fileStep === 'upload' && (
            <ExamModeSelector creationMode={flow.creationMode} onModeChange={flow.setCreationMode} />
          )}

          {/* AI Mode */}
          {flow.creationMode === 'ai' && !flow.isEditing && (
            <AIExamConfig
              userId={flow.user!.id}
              selectedDeckId={flow.selectedDeckId} setSelectedDeckId={flow.setSelectedDeckId}
              title={flow.title} setTitle={flow.setTitle}
              totalQuestions={flow.totalQuestions} setTotalQuestions={flow.setTotalQuestions}
              writtenCount={flow.writtenCount} setWrittenCount={flow.setWrittenCount}
              optionsCount={flow.optionsCount} setOptionsCount={flow.setOptionsCount}
              timeLimit={flow.timeLimit} setTimeLimit={flow.setTimeLimit}
              model={flow.model} setModel={flow.setModel}
              totalCost={flow.totalCost} canAfford={flow.canAfford}
              activeDecks={flow.activeDecks.map(d => ({ id: d.id, name: d.name }))}
              onGenerate={flow.handleAIGenerate}
              exampleMode={flow.exampleMode} setExampleMode={flow.setExampleMode}
              exampleText={flow.exampleText} setExampleText={flow.setExampleText}
              exampleImageUrl={flow.exampleImageUrl} setExampleImageUrl={flow.setExampleImageUrl}
              exampleImageUploading={flow.exampleImageUploading} setExampleImageUploading={flow.setExampleImageUploading}
            />
          )}

          {/* File Mode */}
          {flow.creationMode === 'file' && !flow.isEditing && (
            <FileExamFlow
              userId={flow.user!.id}
              fileStep={flow.fileStep} filePages={flow.filePages}
              fileLoadProgress={flow.fileLoadProgress} fileLoading={flow.fileLoading} fileName={flow.fileName}
              fileTitle={flow.fileTitle} setFileTitle={flow.setFileTitle}
              fileTotalQuestions={flow.fileTotalQuestions} setFileTotalQuestions={flow.setFileTotalQuestions}
              fileWrittenCount={flow.fileWrittenCount} setFileWrittenCount={flow.setFileWrittenCount}
              fileOptionsCount={flow.fileOptionsCount} setFileOptionsCount={flow.setFileOptionsCount}
              fileTimeLimit={flow.fileTimeLimit} setFileTimeLimit={flow.setFileTimeLimit}
              model={flow.model} setModel={flow.setModel}
              fileTotalCost={flow.fileTotalCost} fileCanAfford={flow.fileCanAfford}
              onFileUpload={flow.handleFileUpload}
              onTogglePage={(idx) => flow.setFilePages(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p))}
              onSelectAll={() => flow.setFilePages(prev => prev.map(p => ({ ...p, selected: true })))}
              onDeselectAll={() => flow.setFilePages(prev => prev.map(p => ({ ...p, selected: false })))}
              onContinueToConfig={() => flow.setFileStep('config')}
              onGenerate={flow.handleFileGenerate}
              exampleMode={flow.exampleMode} setExampleMode={flow.setExampleMode}
              exampleText={flow.exampleText} setExampleText={flow.setExampleText}
              exampleImageUrl={flow.exampleImageUrl} setExampleImageUrl={flow.setExampleImageUrl}
              exampleImageUploading={flow.exampleImageUploading} setExampleImageUploading={flow.setExampleImageUploading}
              selectedSourceId={flow.selectedSourceId}
              onLoadSource={flow.handleLoadSource}
            />
          )}

          {/* Manual / Edit Mode */}
          {(flow.creationMode === 'manual' || flow.isEditing) && (
            <ManualQuestionsEditor
              isEditing={flow.isEditing}
              manualTitle={flow.manualTitle} setManualTitle={flow.setManualTitle}
              manualTimeLimit={flow.manualTimeLimit} setManualTimeLimit={flow.setManualTimeLimit}
              manualOptionsCount={flow.manualOptionsCount} setManualOptionsCount={flow.setManualOptionsCount}
              manualQuestions={flow.manualQuestions} setManualQuestions={flow.setManualQuestions}
              selectedDeckId={flow.selectedDeckId} setSelectedDeckId={flow.setSelectedDeckId}
              activeDecks={flow.activeDecks.map(d => ({ id: d.id, name: d.name }))}
              onSave={flow.handleManualSave}
              isSaving={flow.isSaving}
            />
          )}
        </main>
      </div>

      <BuyCreditsDialog open={flow.creditsOpen} onOpenChange={flow.setCreditsOpen} currentBalance={flow.energy} />
      <ProModelConfirmDialog open={flow.pendingPro} onConfirm={flow.confirmPro} onCancel={flow.cancelPro} baseCost={flow.totalQuestions * 2} />
    </div>
  );
};

export default ExamCreate;
