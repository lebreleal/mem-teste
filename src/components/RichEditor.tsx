import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2,
  List, ListOrdered, Code, Volume2, Palette, ImagePlus, ScanEye,
  ClipboardPaste, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onOcclusionPaste?: () => void;
  onOcclusionAttach?: () => void;
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

const RichEditor = ({ content, onChange, placeholder, onOcclusionPaste, onOcclusionAttach }: RichEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [colorOpen, setColorOpen] = useState(false);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [clozeCounter, setClozeCounter] = useState(1);
  const [clozeActive, setClozeActive] = useState(false);
  const clozeActiveRef = useRef(false);
  const clozeCounterRef = useRef(1);

  // Keep refs in sync
  useEffect(() => { clozeActiveRef.current = clozeActive; }, [clozeActive]);
  useEffect(() => { clozeCounterRef.current = clozeCounter; }, [clozeCounter]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ inline: true, allowBase64: false }),
      Underline,
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[120px] outline-none p-3 text-card-foreground',
      },
      handleTextInput: (view, from, to, text) => {
        if (!clozeActiveRef.current) return false;
        // Don't wrap if we're already inside a cloze marker
        const docText = view.state.doc.textContent;
        const beforeCursor = docText.slice(0, from);
        const openBraces = (beforeCursor.match(/\{\{c\d+::/g) || []).length;
        const closeBraces = (beforeCursor.match(/\}\}/g) || []).length;
        if (openBraces > closeBraces) return false; // already inside cloze
        return false; // let normal typing happen, we handle wrapping on space/enter
      },
    },
  });

  // Sync editor content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // Sync cloze counter from content
  useEffect(() => {
    if (!editor) return;
    const plainText = editor.state.doc.textContent;
    const matches = [...plainText.matchAll(/\{\{c(\d+)::/g)];
    if (matches.length > 0) {
      const maxNum = Math.max(...matches.map(m => parseInt(m[1])));
      setClozeCounter(maxNum);
    } else {
      setClozeCounter(1);
      setClozeActive(false);
    }
  }, [content, editor]);

  const uploadImageFile = async (file: File) => {
    if (!user || !editor) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Máximo 5MB', variant: 'destructive' }); return;
    }
    const ext = file.name.split('.').pop() || 'png';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('card-images').upload(path, file);
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

  /** Toggle cloze mode with current counter — if text selected, wrap it; otherwise toggle mode */
  const handleCloze = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      // Text selected: wrap it
      const selectedText = editor.state.doc.textBetween(from, to);
      editor.chain().focus().deleteSelection().insertContent(`{{c${clozeCounter}::${selectedText}}}`).run();
      setClozeActive(true);
    } else {
      // No selection: toggle mode. When activating, insert opening marker; user types; on deactivate close it
      if (clozeActive) {
        // Deactivate
        setClozeActive(false);
      } else {
        // Activate: insert opening cloze marker
        editor.chain().focus().insertContent(`{{c${clozeCounter}::`).run();
        setClozeActive(true);
      }
    }
  }, [editor, clozeCounter, clozeActive]);

  /** Deactivate cloze by inserting closing braces and keeping cursor after */
  const closeClozeMarker = useCallback(() => {
    if (!editor || !clozeActive) return;
    editor.chain().focus().insertContent('}}&nbsp;').run();
    setClozeActive(false);
  }, [editor, clozeActive]);

  // Close cloze marker when pressing Enter or when clicking outside
  useEffect(() => {
    if (!editor || !clozeActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        closeClozeMarker();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editor, clozeActive, closeClozeMarker]);

  /** Increment counter, close current cloze if active, then start new one */
  const handleClozeNext = useCallback(() => {
    if (!editor) return;
    // Close current cloze if active
    if (clozeActive) {
      editor.chain().focus().insertContent('}}').run();
    }
    const { from, to } = editor.state.selection;
    const nextNum = clozeCounter + 1;
    if (from !== to) {
      const selectedText = editor.state.doc.textBetween(from, to);
      editor.chain().focus().deleteSelection().insertContent(`{{c${nextNum}::${selectedText}}}`).run();
    } else {
      // Start new cloze with incremented number
      editor.chain().focus().insertContent(`{{c${nextNum}::`).run();
    }
    setClozeCounter(nextNum);
    setClozeActive(true);
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
      onClick={onClick} title={title}
    >
      {children}
    </Button>
  );

  const currentColor = editor.getAttributes('textStyle').color || '';

  return (
    <div className="rounded-lg border border-input bg-card">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
        {/* Special tools first */}
        <DropdownMenu open={imageMenuOpen} onOpenChange={setImageMenuOpen}>
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

        {/* Cloze same number button - dashed square */}
        <ToolBtn onClick={handleCloze} active={clozeActive} title={`Cloze c${clozeCounter} (mesmo número)`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
          </svg>
        </ToolBtn>

        {/* Cloze next number button - dashed square with + */}
        <Button type="button" variant="ghost" size="icon"
          className="h-7 w-7"
          onClick={handleClozeNext}
          title={`Novo cloze c${clozeCounter + 1} (próximo número)`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 3" />
            <path d="M12 9v6" />
            <path d="M9 12h6" />
          </svg>
        </Button>

        {onOcclusionPaste && onOcclusionAttach && (
          <DropdownMenu>
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
        )}
        <ToolBtn onClick={handleAudioUpload} title="Inserir áudio">
          <Volume2 className="h-3.5 w-3.5" />
        </ToolBtn>

        {/* Color picker */}
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
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

        <div className="mx-0.5 h-4 w-px bg-border" />

        {/* Formatting */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito">
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico">
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Sublinhado">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Tachado">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista">
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Código">
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichEditor;
