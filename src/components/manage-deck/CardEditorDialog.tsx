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
    <Dialog open={editorOpen} onOpenChange={open => { if (!open) { setEditorOpen(false); resetForm(); } }}>
      <DialogContent className={`relative overflow-hidden p-0 ${occlusionModalOpen ? 'sm:max-w-5xl max-h-[92dvh]' : 'sm:max-w-2xl max-h-[85dvh]'}`}>
        <div className="relative">
          <div className={`transition-all ${occlusionModalOpen ? 'pointer-events-none select-none blur-[1px] scale-[0.985]' : ''}`}>
            <div className={`${occlusionModalOpen ? 'max-h-[92dvh] overflow-hidden' : 'max-h-[85dvh] overflow-y-auto'} p-6`}>
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
            </div>
          </div>

          {occlusionModalOpen && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/40 backdrop-blur-[2px] p-3 sm:p-5 lg:p-6">
              <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-2xl max-h-[78dvh] min-h-[60vh]">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
