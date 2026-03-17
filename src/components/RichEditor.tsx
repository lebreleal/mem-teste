import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { markdownToHtml } from '@/lib/markdownToHtml';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { Mark, mergeAttributes } from '@tiptap/core';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2,
  List, ListOrdered, Code, Volume2, Palette, ImagePlus, ScanEye,
  ClipboardPaste, Paperclip, Search, Settings2,
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { compressImage } from '@/lib/imageUtils';

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
    return ['span', mergeAttributes(HTMLAttributes, { class: 'cloze-editor-mark' }), 0];
  },
});

/* ─── Converters: DB format ↔ Editor format ─── */
/** Convert {{c1::text}} → <span data-cloze="1" class="cloze-editor-mark">text</span> */
function clozeToEditor(html: string): string {
  // First convert any remaining markdown to HTML
  let result = markdownToHtml(html);
  return result.replace(/\{\{c(\d+)::(.+?)\}\}/g,
    '<span data-cloze="$1" class="cloze-editor-mark">$2</span>');
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

const TEXT_COLORS = [
  { label: 'Padrão', value: '' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' },
];

const RichEditor = ({ content, onChange, placeholder, onOcclusionPaste, onOcclusionAttach, onOcclusionImageReady, hideCloze, chromeless = false, hideToolbarUntilFocus = false, onAICreate, isAICreating = false, imageAttachments, onImageAttached, onRemoveAttachment, onClickAttachment }: RichEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [colorOpen, setColorOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [clozeCounter, setClozeCounter] = useState(1);
  const [clozeActive, setClozeActive] = useState(false);
  const [cursorInCloze, setCursorInCloze] = useState(false);
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

  // Sync cloze counter from content
  useEffect(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const matches = [...html.matchAll(/data-cloze="(\d+)"/g)];
    if (matches.length > 0) {
      const maxNum = Math.max(...matches.map(m => parseInt(m[1])));
      setClozeCounter(maxNum);
    } else {
      setClozeCounter(1);
    }
  }, [content, editor]);

  // Track whether cursor is inside an existing cloze
  useEffect(() => {
    if (!editor) return;

    const syncClozeState = () => {
      setCursorInCloze(editor.isActive('clozeMark'));
    };

    syncClozeState();
    editor.on('selectionUpdate', syncClozeState);
    editor.on('transaction', syncClozeState);
    editor.on('focus', syncClozeState);

    return () => {
      editor.off('selectionUpdate', syncClozeState);
      editor.off('transaction', syncClozeState);
      editor.off('focus', syncClozeState);
    };
  }, [editor]);

  // Deactivate cloze mark on Enter or Escape
  useEffect(() => {
    if (!editor) return;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === 'Escape') && clozeActive) {
        setTimeout(() => {
          editor.chain().unsetMark('clozeMark').run();
          setClozeActive(false);
        }, 0);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editor, clozeActive]);

  /* ─── Shared image upload helpers ─── */
  const uploadToStorage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Máximo 5MB', variant: 'destructive' }); return null;
    }
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop() || 'webp';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('card-images').upload(path, compressed);
    if (error) { toast({ title: 'Erro no upload', variant: 'destructive' }); return null; }
    const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
    return urlData.publicUrl;
  };

  const pickFileAndUpload = (onUrl: (url: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await uploadToStorage(file);
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
          const url = await uploadToStorage(file);
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
    const url = await uploadToStorage(file);
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
    pickFileAndUpload((url) => onOcclusionImageReady?.(url));
  };

  const handleOcclusionPasteClipboard = () => {
    if (!user) return;
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
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('card-images').upload(path, file);
      if (error) { toast({ title: 'Erro no upload', variant: 'destructive' }); return; }
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
      editor.chain().focus().insertContent(
        `<audio controls src="${urlData.publicUrl}"></audio>`
      ).run();
    };
    input.click();
  };

  /** Check if cursor is inside a cloze mark */
  const isCursorInCloze = useCallback(() => {
    if (!editor) return false;
    return editor.isActive('clozeMark');
  }, [editor]);

  /** Toggle cloze mark — if cursor is inside an existing cloze, remove that cloze range */
  const handleCloze = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    if (isCursorInCloze()) {
      // Find the exact range of the cloze mark at cursor position (not all adjacent clozes)
      const { $from } = editor.state.selection;
      const pos = $from.pos;
      const resolvedPos = editor.state.doc.resolve(pos);
      
      // Walk backward and forward to find this specific mark's boundaries
      const markType = editor.schema.marks.clozeMark;
      const currentMark = resolvedPos.marks().find(m => m.type === markType);
      if (currentMark) {
        const parent = resolvedPos.parent;
        const parentOffset = resolvedPos.start();
        let markFrom = pos;
        let markTo = pos;
        
        // Find start of this specific mark
        parent.nodesBetween(0, parent.content.size, (node, offset) => {
          if (node.isText) {
            const nodeFrom = parentOffset + offset;
            const nodeTo = nodeFrom + node.nodeSize;
            const hasThisMark = node.marks.some(m => m.type === markType && m.attrs.num === currentMark.attrs.num);
            if (hasThisMark && nodeFrom <= pos && nodeTo >= markFrom) {
              markFrom = Math.min(markFrom, nodeFrom);
              markTo = Math.max(markTo, nodeTo);
            }
          }
        });
        
        // Expand contiguously in both directions for same-num marks
        let changed = true;
        while (changed) {
          changed = false;
          parent.nodesBetween(0, parent.content.size, (node, offset) => {
            if (node.isText) {
              const nodeFrom = parentOffset + offset;
              const nodeTo = nodeFrom + node.nodeSize;
              const hasThisMark = node.marks.some(m => m.type === markType && m.attrs.num === currentMark.attrs.num);
              if (hasThisMark && ((nodeFrom <= markTo && nodeTo > markTo) || (nodeTo >= markFrom && nodeFrom < markFrom))) {
                markFrom = Math.min(markFrom, nodeFrom);
                markTo = Math.max(markTo, nodeTo);
                changed = true;
              }
            }
          });
        }
        
        // Remove the mark only from this range
        editor.chain().focus().setTextSelection({ from: markFrom, to: markTo }).unsetMark('clozeMark').setTextSelection(pos).run();
      }
      setClozeActive(false);
      setCursorInCloze(false);
      // Re-sync counter: find the lowest unused cloze number
      setTimeout(() => {
        if (!editor) return;
        const html = editor.getHTML();
        const nums = [...html.matchAll(/data-cloze="(\d+)"/g)].map(m => parseInt(m[1]));
        if (nums.length > 0) {
          // Find first gap starting from 1, or max+1
          const unique = [...new Set(nums)].sort((a, b) => a - b);
          let next = 1;
          for (const n of unique) {
            if (n === next) next++;
            else break;
          }
          setClozeCounter(next);
        } else {
          setClozeCounter(1);
        }
      }, 10);
      return;
    }

    if (clozeActive && !hasSelection) {
      editor.chain().focus().unsetMark('clozeMark').run();
      setClozeActive(false);
      return;
    }

    editor.chain().focus().setMark('clozeMark', { num: String(clozeCounter) }).run();

    if (hasSelection) {
      editor.chain().setTextSelection(to).unsetMark('clozeMark').insertContent(' ').setTextSelection(to + 1).run();
      setClozeActive(false);
    } else {
      setClozeActive(true);
    }
  }, [editor, clozeCounter, clozeActive, isCursorInCloze]);

  /** Increment counter and start new cloze mark */
  const handleClozeNext = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    if (clozeActive) {
      editor.chain().focus().unsetMark('clozeMark').run();
    }
    // Find next unused cloze number
    const html = editor.getHTML();
    const existingNums = [...new Set([...html.matchAll(/data-cloze="(\d+)"/g)].map(m => parseInt(m[1])))].sort((a, b) => a - b);
    let nextNum = 1;
    for (const n of existingNums) {
      if (n === nextNum) nextNum++;
      else break;
    }
    if (nextNum <= Math.max(0, ...existingNums)) nextNum = Math.max(...existingNums) + 1;
    setClozeCounter(nextNum);
    setTimeout(() => {
      editor.chain().focus().setMark('clozeMark', { num: String(nextNum) }).run();
      if (hasSelection) {
        editor.chain().setTextSelection(to).unsetMark('clozeMark').insertContent(' ').setTextSelection(to + 1).run();
        setClozeActive(false);
      } else {
        setClozeActive(true);
      }
    }, 10);
  }, [editor, clozeCounter, clozeActive]);

  const handleSetColor = (color: string) => {
    if (!editor) return;
    if (color === '') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setColorOpen(false);
  };

  if (!editor) return null;

  const ToolBtn = ({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title?: string }) => (
    <Button type="button" variant="ghost" size="icon"
      className={`h-7 w-7 transition-all ${active ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick} title={title}
    >
      {children}
    </Button>
  );

  const currentColor = editor.getAttributes('textStyle').color || '';

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
              case 'cloze':
                if (hideCloze) return null;
                return (
                  <ToolBtn key={t.id} onClick={handleCloze} active={clozeActive || cursorInCloze} title={`Cloze c${clozeCounter} (mesmo número)`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
                    </svg>
                  </ToolBtn>
                );
              case 'clozeNext':
                if (hideCloze) return null;
                return (
                  <Button key={t.id} type="button" variant="ghost" size="icon"
                    className="h-7 w-7"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleClozeNext}
                    title={`Novo cloze c${clozeCounter + 1} (próximo número)`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
                      <path d="M13 8h-2v3H8v2h3v3h2v-3h3v-2h-3z" />
                    </svg>
                  </Button>
                );
              case 'occlusion':
                if (!onOcclusionImageReady && !onOcclusionPaste && !onOcclusionAttach) return null;
                return (
                  <DropdownMenu key={t.id}>
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
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 relative" title="Cor do texto">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                          <path d="M12 6 7.226 19.367a.953.953 0 0 1-1.801-.625L9.94 5.36A2 2 0 0 1 11.836 4h.328a2 2 0 0 1 1.895 1.36l4.516 13.382a.953.953 0 0 1-1.801.625z" />
                          <path d="M8 14h8v2H8z" />
                        </svg>
                        {currentColor && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-3.5 rounded-full" style={{ backgroundColor: currentColor }} />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <div className="grid grid-cols-4 gap-1">
                        {TEXT_COLORS.map(c => (
                          <button key={c.value || 'default'} onClick={() => handleSetColor(c.value)}
                            className={`h-7 w-7 rounded-md border border-border transition-transform hover:scale-110 ${!c.value ? 'bg-foreground' : ''}`}
                            style={c.value ? { backgroundColor: c.value } : undefined}
                            title={c.label}
                          />
                        ))}
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
