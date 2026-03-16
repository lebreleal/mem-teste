import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { markdownToHtml } from '@/lib/markdownToHtml';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Mark, mergeAttributes } from '@tiptap/core';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2,
  List, ListOrdered, Code, Volume2, Palette, ImagePlus, ScanEye,
  ClipboardPaste, Paperclip, Settings2,
} from 'lucide-react';
import { loadToolbarConfig, saveToolbarConfig, type ToolbarItem } from '@/components/rich-editor/toolbarConfig';
import { lazy, Suspense } from 'react';
const ToolbarConfigSheet = lazy(() => import('@/components/rich-editor/ToolbarConfigSheet'));
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

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onOcclusionPaste?: () => void;
  onOcclusionAttach?: () => void;
  hideCloze?: boolean;
  chromeless?: boolean;
  hideToolbarUntilFocus?: boolean;
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

const RichEditor = ({ content, onChange, placeholder, onOcclusionPaste, onOcclusionAttach, hideCloze, chromeless = false, hideToolbarUntilFocus = false }: RichEditorProps) => {
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

  const isToolVisible = (id: string) => toolbarItems.find(t => t.id === id)?.visible !== false;

  const handleSaveToolbarConfig = (items: ToolbarItem[]) => {
    setToolbarItems(items);
    saveToolbarConfig(items);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ inline: true, allowBase64: false }),
      Underline,
      TextStyle,
      Color,
      ClozeMark,
    ],
    content: clozeToEditor(content),
    onUpdate: ({ editor: ed }) => {
      const html = editorToCloze(ed.getHTML());
      onChange(html);
    },
    editorProps: {
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

  const uploadImageFile = async (file: File) => {
    if (!user || !editor) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Máximo 5MB', variant: 'destructive' }); return;
    }
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop() || 'webp';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('card-images').upload(path, compressed);
    if (error) { toast({ title: 'Erro no upload', variant: 'destructive' }); return; }
    const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
    editor.chain().focus().setImage({ src: urlData.publicUrl }).run();
  };

  const handleImageAttach = async () => {
    if (!user || !editor) return;
    setImageMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await uploadImageFile(file);
    };
    input.click();
  };

  const handleImagePaste = async () => {
    if (!user || !editor) return;
    setImageMenuOpen(false);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const file = new File([blob], `paste.${ext}`, { type: imageType });
          await uploadImageFile(file);
          return;
        }
      }
      toast({ title: 'Nenhuma imagem na área de transferência', variant: 'destructive' });
    } catch {
      toast({ title: 'Não foi possível acessar a área de transferência', variant: 'destructive' });
    }
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
      className={chromeless ? 'bg-transparent' : 'rounded-lg border border-input bg-card'}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only blur if focus left this entire container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFocused(false);
        }
      }}
    >
      <EditorContent editor={editor} className="flex-1 min-h-0 overflow-y-auto" />
      {showToolbar && (
        <div className={`flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-none ${chromeless ? 'border-t border-border/80' : 'border-t border-border'}`}>
          {toolbarItems.filter(t => t.visible).map((t) => {
            switch (t.id) {
              case 'image':
                return (
                  <DropdownMenu key={t.id} open={imageMenuOpen} onOpenChange={setImageMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Inserir imagem">
                        <ImagePlus className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleImagePaste} className="gap-2">
                        <ClipboardPaste className="h-4 w-4" /> Colar da área de transferência
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleImageAttach} className="gap-2">
                        <Paperclip className="h-4 w-4" /> Anexar arquivo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              case 'cloze':
                if (hideCloze) return null;
                return (
                  <ToolBtn key={t.id} onClick={handleCloze} active={clozeActive || cursorInCloze} title={`Cloze c${clozeCounter} (mesmo número)`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
                      <path d="M12 9v6" />
                      <path d="M9 12h6" />
                    </svg>
                  </Button>
                );
              case 'occlusion':
                if (!onOcclusionPaste || !onOcclusionAttach) return null;
                return (
                  <DropdownMenu key={t.id}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Oclusão de imagem">
                        <ScanEye className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={onOcclusionPaste} className="gap-2">
                        <ClipboardPaste className="h-4 w-4" /> Colar da área de transferência
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onOcclusionAttach} className="gap-2">
                        <Paperclip className="h-4 w-4" /> Anexar arquivo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                        <Palette className="h-3.5 w-3.5" />
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
      <EditorContent editor={editor} />

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
    </div>
  );
};

export default RichEditor;
