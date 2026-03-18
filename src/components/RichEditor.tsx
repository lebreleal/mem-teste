import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { markdownToHtml } from '@/lib/markdownToHtml';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
// @ts-ignore - types may lag behind install
import Highlight from '@tiptap/extension-highlight';
// @ts-ignore - types may lag behind install
import Placeholder from '@tiptap/extension-placeholder';
import { Mark, mergeAttributes } from '@tiptap/core';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2,
  List, ListOrdered, Code, Volume2, Palette, ImagePlus, ScanEye,
  ClipboardPaste, Paperclip, Search, Settings2, Trash2,
} from 'lucide-react';
import { IconImage, IconImageOcclusion } from '@/components/icons';
import { loadToolbarConfig, saveToolbarConfig, type ToolbarItem } from '@/components/rich-editor/toolbarConfig';
import { lazy, Suspense } from 'react';
const ToolbarConfigSheet = lazy(() => import('@/components/rich-editor/ToolbarConfigSheet'));
const DrawingCanvasModal = lazy(() => import('@/components/rich-editor/DrawingCanvasModal'));
const AICreatorInlineRow = lazy(() => import('@/components/rich-editor/AICreatorSheet').then(m => ({ default: m.AICreatorInlineRow })));
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { uploadImage as uploadToStorage, uploadFile as uploadFileToStorage } from '@/services/storageService';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';
import { CLOZE_COLORS, getVisibleColorIndices } from '@/lib/occlusionColors';

/* ─── Cloze Mark Extension ─── */
const ClozeMark = Mark.create({
  name: 'clozeMark',
  inclusive: false,
  addAttributes() {
    return {
      num: {
        default: '1',
        parseHTML: (el) => el.getAttribute('data-cloze') || '1',
        renderHTML: (attrs) => ({ 'data-cloze': attrs.num }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-cloze]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const num = parseInt(HTMLAttributes['data-cloze'] || '1') - 1;
    const color = CLOZE_COLORS[num % CLOZE_COLORS.length];
    return ['span', mergeAttributes(HTMLAttributes, {
      class: 'cloze-editor-mark',
      style: `--cloze-bg:${color.bg};--cloze-border:${color.border};--cloze-text:${color.text}`,
    }), 0];
  },
});

/* ─── Converters: DB format ↔ Editor format ─── */
/** Convert {{c1::text}} → <span data-cloze="1" class="cloze-editor-mark" style="...">text</span> */
function clozeToEditor(html: string): string {
  let result = markdownToHtml(html);
  return result.replace(/\{\{c(\d+)::(.+?)\}\}/g, (_match, num: string, text: string) => {
    const idx = parseInt(num) - 1;
    const color = CLOZE_COLORS[idx % CLOZE_COLORS.length];
    return `<span data-cloze="${num}" class="cloze-editor-mark" style="--cloze-bg:${color.bg};--cloze-border:${color.border};--cloze-text:${color.text}">${text}</span>`;
  });
}
/** Convert <span data-cloze="1" ...>text</span> → {{c1::text}} */
function editorToCloze(html: string): string {
  return html.replace(/<span[^>]*data-cloze="(\d+)"[^>]*>(.*?)<\/span>/g, '{{c$1::$2}}');
}

export interface ImageAttachment {
  url: string;
  isOcclusion: boolean;
  hasOcclusionRects: boolean;
}

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** @deprecated use onOcclusionImageReady */
  onOcclusionPaste?: () => void;
  /** @deprecated use onOcclusionImageReady */
  onOcclusionAttach?: () => void;
  /** Called with uploaded image URL when user attaches/pastes an occlusion image */
  onOcclusionImageReady?: (imageUrl: string) => void;
  hideCloze?: boolean;
  chromeless?: boolean;
  hideToolbarUntilFocus?: boolean;
  /** AI Creator — pass callback to show the AI Creator button in toolbar */
  onAICreate?: (templatePrompt: string) => void;
  isAICreating?: boolean;
  /** Image attachments displayed as thumbnails below text, above toolbar */
  imageAttachments?: ImageAttachment[];
  /** Called when user attaches a normal image (instead of inserting inline) */
  onImageAttached?: (url: string) => void;
  /** Called when user removes an attachment thumbnail */
  onRemoveAttachment?: (url: string) => void;
  /** Called when user clicks an attachment thumbnail */
  onClickAttachment?: (attachment: ImageAttachment) => void;
}

const HIGHLIGHT_COLORS = [
  { label: 'Nenhum', value: '' },
  { label: 'Verde claro', value: '#E1FFBE' },
  { label: 'Rosa claro', value: '#FFE6E8' },
  { label: 'Azul claro', value: '#DDF1FF' },
  { label: 'Amarelo claro', value: '#FFF3CE' },
  { label: 'Roxo claro', value: '#E8E8FF' },
];

const TEXT_COLORS = [
  { label: 'Padrão', value: '' },
  { label: 'Verde', value: '#47C700' },
  { label: 'Vermelho', value: '#FF375B' },
  { label: 'Azul', value: '#0093F0' },
  { label: 'Laranja', value: '#FF8B00' },
  { label: 'Roxo', value: '#4E5EE5' },
];

const RichEditor = ({ content, onChange, placeholder, onOcclusionPaste, onOcclusionAttach, onOcclusionImageReady, hideCloze, chromeless = false, hideToolbarUntilFocus = false, onAICreate, isAICreating = false, imageAttachments, onImageAttached, onRemoveAttachment, onClickAttachment }: RichEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [colorOpen, setColorOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [clozeColorIndex, setClozeColorIndex] = useState(0); // index into CLOZE_COLORS
  const clozeCounter = clozeColorIndex + 1; // c1, c2, c3...
  const [clozeActive, setClozeActive] = useState(false);
  const [cursorInCloze, setCursorInCloze] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hasAnyCloze, setHasAnyCloze] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [toolbarItems, setToolbarItems] = useState<ToolbarItem[]>(loadToolbarConfig);
  const [configOpen, setConfigOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [aiCreatorOpen, setAiCreatorOpen] = useState(false); // toggles inline row
  const uploadImageFileRef = React.useRef<((file: File) => Promise<void>) | null>(null);
  // Sync toolbar config across all RichEditor instances
  useEffect(() => {
    const handler = () => setToolbarItems(loadToolbarConfig());
    window.addEventListener('toolbar-config-changed', handler);
    return () => window.removeEventListener('toolbar-config-changed', handler);
  }, []);

  const isToolVisible = (id: string) => toolbarItems.find(t => t.id === id)?.visible !== false;

  const handleSaveToolbarConfig = (items: ToolbarItem[]) => {
    setToolbarItems(items);
    saveToolbarConfig(items);
    window.dispatchEvent(new Event('toolbar-config-changed'));
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ inline: true, allowBase64: true }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      ClozeMark,
      Placeholder.configure({ placeholder: placeholder || '' }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
    ],
    content: clozeToEditor(content),
    onUpdate: ({ editor: ed }) => {
      const html = editorToCloze(ed.getHTML());
      onChange(html);
    },
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) uploadImageFileRef.current?.(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            uploadImageFileRef.current?.(file);
            return true;
          }
        }
        return false;
      },
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[120px] outline-none p-3 text-card-foreground',
      },
    },
  });

  // Sync editor content when prop changes externally
  useEffect(() => {
    if (!editor) return;
    const editorHtml = editorToCloze(editor.getHTML());
    if (content !== editorHtml) {
      editor.commands.setContent(clozeToEditor(content), { emitUpdate: false });
    }
  }, [content, editor]);

  // Sync persisted cloze metadata from content without forcing the next active color
  useEffect(() => {
    if (!editor) return;
    const hasCloze = /data-cloze="/.test(editor.getHTML());
    setHasAnyCloze(hasCloze);
    if (!hasCloze) {
      setClozeColorIndex(0);
    }
  }, [content, editor]);

  // Guards to prevent recursive cloze updates and stale selection sync
  const isUpdatingClozeRef = useRef(false);
  const skipNextClozeSyncRef = useRef(false);

  const getSelectionClozeContext = useCallback((): { num: number; from: number; to: number } | null => {
    if (!editor) return null;

    const markType = editor.schema.marks.clozeMark;
    const { from, to, empty, $from } = editor.state.selection;
    const docSize = editor.state.doc.content.size;
    const safeResolve = (pos: number) => editor.state.doc.resolve(Math.max(0, Math.min(pos, docSize)));

    let currentNum: string | null = null;

    if (empty) {
      const marksAtCursor = [
        ...$from.marks(),
        ...safeResolve(from > 0 ? from - 1 : from).marks(),
        ...safeResolve(from < docSize ? from + 1 : from).marks(),
      ];
      currentNum = marksAtCursor.find((mark) => mark.type === markType)?.attrs.num ?? null;
    } else {
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (currentNum || !node.isText) return;
        const currentMark = node.marks.find((mark) => mark.type === markType);
        if (currentMark) {
          currentNum = String(currentMark.attrs.num ?? '1');
        }
      });
    }

    if (!currentNum) return null;

    const anchorPos = empty ? $from.pos : from;
    const resolvedPos = editor.state.doc.resolve(anchorPos);
    const parent = resolvedPos.parent;
    const parentOffset = resolvedPos.start();
    let markFrom = anchorPos;
    let markTo = anchorPos;

    parent.nodesBetween(0, parent.content.size, (node, offset) => {
      if (!node.isText) return;
      const nodeFrom = parentOffset + offset;
      const nodeTo = nodeFrom + node.nodeSize;
      const hasThisMark = node.marks.some(
        (mark) => mark.type === markType && String(mark.attrs.num ?? '1') === currentNum,
      );
      const touchesSelection = empty
        ? nodeFrom <= anchorPos && nodeTo >= anchorPos
        : nodeFrom < to && nodeTo > from;

      if (hasThisMark && touchesSelection) {
        markFrom = Math.min(markFrom, nodeFrom);
        markTo = Math.max(markTo, nodeTo);
      }
    });

    let expanded = true;
    while (expanded) {
      expanded = false;
      parent.nodesBetween(0, parent.content.size, (node, offset) => {
        if (!node.isText) return;
        const nodeFrom = parentOffset + offset;
        const nodeTo = nodeFrom + node.nodeSize;
        const hasThisMark = node.marks.some(
          (mark) => mark.type === markType && String(mark.attrs.num ?? '1') === currentNum,
        );

        if (hasThisMark && ((nodeFrom <= markTo && nodeTo > markTo) || (nodeTo >= markFrom && nodeFrom < markFrom))) {
          const nextFrom = Math.min(markFrom, nodeFrom);
          const nextTo = Math.max(markTo, nodeTo);
          if (nextFrom !== markFrom || nextTo !== markTo) {
            markFrom = nextFrom;
            markTo = nextTo;
            expanded = true;
          }
        }
      });
    }

    return {
      num: Math.max(1, Number(currentNum) || 1),
      from: markFrom,
      to: markTo,
    };
  }, [editor]);

  const deactivateClozeMode = useCallback((closePalette = true) => {
    if (!editor) return;

    skipNextClozeSyncRef.current = false;
    setClozeActive(false);
    setCursorInCloze(false);
    if (closePalette) setPaletteOpen(false);

    isUpdatingClozeRef.current = true;
    try {
      editor.chain().unsetMark('clozeMark').run();
    } finally {
      isUpdatingClozeRef.current = false;
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const syncClozeState = () => {
      if (isUpdatingClozeRef.current) return;

      const context = getSelectionClozeContext();
      setCursorInCloze(!!context);

      if (context) {
        setClozeColorIndex(context.num - 1);
        setPaletteOpen(true);
        return;
      }

      if (skipNextClozeSyncRef.current) {
        skipNextClozeSyncRef.current = false;
        setPaletteOpen(true);
        return;
      }

      if (clozeActive) {
        deactivateClozeMode();
        return;
      }

      setPaletteOpen(false);
    };

    const syncClozeContent = () => {
      if (isUpdatingClozeRef.current) return;
      setHasAnyCloze(/data-cloze="/.test(editor.getHTML()));
    };

    const handleBlur = () => {
      if (clozeActive) {
        deactivateClozeMode();
        return;
      }

      setCursorInCloze(false);
      setPaletteOpen(false);
    };

    syncClozeState();
    syncClozeContent();
    editor.on('selectionUpdate', syncClozeState);
    editor.on('focus', syncClozeState);
    editor.on('blur', handleBlur);
    editor.on('transaction', syncClozeContent);

    return () => {
      editor.off('selectionUpdate', syncClozeState);
      editor.off('focus', syncClozeState);
      editor.off('blur', handleBlur);
      editor.off('transaction', syncClozeContent);
    };
  }, [editor, clozeActive, deactivateClozeMode, getSelectionClozeContext]);

  // Re-apply cloze mark while the mode is active so typing can continue inside the same group
  useEffect(() => {
    if (!editor) return;

    const enforceCloze = () => {
      if (isUpdatingClozeRef.current || !clozeActive) return;
      const { from, to } = editor.state.selection;
      if (from !== to) return;
      if (!editor.isActive('clozeMark')) {
        isUpdatingClozeRef.current = true;
        try {
          editor.chain().setMark('clozeMark', { num: String(clozeCounter) }).run();
        } finally {
          isUpdatingClozeRef.current = false;
        }
      }
    };

    editor.on('transaction', enforceCloze);
    return () => { editor.off('transaction', enforceCloze); };
  }, [editor, clozeActive, clozeCounter]);

  // Deactivate cloze mark on Enter or Escape
  useEffect(() => {
    if (!editor) return;

    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === 'Escape') && clozeActive) {
        deactivateClozeMode();
        return;
      }

      if (e.key === 'Escape' && cursorInCloze) {
        setPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editor, clozeActive, cursorInCloze, deactivateClozeMode]);

  /* ─── Shared image upload helpers ─── */
  const handleUploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Máximo 5MB', variant: 'destructive' }); return null;
    }
    const compressed = await compressImage(file);
    try {
      const publicUrl = await uploadToStorage(user.id, compressed);
      return publicUrl;
    } catch { toast({ title: 'Erro no upload', variant: 'destructive' }); return null; }
  };

  const pickFileAndUpload = (onUrl: (url: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await handleUploadImage(file);
      if (url) onUrl(url);
    };
    input.click();
  };

  const pasteClipboardAndUpload = async (onUrl: (url: string) => void) => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const file = new File([blob], `paste.${ext}`, { type: imageType });
          const url = await handleUploadImage(file);
          if (url) onUrl(url);
          return;
        }
      }
      toast({ title: 'Nenhuma imagem na área de transferência', variant: 'destructive' });
    } catch {
      toast({ title: 'Não foi possível acessar a área de transferência', variant: 'destructive' });
    }
  };

  /* ─── Image insert into editor ─── */
  const insertImageUrl = (url: string) => {
    editor?.chain().focus().setImage({ src: url }).run();
  };

  const uploadImageFile = async (file: File) => {
    const url = await handleUploadImage(file);
    if (url) {
      if (onImageAttached) onImageAttached(url);
      else insertImageUrl(url);
    }
  };
  uploadImageFileRef.current = uploadImageFile;

  const handleImageAttach = () => {
    if (!user || (!editor && !onImageAttached)) return;
    setImageMenuOpen(false);
    pickFileAndUpload(onImageAttached || insertImageUrl);
  };

  const handleImagePaste = () => {
    if (!user || (!editor && !onImageAttached)) return;
    setImageMenuOpen(false);
    pasteClipboardAndUpload(onImageAttached || insertImageUrl);
  };

  /* ─── Occlusion image — reuses shared helpers ─── */
  const handleOcclusionAttach = () => {
    if (!user) return;
    setClozeActive(false);
    setPaletteOpen(false);
    pickFileAndUpload((url) => onOcclusionImageReady?.(url));
  };

  const handleOcclusionPasteClipboard = () => {
    if (!user) return;
    setClozeActive(false);
    setPaletteOpen(false);
    pasteClipboardAndUpload((url) => onOcclusionImageReady?.(url));
  };

  const handleAudioUpload = async () => {
    if (!user || !editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Máximo 10MB', variant: 'destructive' }); return;
      }
      const ext = file.name.split('.').pop();
      try {
        const publicUrl = await uploadFileToStorage(user.id, file);
        editor.chain().focus().insertContent(
          `<audio controls src="${publicUrl}"></audio>`
        ).run();
      } catch { toast({ title: 'Erro no upload', variant: 'destructive' }); }
    };
    input.click();
  };

  /** Get used cloze number indices from editor content */
  const getUsedClozeIndices = useCallback((): Set<number> => {
    if (!editor) return new Set();
    const html = editor.getHTML();
    const nums = [...html.matchAll(/data-cloze="(\d+)"/g)].map(m => parseInt(m[1]) - 1);
    return new Set(nums);
  }, [editor]);

  /** Toggle cloze mode without forcing an exit after the first characters */
  const handleCloze = useCallback(() => {
    if (!editor) return;

    const currentContext = getSelectionClozeContext();

    if (currentContext) {
      skipNextClozeSyncRef.current = true;
      isUpdatingClozeRef.current = true;
      try {
        editor.chain().focus().setMark('clozeMark', { num: String(currentContext.num) }).run();
      } finally {
        isUpdatingClozeRef.current = false;
      }

      setClozeColorIndex(currentContext.num - 1);
      setClozeActive(true);
      setCursorInCloze(true);
      setPaletteOpen(true);
      return;
    }

    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    skipNextClozeSyncRef.current = true;
    isUpdatingClozeRef.current = true;
    try {
      const chain = editor.chain().focus().setMark('clozeMark', { num: String(clozeCounter) });
      if (hasSelection) {
        chain.setTextSelection(to).setMark('clozeMark', { num: String(clozeCounter) });
      }
      chain.run();
    } finally {
      isUpdatingClozeRef.current = false;
    }

    setClozeActive(true);
    setCursorInCloze(true);
    setPaletteOpen(true);
  }, [editor, clozeCounter, getSelectionClozeContext]);

  /** Change cloze group/color while keeping the editor active inside the same cloze */
  const handleClozeColorChange = useCallback((colorIdx: number) => {
    if (!editor) return;

    const nextNum = colorIdx + 1;
    const currentContext = getSelectionClozeContext();

    setClozeColorIndex(colorIdx);
    setPaletteOpen(true);

    if (currentContext) {
      const nextCursorPos = Math.max(currentContext.from, Math.min(editor.state.selection.to, currentContext.to));

      skipNextClozeSyncRef.current = true;
      isUpdatingClozeRef.current = true;
      try {
        editor.chain()
          .focus()
          .setTextSelection({ from: currentContext.from, to: currentContext.to })
          .unsetMark('clozeMark')
          .setMark('clozeMark', { num: String(nextNum) })
          .setTextSelection(nextCursorPos)
          .setMark('clozeMark', { num: String(nextNum) })
          .run();
      } finally {
        isUpdatingClozeRef.current = false;
      }

      setClozeActive(true);
      setCursorInCloze(true);
      return;
    }

    skipNextClozeSyncRef.current = true;
    isUpdatingClozeRef.current = true;
    try {
      editor.chain().focus().setMark('clozeMark', { num: String(nextNum) }).run();
    } finally {
      isUpdatingClozeRef.current = false;
    }

    setClozeActive(true);
    setCursorInCloze(true);
  }, [editor, getSelectionClozeContext]);

  const handleSetColor = (color: string) => {
    if (!editor) return;
    if (color === '') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setColorOpen(false);
  };

  const handleSetHighlight = (color: string) => {
    if (!editor) return;
    if (color === '') {
      (editor.chain().focus() as any).unsetHighlight().run();
    } else {
      (editor.chain().focus() as any).setHighlight({ color }).run();
    }
    setColorOpen(false);
  };

  if (!editor) return null;

  const ToolBtn = React.forwardRef<HTMLButtonElement, { onClick: () => void; active?: boolean; children: React.ReactNode; title?: string }>(
    ({ onClick, active, children, title }, ref) => (
      <Button type="button" variant="ghost" size="icon" ref={ref}
        className={`h-7 w-7 transition-all ${active ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick} title={title}
      >
        {children}
      </Button>
    )
  );
  ToolBtn.displayName = 'ToolBtn';

  const currentColor = editor.getAttributes('textStyle').color || '';
  const currentHighlight = editor.getAttributes('highlight').color || '';

  const showToolbar = !hideToolbarUntilFocus || isFocused;

  return (
    <div
      className={`${chromeless ? 'bg-transparent' : 'rounded-lg border border-input bg-card'} flex flex-col h-full`}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only blur if focus left this entire container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFocused(false);
        }
      }}
    >
      <EditorContent editor={editor} className="tiptap-editor-fill" />

      {/* Image attachment thumbnails */}
      {imageAttachments && imageAttachments.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 px-3 py-2">
          {imageAttachments.map((att) => {
            const title = att.isOcclusion && att.hasOcclusionRects ? 'Editar oclusão' : 'Abrir imagem';

            return (
              <div
                key={att.url}
                className="group relative cursor-pointer"
                onClick={() => onClickAttachment?.(att)}
                title={title}
              >
                <img
                  src={att.url}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-border/50 object-cover"
                />

                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveAttachment?.(att.url); }}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground/50 transition-colors hover:text-destructive"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>

                <div className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded border border-border/30 bg-background/85 backdrop-blur-sm">
                  {att.isOcclusion && att.hasOcclusionRects
                    ? <IconImageOcclusion className="h-3.5 w-3.5 text-muted-foreground" />
                    : <IconImage className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showToolbar && (
        <div className={`flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-none ${chromeless ? 'border-t border-border/80' : 'border-t border-border'}`}>
          {/* AI Creator — always first */}
          {onAICreate && (
            <>
              <Button type="button" variant="ghost" size="icon"
                className="h-7 w-7 shrink-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAiCreatorOpen(v => !v)}
                title="Criador de IA"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-4 w-4">
                  <path fill="url(#ai_toolbar_grad)" fillRule="evenodd" d="m6.894 3.787.29.58a1 1 0 0 0 .447.447l.58.29a1 1 0 0 1 0 1.789l-.58.29a1 1 0 0 0-.447.447l-.29.58a1 1 0 0 1-1.788 0l-.29-.58a1 1 0 0 0-.447-.447l-.58-.29a1 1 0 0 1 0-1.79l.58-.289a1 1 0 0 0 .447-.447l.29-.58a1 1 0 0 1 1.788 0m7.5 1.764a1 1 0 0 0-1.788 0l-1.058 2.115a7 7 0 0 1-3.13 3.13l-2.115 1.058a1 1 0 0 0 0 1.789L8.418 14.7a7 7 0 0 1 3.13 3.13l1.058 2.116a1 1 0 0 0 1.788 0l1.058-2.115a7 7 0 0 1 3.13-3.13l2.115-1.058a1 1 0 0 0 0-1.79l-2.115-1.057a7 7 0 0 1-3.13-3.13zm-1.057 3.01.163-.327.163.326a9 9 0 0 0 4.025 4.025l.326.163-.326.163a9 9 0 0 0-4.025 4.025l-.163.326-.163-.326a9 9 0 0 0-4.025-4.025l-.326-.163.326-.163a9 9 0 0 0 4.025-4.025" clipRule="evenodd" />
                  <defs><linearGradient id="ai_toolbar_grad" x1="3.236" x2="22.601" y1="3.234" y2="4.913" gradientUnits="userSpaceOnUse"><stop stopColor="#00B3FF" /><stop offset="0.33" stopColor="#3347FF" /><stop offset="0.66" stopColor="#FF306B" /><stop offset="1" stopColor="#FF9B23" /></linearGradient></defs>
                </svg>
              </Button>
              <div className="mx-0.5 h-4 w-px bg-border shrink-0" />
            </>
          )}
          {toolbarItems.filter(t => t.visible).map((t) => {
            switch (t.id) {
              case 'image':
                return (
                  <DropdownMenu key={t.id} open={imageMenuOpen} onOpenChange={setImageMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Inserir imagem">
                        <IconImage className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleImagePaste} className="gap-2">
                        <ClipboardPaste className="h-4 w-4" /> Colar da área de transferência
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleImageAttach} className="gap-2">
                        <IconImage className="h-4 w-4" /> Anexar imagem
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              case 'cloze': {
                if (hideCloze) return null;
                const usedIndices = getUsedClozeIndices();
                const visibleIndices = getVisibleColorIndices(usedIndices);
                return (
                  <Popover key={t.id} open={paletteOpen} onOpenChange={(open) => {
                    if (!open) setPaletteOpen(false);
                  }}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="icon"
                        className={`h-7 w-7 transition-all ${(clozeActive || cursorInCloze) ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : ''}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleCloze}
                        title="Oclusão de texto"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
                        </svg>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="center"
                      sideOffset={6}
                      className="w-auto p-1.5 flex items-center gap-1"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      {visibleIndices.map(idx => {
                        const c = CLOZE_COLORS[idx % CLOZE_COLORS.length];
                        const isActive = clozeColorIndex === idx;
                        return (
                          <button
                            key={idx}
                            className={`h-5 w-5 rounded-full transition-all shrink-0 ${isActive ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/40 scale-110' : 'hover:scale-110'}`}
                            style={{ backgroundColor: c.dot }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleClozeColorChange(idx)}
                            title={c.label}
                          />
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                );
              }
              case 'occlusion':
                if (!onOcclusionImageReady && !onOcclusionPaste && !onOcclusionAttach) return null;
                return (
                  <DropdownMenu key={t.id} onOpenChange={(open) => {
                    if (open) deactivateClozeMode();
                  }}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Oclusão de imagem">
                        <IconImageOcclusion className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={onOcclusionImageReady ? handleOcclusionPasteClipboard : onOcclusionPaste} className="gap-2">
                        <ClipboardPaste className="h-4 w-4" /> Colar da área de transferência
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onOcclusionImageReady ? handleOcclusionAttach : onOcclusionAttach} className="gap-2">
                        <IconImage className="h-4 w-4" /> Anexar imagem
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              case 'drawing':
                return (
                  <ToolBtn key={t.id} onClick={() => setDrawingOpen(true)} title="Desenho">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M14.78 10.746 13 11l.254-1.78a1 1 0 0 1 .283-.565l3.65-3.65 1.807 1.809-3.65 3.649a1 1 0 0 1-.565.283M19.704 6.104l-1.808-1.808 1.026-1.026a1 1 0 0 1 1.414 0l.394.394a1 1 0 0 1 0 1.414zM11.873 11.354c-1.267-1.35-2.71-2.42-4.034-2.934-.66-.257-1.366-.405-2.039-.31-.714.1-1.35.473-1.756 1.147-.443.735-.579 1.498-.465 2.241.11.718.441 1.357.833 1.899.746 1.035 1.867 1.93 2.675 2.576l.065.051q.415.33.763.605c.835.659 1.397 1.102 1.771 1.523.217.244.31.42.352.558.026.09.041.2.026.35h-.032c-.343-.006-.892-.137-1.582-.413-1.366-.548-2.897-1.509-3.743-2.354a1 1 0 0 0-1.414 1.415c1.078 1.076 2.855 2.17 4.413 2.795.772.31 1.588.544 2.293.556.353.006.766-.042 1.142-.244.415-.223.716-.598.832-1.083.129-.542.136-1.07-.018-1.59-.152-.511-.437-.939-.774-1.318-.503-.567-1.256-1.16-2.12-1.839q-.322-.253-.66-.523c-.868-.693-1.792-1.436-2.367-2.235-.28-.388-.433-.73-.478-1.03-.042-.275-.004-.567.201-.908.07-.115.152-.175.321-.199.211-.03.556.007 1.037.194.958.372 2.161 1.225 3.3 2.439a1 1 0 1 0 1.458-1.369" />
                    </svg>
                  </ToolBtn>
                );
              case 'audio':
                return (
                  <ToolBtn key={t.id} onClick={handleAudioUpload} title="Inserir áudio">
                    <Volume2 className="h-3.5 w-3.5" />
                  </ToolBtn>
                );
              case 'color':
                return (
                  <Popover key={t.id} open={colorOpen} onOpenChange={setColorOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 relative" title="Destaque e cor">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M12 6 7.226 19.367a.953.953 0 0 1-1.801-.625L9.94 5.36A2 2 0 0 1 11.836 4h.328a2 2 0 0 1 1.895 1.36l4.516 13.382a.953.953 0 0 1-1.801.625z" />
                          <path d="M8 14h8v2H8z" />
                        </svg>
                        <span
                          className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-3.5 rounded-full"
                          style={{ backgroundColor: currentColor || currentHighlight || 'hsl(var(--muted-foreground))' }}
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3 space-y-2.5" align="start">
                      {/* Highlight row */}
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Grifo</span>
                        <div className="flex items-center gap-1.5">
                          {HIGHLIGHT_COLORS.map(c => (
                            <button
                              key={c.value || 'none'}
                              onClick={() => handleSetHighlight(c.value)}
                              className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 flex items-center justify-center ${currentHighlight === c.value || (!currentHighlight && !c.value) ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border/60'}`}
                              style={c.value ? { backgroundColor: c.value } : undefined}
                              title={c.label}
                            >
                              {!c.value && (
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect width="18" height="18" x="3" y="3" rx="1" />
                                  <path d="m19.49 3.094 1.415 1.414L4.51 20.903 3.096 19.49z" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="h-px bg-border" />
                      {/* Text color row */}
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Texto</span>
                        <div className="flex items-center gap-1.5">
                          {TEXT_COLORS.map(c => (
                            <button
                              key={c.value || 'default'}
                              onClick={() => handleSetColor(c.value)}
                              className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${currentColor === c.value || (!currentColor && !c.value) ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border/60'}`}
                              style={c.value ? { backgroundColor: c.value } : { backgroundColor: 'hsl(var(--foreground))' }}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              case 'bold':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito"><Bold className="h-3.5 w-3.5" /></ToolBtn>;
              case 'italic':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico"><Italic className="h-3.5 w-3.5" /></ToolBtn>;
              case 'underline':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Sublinhado"><UnderlineIcon className="h-3.5 w-3.5" /></ToolBtn>;
              case 'strike':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Tachado"><Strikethrough className="h-3.5 w-3.5" /></ToolBtn>;
              case 'heading':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título"><Heading2 className="h-3.5 w-3.5" /></ToolBtn>;
              case 'bulletList':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista"><List className="h-3.5 w-3.5" /></ToolBtn>;
              case 'orderedList':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada"><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>;
              case 'codeBlock':
                return <ToolBtn key={t.id} onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Código"><Code className="h-3.5 w-3.5" /></ToolBtn>;
              case 'link':
                return (
                  <React.Fragment key={t.id}>
                    <ToolBtn active={editor.isActive('link')} title="Inserir link" onClick={() => {
                      if (editor.isActive('link')) {
                        editor.chain().focus().unsetLink().run();
                      } else {
                        setLinkUrl('');
                        setLinkDialogOpen(true);
                      }
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <g>
                          <path d="m13.29 9.29-4 4a1 1 0 0 0 0 1.42 1 1 0 0 0 1.42 0l4-4a1 1 0 0 0-1.42-1.42" />
                          <path d="M12.28 17.4 11 18.67a4.2 4.2 0 0 1-5.58.4 4 4 0 0 1-.27-5.93l1.42-1.43a1 1 0 0 0 0-1.42 1 1 0 0 0-1.42 0l-1.27 1.28a6.15 6.15 0 0 0-.67 8.07 6.06 6.06 0 0 0 9.07.6l1.42-1.42a1 1 0 0 0-1.42-1.42M19.66 3.22a6.18 6.18 0 0 0-8.13.68L10.45 5a1.09 1.09 0 0 0-.17 1.61 1 1 0 0 0 1.42 0L13 5.3a4.17 4.17 0 0 1 5.57-.4 4 4 0 0 1 .27 5.95l-1.42 1.43a1 1 0 0 0 0 1.42 1 1 0 0 0 1.42 0l1.42-1.42a6.06 6.06 0 0 0-.6-9.06" />
                        </g>
                      </svg>
                    </ToolBtn>
                    {linkDialogOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLinkDialogOpen(false)}>
                        <div className="bg-card rounded-2xl p-5 w-[320px] shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
                          <h3 className="text-center font-semibold text-foreground">Adicionar link</h3>
                          <input
                            type="url"
                            placeholder="URL"
                            value={linkUrl}
                            onChange={e => setLinkUrl(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && linkUrl.trim()) {
                                editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                                setLinkDialogOpen(false);
                              }
                            }}
                            autoFocus
                            className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border focus:border-primary"
                          />
                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setLinkDialogOpen(false)}>Cancelar</Button>
                            <Button className="flex-1 rounded-xl" disabled={!linkUrl.trim()} onClick={() => {
                              editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                              setLinkDialogOpen(false);
                            }}>Salvar</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              default:
                return null;
            }
          })}

          {/* Editar button — always last */}
          <div className="mx-0.5 h-4 w-px bg-border shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground shrink-0 gap-1"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setConfigOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      )}

      <Suspense fallback={null}>
        {configOpen && (
          <ToolbarConfigSheet
            open={configOpen}
            onOpenChange={setConfigOpen}
            items={toolbarItems}
            onSave={handleSaveToolbarConfig}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {drawingOpen && (
          <DrawingCanvasModal
            open={drawingOpen}
            onClose={() => setDrawingOpen(false)}
            onSave={async (dataUrl) => {
              setDrawingOpen(false);
              if (!user || !editor) return;
              try {
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });
                await uploadImageFile(file);
              } catch {
                toast({ title: 'Erro ao salvar desenho', variant: 'destructive' });
              }
            }}
          />
        )}
      </Suspense>
      {/* AI Creator Inline Row — shown when sparkle is toggled */}
      {aiCreatorOpen && onAICreate && (
        <Suspense fallback={null}>
          <AICreatorInlineRow
            onGenerate={(prompt) => {
              onAICreate(prompt);
              setAiCreatorOpen(false);
            }}
            isGenerating={isAICreating}
          />
        </Suspense>
      )}
    </div>
  );
};

export default RichEditor;
