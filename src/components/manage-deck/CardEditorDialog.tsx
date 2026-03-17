import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CardEditorForm } from '@/components/card-editor/CardEditorForm';
import { CardTagEditor } from './CardTagWidgets';
import type { EditorCardType } from '@/hooks/useManageDeck';
import OcclusionEditor from '@/components/manage-deck/OcclusionEditor';

interface CardEditorDialogProps {
  editorOpen: boolean;
  setEditorOpen: (v: boolean) => void;
  editingId: string | null;
  editorType: EditorCardType | null;
  setEditorType: (v: EditorCardType | null) => void;
  front: string;
  setFront: (v: string) => void;
  back: string;
  setBack: (v: string) => void;
  mcOptions: string[];
  setMcOptions: (v: string[]) => void;
  mcCorrectIndex: number;
  setMcCorrectIndex: (v: number) => void;
  isSaving: boolean;
  isImproving: boolean;
  isAICreating?: boolean;
  occlusionModalOpen: boolean;
  setOcclusionModalOpen: (v: boolean) => void;
  resetForm: () => void;
  handleSave: (addAnother: boolean) => void;
  handleImprove: () => void;
  handleAICreate?: (templatePrompt: string) => void;
  addMcOption: () => void;
  removeMcOption: (idx: number) => void;
}

export const CardEditorDialog = ({
  editorOpen, setEditorOpen, editingId, editorType, setEditorType,
  front, setFront, back, setBack,
  mcOptions, setMcOptions, mcCorrectIndex, setMcCorrectIndex,
  isSaving, isImproving, isAICreating = false,
  occlusionModalOpen, setOcclusionModalOpen,
  resetForm, handleSave, handleImprove, handleAICreate, addMcOption, removeMcOption,
}: CardEditorDialogProps) => {

  const hasOcclusionImage = (() => {
    try {
      const d = JSON.parse(front);
      return d !== null && typeof d === 'object' && ('imageUrl' in d || 'rects' in d || 'allRects' in d);
    } catch { return false; }
  })();

  const occlusionImageUrl = (() => {
    try { return JSON.parse(front)?.imageUrl || ''; } catch { return ''; }
  })();

  const canImprove = !hasOcclusionImage;

  return (
    <>
      <Dialog open={editorOpen && !occlusionModalOpen} onOpenChange={open => { if (!open) { setEditorOpen(false); resetForm(); } }}>
        <DialogContent className="max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingId ? 'Editar Cartão' : 'Novo Cartão'}
            </DialogTitle>
          </DialogHeader>
          <CardEditorForm
            front={front}
            onFrontChange={setFront}
            back={back}
            onBackChange={setBack}
            cardType={undefined}
            mcOptions={mcOptions}
            onMcOptionsChange={setMcOptions}
            mcCorrectIndex={mcCorrectIndex}
            onMcCorrectIndexChange={setMcCorrectIndex}
            occlusionImageUrl={occlusionImageUrl}
            onOpenOcclusion={() => setOcclusionModalOpen(true)}
            onRemoveOcclusion={() => {
              try {
                const d = JSON.parse(front);
                setFront(d.frontText || '');
              } catch { setFront(''); }
            }}
            onImprove={canImprove ? handleImprove : undefined}
            isImproving={isImproving}
            onAICreate={handleAICreate}
            isAICreating={isAICreating}
            onSave={() => handleSave(false)}
            onSaveAndAdd={!editingId ? () => handleSave(true) : undefined}
            onCancel={() => { setEditorOpen(false); resetForm(); }}
            isSaving={isSaving}
            extraContent={editingId ? <CardTagEditor cardId={editingId} /> : undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Occlusion Editor — modal over modal with visible padding */}
      {occlusionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-10">
          {/* Backdrop — semi-transparent so parent modal is visible behind */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOcclusionModalOpen(false)} />
          {/* Modal content — sized with padding to show parent behind */}
          <div className="relative bg-background rounded-xl border shadow-2xl w-full max-w-3xl h-[calc(100dvh-24px)] sm:h-[calc(100dvh-48px)] lg:h-[calc(100dvh-80px)] max-h-[700px] flex flex-col overflow-hidden">
            <OcclusionEditor
              initialFront={front}
              onSave={(frontContent) => {
                try {
                  const existing = JSON.parse(front);
                  if (existing.frontText) {
                    const newData = JSON.parse(frontContent);
                    newData.frontText = existing.frontText;
                    setFront(JSON.stringify(newData));
                  } else { setFront(frontContent); }
                } catch { setFront(frontContent); }
                setOcclusionModalOpen(false);
              }}
              onCancel={() => setOcclusionModalOpen(false)}
              isSaving={false}
            />
          </div>
        </div>
      )}
    </>
  );
};
