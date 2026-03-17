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

  // Check if front content has image occlusion data
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
            onSave={() => handleSave(false)}
            onSaveAndAdd={!editingId ? () => handleSave(true) : undefined}
            onCancel={() => { setEditorOpen(false); resetForm(); }}
            isSaving={isSaving}
            extraContent={editingId ? <CardTagEditor cardId={editingId} /> : undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Occlusion Editor Modal */}
      <Dialog open={occlusionModalOpen} onOpenChange={setOcclusionModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-primary">
                <path d="M2 18v-1.5h2V18h2v2H4a2 2 0 0 1-2-2M4 4h2v2H4v1.5H2V6a2 2 0 0 1 2-2M3.486 13.5H2v-3h2L6.586 8a2 2 0 0 1 2.828 0L13 11.586l.586-.586a2 2 0 0 1 2.828 0l5.086 5 .5.5V18a2 2 0 0 1-2 2h-2v-2h2v-.586l-5-5-.586.586 1.293 1.293a1 1 0 0 1-1.414 1.414L8 9.414 4.5 13l-.5.5h-.514M10 6V4h4v2zM18 6V4h2a2 2 0 0 1 2 2v1.5h-2V6zM20 10.5h2v3h-2z" />
                <path d="M14 18v2h-4v-2z" />
              </svg>
              Oclusão de Imagem
            </DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </>
  );
};
