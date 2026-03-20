import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import LazyRichEditor from '@/components/LazyRichEditor';
import OcclusionEditor from '@/components/manage-deck/OcclusionEditor';
import AttachmentPreviewModal from '@/components/manage-deck/AttachmentPreviewModal';
import { OCCLUSION_COLORS } from '@/lib/occlusionColors';
import { IconCheck } from '@/components/icons';
import type { ImageAttachment } from '@/components/RichEditor';
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

/** Extract <img> URLs from HTML and return clean text */
function extractImages(html: string): { text: string; images: string[] } {
  const images: string[] = [];
  const regex = /<img[^>]+src="([^"]+)"[^>]*\/?>/g;
  let m;
  while ((m = regex.exec(html)) !== null) images.push(m[1]);
  const text = html.replace(/<img[^>]+\/?>/g, '').replace(/<p>\s*<\/p>$/g, '');
  return { text, images };
}

function buildFrontWithOcclusion(params: {
  imageUrl: string;
  frontText: string;
  rects: Array<{ id: string; color?: string }>;
  canvasSize: { w: number; h: number } | null;
}) {
  const colorGroups: Record<string, string[]> = {};
  params.rects.forEach((r) => {
    const color = r.color || OCCLUSION_COLORS[0].fill;
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(r.id);
  });

  return JSON.stringify({
    imageUrl: params.imageUrl,
    frontText: params.frontText,
    rects: params.rects,
    allRects: params.rects,
    canvasWidth: params.canvasSize?.w ?? 0,
    canvasHeight: params.canvasSize?.h ?? 0,
    colorGroups,
  });
}

export const CardEditorDialog = ({
  editorOpen, setEditorOpen, editingId,
  front, setFront, back, setBack,
  isSaving, isAICreating = false,
  occlusionModalOpen, setOcclusionModalOpen,
  resetForm, handleSave, handleAICreate,
  extraContent,
}: CardEditorDialogProps) => {

  // ─── Image attachment state (mirrors ManageDeck) ───
  const [frontAttachedImages, setFrontAttachedImages] = useState<string[]>([]);
  const [backAttachedImages, setBackAttachedImages] = useState<string[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<{ attachment: ImageAttachment; allowOcclusion: boolean } | null>(null);

  // ─── Occlusion state ───
  const [occlusionImageUrl, setOcclusionImageUrl] = useState('');
  const [occlusionRects, setOcclusionRects] = useState<Array<{ id: string; color?: string }>>([]);
  const [occlusionCanvasSize, setOcclusionCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [occlusionDraftWasNew, setOcclusionDraftWasNew] = useState(false);

  // ─── Derived text content (without images) ───
  const [editorFront, setEditorFront] = useState('');
  const [editorBack, setEditorBack] = useState('');

  const hasOcclusion = !!occlusionImageUrl && occlusionRects.length > 0;

  const rebuildFront = useCallback((nextText: string, attachedImages: string[], nextOcclusionImageUrl = occlusionImageUrl, nextOcclusionRects = occlusionRects, nextCanvasSize = occlusionCanvasSize) => {
    const imgTags = attachedImages.map(url => `<img src="${url}">`).join('');
    const frontWithImages = `${nextText}${imgTags}`;

    if (nextOcclusionImageUrl && nextOcclusionRects.length > 0) {
      setFront(buildFrontWithOcclusion({
        imageUrl: nextOcclusionImageUrl,
        frontText: frontWithImages,
        rects: nextOcclusionRects,
        canvasSize: nextCanvasSize,
      }));
      return;
    }

    if (nextOcclusionImageUrl && nextOcclusionRects.length === 0) {
      setFront(`${frontWithImages}<img src="${nextOcclusionImageUrl}">`);
      return;
    }

    setFront(frontWithImages);
  }, [occlusionCanvasSize, occlusionImageUrl, occlusionRects, setFront]);

  // Load content from front/back props when dialog opens or card changes
  useEffect(() => {
    if (!editorOpen) return;

    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    const looksLikeOcclusionJson = /^\s*\{.*"imageUrl"\s*:/.test(strippedFront);

    let isOcclusion = false;
    try {
      const d = JSON.parse(front);
      if (d && typeof d === 'object' && ('imageUrl' in d || 'allRects' in d)) isOcclusion = true;
    } catch {
      if (looksLikeOcclusionJson) {
        try {
          const d = JSON.parse(strippedFront);
          if (d && typeof d === 'object' && 'imageUrl' in d) isOcclusion = true;
        } catch {}
      }
    }

    if (isOcclusion) {
      try {
        let data: Record<string, unknown>;
        try { data = JSON.parse(front); } catch { data = JSON.parse(strippedFront); }
        const rects = (data.allRects || data.rects || []) as Array<{ id: string; color?: string }>;
        const imageUrl = (data.imageUrl as string) || '';
        const { text, images } = extractImages((data.frontText as string) || '');
        setEditorFront(text);
        if (imageUrl && rects.length === 0) {
          setFrontAttachedImages(images.includes(imageUrl) ? images : [...images, imageUrl]);
          setOcclusionImageUrl('');
          setOcclusionRects([]);
          setOcclusionCanvasSize(null);
        } else {
          setFrontAttachedImages(images);
          setOcclusionImageUrl(imageUrl);
          setOcclusionRects(rects);
          setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth as number, h: data.canvasHeight as number } : null);
        }
      } catch {
        setEditorFront('');
        setOcclusionImageUrl('');
        setOcclusionRects([]);
        setFrontAttachedImages([]);
        setOcclusionCanvasSize(null);
      }
      setOcclusionDraftWasNew(false);
    } else {
      const { text, images } = extractImages(front);
      setEditorFront(text);
      setFrontAttachedImages(images);
      setOcclusionImageUrl('');
      setOcclusionRects([]);
      setOcclusionCanvasSize(null);
      setOcclusionDraftWasNew(false);
    }

    // Back
    let backRaw = back;
    try {
      const p = JSON.parse(back);
      if (p && typeof p.clozeTarget === 'number') backRaw = p.extra || '';
    } catch {}
    const { text: bText, images: bImgs } = extractImages(backRaw);
    setEditorBack(bText);
    setBackAttachedImages(bImgs);
  }, [editorOpen, editingId]); // Only on open or card change

  // ─── Sync editor changes back to parent state ───
  const handleFrontTextChange = useCallback((v: string) => {
    setEditorFront(v);
    rebuildFront(v, frontAttachedImages);
  }, [frontAttachedImages, rebuildFront]);

  const handleBackTextChange = useCallback((v: string) => {
    setEditorBack(v);
    const imgTags = backAttachedImages.map(url => `<img src="${url}">`).join('');
    setBack(v + imgTags);
  }, [backAttachedImages, setBack]);

  // ─── Image attachment arrays for RichEditor ───
  const frontImageAttachments = useMemo<ImageAttachment[]>(() => {
    const atts: ImageAttachment[] = [];
    frontAttachedImages.forEach(url => atts.push({ url, isOcclusion: false, hasOcclusionRects: false }));
    if (occlusionImageUrl) {
      atts.push({ url: occlusionImageUrl, isOcclusion: true, hasOcclusionRects: occlusionRects.length > 0 });
    }
    return atts;
  }, [frontAttachedImages, occlusionImageUrl, occlusionRects]);

  const backImageAttachments = useMemo<ImageAttachment[]>(() => {
    return backAttachedImages.map(url => ({ url, isOcclusion: false, hasOcclusionRects: false }));
  }, [backAttachedImages]);

  const handleClose = () => {
    setEditorOpen(false);
    resetForm();
    setFrontAttachedImages([]);
    setBackAttachedImages([]);
    setPreviewAttachment(null);
    setOcclusionImageUrl('');
    setOcclusionRects([]);
    setOcclusionCanvasSize(null);
    setOcclusionDraftWasNew(false);
  };

  return (
    <>
      <Dialog open={editorOpen} onOpenChange={open => { if (!open) handleClose(); }}>
        <DialogContent
          className={cn(
            'flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden border bg-background p-0 sm:rounded-2xl [&>button]:hidden',
            'w-[calc(100vw-1rem)] sm:w-full',
            occlusionModalOpen ? 'sm:max-w-5xl' : 'sm:max-w-3xl',
          )}
        >
          {/* Header — minimal, matches ManageDeck */}
          <div className="shrink-0 border-b border-border/40 px-4 py-2.5 flex items-center justify-between">
            <button
              onClick={handleClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <span className="text-xs font-semibold text-foreground">
              {editingId ? 'Editar Cartão' : 'Novo Cartão'}
            </span>

            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IconCheck className="h-4 w-4" />}
            </button>
          </div>

          {/* Editor area — mirrors ManageDeck layout */}
          <div className={cn(
            'flex-1 min-h-0 overflow-hidden',
            occlusionModalOpen && 'overflow-hidden',
          )}>
            <div className={cn(
              'mx-auto flex h-full w-full max-w-2xl flex-col gap-1.5 p-3 sm:p-5',
              occlusionModalOpen && 'pointer-events-none select-none blur-[1px] scale-[0.985] transition-all',
            )}>
              {/* Front card */}
              <div className="relative flex min-h-[100px] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
                {(!editorFront || editorFront === '<p></p>') && !hasOcclusion && frontAttachedImages.length === 0 && !occlusionImageUrl ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-base font-medium text-muted-foreground/30">Frente</span>
                  </div>
                ) : null}
                <LazyRichEditor
                  content={editorFront}
                  onChange={handleFrontTextChange}
                  placeholder=""
                  chromeless
                  hideCloze={false}
                  imageAttachments={frontImageAttachments}
                  onImageAttached={(url) => {
                    setFrontAttachedImages(prev => {
                      const next = [...prev, url];
                      rebuildFront(editorFront, next);
                      return next;
                    });
                  }}
                  onRemoveAttachment={(url) => {
                    if (url === occlusionImageUrl) {
                      setOcclusionImageUrl('');
                      setOcclusionRects([]);
                      setOcclusionCanvasSize(null);
                      rebuildFront(editorFront, frontAttachedImages, '', [], null);
                    } else {
                      setFrontAttachedImages(prev => {
                        const next = prev.filter(u => u !== url);
                        rebuildFront(editorFront, next);
                        return next;
                      });
                    }
                  }}
                  onClickAttachment={(att) => {
                    if (att.isOcclusion && att.hasOcclusionRects) {
                      setOcclusionDraftWasNew(false);
                      setOcclusionModalOpen(true);
                    } else {
                      setPreviewAttachment({ attachment: att, allowOcclusion: true });
                    }
                  }}
                  onOcclusionImageReady={(imageUrl) => {
                    setOcclusionImageUrl(imageUrl);
                    setOcclusionRects([]);
                    setOcclusionCanvasSize(null);
                    setOcclusionDraftWasNew(true);
                    setOcclusionModalOpen(true);
                  }}
                  onAICreate={handleAICreate}
                  isAICreating={isAICreating}
                />
              </div>

              {/* Back card */}
              <div className="relative flex min-h-[100px] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
                {!editorBack || editorBack === '<p></p>' ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-base font-medium text-muted-foreground/30">Verso</span>
                  </div>
                ) : null}
                <LazyRichEditor
                  content={editorBack}
                  onChange={handleBackTextChange}
                  placeholder=""
                  chromeless
                  hideCloze
                  imageAttachments={backImageAttachments}
                  onImageAttached={(url) => {
                    setBackAttachedImages(prev => {
                      const next = [...prev, url];
                      const imgTags = next.map(u => `<img src="${u}">`).join('');
                      setBack(editorBack + imgTags);
                      return next;
                    });
                  }}
                  onRemoveAttachment={(url) => {
                    setBackAttachedImages(prev => {
                      const next = prev.filter(u => u !== url);
                      const imgTags = next.map(u => `<img src="${u}">`).join('');
                      setBack(editorBack + imgTags);
                      return next;
                    });
                  }}
                  onClickAttachment={(att) => {
                    setPreviewAttachment({ attachment: att, allowOcclusion: false });
                  }}
                />
              </div>

              {/* Extra content (e.g. MC-to-cloze convert button) */}
              {extraContent && <div className="pt-1">{extraContent}</div>}
            </div>
          </div>

          {/* Occlusion Editor — centered modal overlay */}
          {occlusionModalOpen && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-5">
              <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl max-h-[80dvh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col">
                <OcclusionEditor
                  initialFront={occlusionImageUrl ? JSON.stringify({
                    imageUrl: occlusionImageUrl, rects: occlusionRects, allRects: occlusionRects,
                    canvasWidth: occlusionCanvasSize?.w ?? 0, canvasHeight: occlusionCanvasSize?.h ?? 0,
                  }) : ''}
                  externalUsedColorIndices={(() => {
                    const indices = new Set<number>();
                    const matches = editorFront.matchAll(/\{\{c(\d+)::/g);
                    for (const m of matches) indices.add(parseInt(m[1]) - 1);
                    return indices;
                  })()}
                  onSave={(frontContent) => {
                    try {
                      const data = JSON.parse(frontContent);
                      const nextImageUrl = data.imageUrl || '';
                      const nextRects = data.allRects || data.rects || [];
                      const nextCanvas = data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null;

                      setOcclusionImageUrl(nextImageUrl);
                      setOcclusionRects(nextRects);
                      setOcclusionCanvasSize(nextCanvas);
                      setOcclusionDraftWasNew(false);

                      rebuildFront(editorFront, frontAttachedImages, nextImageUrl, nextRects, nextCanvas);
                    } catch {}
                    setOcclusionModalOpen(false);
                  }}
                  onCancel={() => {
                    if (occlusionDraftWasNew && occlusionImageUrl && occlusionRects.length === 0) {
                      setFrontAttachedImages(prev => {
                        const next = prev.includes(occlusionImageUrl) ? prev : [...prev, occlusionImageUrl];
                        rebuildFront(editorFront, next, '', [], null);
                        return next;
                      });
                      setOcclusionImageUrl('');
                      setOcclusionRects([]);
                      setOcclusionCanvasSize(null);
                    }
                    setOcclusionDraftWasNew(false);
                    setOcclusionModalOpen(false);
                  }}
                  isSaving={false}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Modal — same as ManageDeck */}
      <AttachmentPreviewModal
        open={!!previewAttachment}
        imageUrl={previewAttachment?.attachment.url ?? null}
        canConvertToOcclusion={previewAttachment?.allowOcclusion ?? false}
        onClose={() => setPreviewAttachment(null)}
        onAddOcclusion={() => {
          if (previewAttachment) {
            const url = previewAttachment.attachment.url;
            setFrontAttachedImages(prev => prev.filter(u => u !== url));
            setOcclusionImageUrl(url);
            setOcclusionRects([]);
            setOcclusionCanvasSize(null);
            setOcclusionDraftWasNew(true);
            setPreviewAttachment(null);
            requestAnimationFrame(() => setOcclusionModalOpen(true));
          }
        }}
      />
    </>
  );
};
