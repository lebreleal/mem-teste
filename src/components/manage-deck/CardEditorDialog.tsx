import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import LazyRichEditor from '@/components/LazyRichEditor';
import OcclusionEditor from '@/components/manage-deck/OcclusionEditor';

import type { EditorCardType } from '@/hooks/useManageDeck';

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
  extraContent?: React.ReactNode;
}

export const CardEditorDialog = ({
  editorOpen, setEditorOpen, editingId,
  front, setFront, back, setBack,
  isSaving, isAICreating = false,
  occlusionModalOpen, setOcclusionModalOpen,
  resetForm, handleSave, handleAICreate,
  extraContent,
}: CardEditorDialogProps) => {

  const hasOcclusionImage = (() => {
    try {
      const d = JSON.parse(front);
      return d !== null && typeof d === 'object' && ('imageUrl' in d || 'rects' in d || 'allRects' in d);
    } catch { return false; }
  })();

  // For image_occlusion, extract frontText for display
  const isImageMode = hasOcclusionImage;
  const editorFront = isImageMode
    ? (() => { try { return JSON.parse(front)?.frontText || ''; } catch { return front; } })()
    : front;

  const handleFrontChange = (v: string) => {
    if (isImageMode) {
      try { const d = JSON.parse(front); d.frontText = v; setFront(JSON.stringify(d)); }
      catch { setFront(v); }
    } else {
      setFront(v);
    }
  };

  const handleOcclusionImageReady = (imageUrl: string) => {
    try {
      const existing = JSON.parse(front);
      existing.imageUrl = imageUrl;
      setFront(JSON.stringify(existing));
    } catch {
      setFront(JSON.stringify({ imageUrl, allRects: [] }));
    }
    setOcclusionModalOpen(true);
  };

  return (
    <Dialog open={editorOpen} onOpenChange={open => { if (!open) { setEditorOpen(false); resetForm(); } }}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 border bg-background sm:rounded-2xl',
          'w-[96vw] sm:w-full',
          occlusionModalOpen ? 'sm:max-w-5xl max-h-[94dvh]' : 'sm:max-w-2xl max-h-[90dvh]',
        )}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border/40 px-5 py-3 flex items-center justify-between">
          <DialogHeader className="space-y-0">
            <DialogTitle className="font-display text-base">
              {editingId ? 'Editar Cartão' : 'Novo Cartão'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditorOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Card editor area — mirrors ManageDeck layout */}
        <div className={cn(
          'flex-1 min-h-0',
          occlusionModalOpen ? 'overflow-hidden' : 'overflow-y-auto',
        )}>
          <div className={cn(
            'mx-auto max-w-2xl flex flex-col gap-2 p-3 sm:p-5',
            occlusionModalOpen && 'pointer-events-none select-none blur-[1px] scale-[0.985] transition-all',
          )}>
            {/* Front card */}
            <div className="flex-1 min-h-[120px] rounded-xl border border-border/60 bg-card overflow-hidden relative flex flex-col">
              {(!editorFront || editorFront === '<p></p>') && !isImageMode ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-muted-foreground/30 text-base font-medium">Frente</span>
                </div>
              ) : null}
              <LazyRichEditor
                content={editorFront}
                onChange={handleFrontChange}
                placeholder=""
                chromeless
                hideCloze={false}
                onOcclusionImageReady={handleOcclusionImageReady}
                onAICreate={handleAICreate}
                isAICreating={isAICreating}
              />
            </div>

            {/* Back card */}
            <div className="flex-1 min-h-[120px] rounded-xl border border-border/60 bg-card overflow-hidden relative flex flex-col">
              {!back || back === '<p></p>' ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-muted-foreground/30 text-base font-medium">Verso</span>
                </div>
              ) : null}
              <LazyRichEditor
                content={back}
                onChange={setBack}
                placeholder=""
                chromeless
                hideCloze
              />
            </div>

            {/* Extra content (e.g. MC-to-cloze convert button) */}
            {extraContent && <div className="pt-1">{extraContent}</div>}
          </div>
        </div>

        {/* Occlusion overlay */}
        {occlusionModalOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-5">
            <div className="relative flex w-full max-w-lg sm:max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl max-h-[80dvh]">
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
      </DialogContent>
    </Dialog>
  );
};
