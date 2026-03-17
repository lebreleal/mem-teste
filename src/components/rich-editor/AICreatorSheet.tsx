/**
 * AICreatorSheet — AI prompt templates for card generation.
 *
 * Inline row shows template chips. Tap a chip → "Gerar" button appears.
 * "+ Adicionar" opens a sheet that ALSO lists existing templates (edit/delete).
 * Long-press a chip → opens edit for that specific template.
 *
 * Ships with useful pre-built templates so the user can generate immediately.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Sparkles, Loader2, PenLine, Plus, ChevronRight } from 'lucide-react';

export interface AITemplate {
  id: string;
  name: string;
  prompt: string;
}

const STORAGE_KEY = 'ai-creator-templates-v2';

/* ─── Default templates ─── */
const DEFAULT_TEMPLATES: AITemplate[] = [
  {
    id: 'default-definicao',
    name: 'Definição',
    prompt: `Com base no texto da frente, gere um flashcard assim:

Frente: O próprio termo ou conceito
Verso: Uma definição clara, direta e completa (mínimo 2 frases)

Use linguagem simples. Não invente informações.`,
  },
  {
    id: 'default-cloze',
    name: 'Cloze',
    prompt: `Com base no texto da frente, transforme em um cartão Cloze.

Use o formato {{c1::resposta}} para ocultar as partes mais importantes.
Mantenha contexto suficiente ao redor (mínimo 15 palavras no total).
Use índices incrementais (c1, c2, c3...) se houver mais de uma lacuna.

Deixe o verso vazio (o cloze já contém a resposta).`,
  },
  {
    id: 'default-explicacao',
    name: 'Explique fácil',
    prompt: `Com base no texto da frente, gere um flashcard assim:

Frente: Uma pergunta simples sobre o conceito
Verso: Uma explicação extremamente simples, como se estivesse explicando para uma criança de 5 anos. Use analogias do dia a dia e linguagem coloquial.`,
  },
  {
    id: 'default-exemplo',
    name: 'Exemplo prático',
    prompt: `Com base no texto da frente, gere um flashcard assim:

Frente: O conceito ou termo
Verso: 2-3 exemplos práticos e concretos que ilustrem o conceito no mundo real. Cada exemplo deve ser curto (1 frase).

Use linguagem simples e direta.`,
  },
];

function loadTemplates(): AITemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TEMPLATES));
      return [...DEFAULT_TEMPLATES];
    }
    const parsed = JSON.parse(stored);
    return parsed.length > 0 ? parsed : [...DEFAULT_TEMPLATES];
  } catch { return [...DEFAULT_TEMPLATES]; }
}

function saveTemplates(templates: AITemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/* ─── Gradient Sparkle Icon ─── */
export const GradientSparkle = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <path fill="url(#ai_creator_grad)" fillRule="evenodd" d="m6.894 3.787.29.58a1 1 0 0 0 .447.447l.58.29a1 1 0 0 1 0 1.789l-.58.29a1 1 0 0 0-.447.447l-.29.58a1 1 0 0 1-1.788 0l-.29-.58a1 1 0 0 0-.447-.447l-.58-.29a1 1 0 0 1 0-1.79l.58-.289a1 1 0 0 0 .447-.447l.29-.58a1 1 0 0 1 1.788 0m7.5 1.764a1 1 0 0 0-1.788 0l-1.058 2.115a7 7 0 0 1-3.13 3.13l-2.115 1.058a1 1 0 0 0 0 1.789L8.418 14.7a7 7 0 0 1 3.13 3.13l1.058 2.116a1 1 0 0 0 1.788 0l1.058-2.115a7 7 0 0 1 3.13-3.13l2.115-1.058a1 1 0 0 0 0-1.79l-2.115-1.057a7 7 0 0 1-3.13-3.13zm-1.057 3.01.163-.327.163.326a9 9 0 0 0 4.025 4.025l.326.163-.326.163a9 9 0 0 0-4.025 4.025l-.163.326-.163-.326a9 9 0 0 0-4.025-4.025l-.326-.163.326-.163a9 9 0 0 0 4.025-4.025" clipRule="evenodd" />
    <defs>
      <linearGradient id="ai_creator_grad" x1="3.236" x2="22.601" y1="3.234" y2="4.913" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00B3FF" /><stop offset="0.33" stopColor="#3347FF" /><stop offset="0.66" stopColor="#FF306B" /><stop offset="1" stopColor="#FF9B23" />
      </linearGradient>
    </defs>
  </svg>
);

const AI_GRADIENT = 'linear-gradient(135deg, #00B3FF 0%, #3347FF 33%, #FF306B 66%, #FF9B23 100%)';

/* ─── Template Chip ─── */
const TemplateChip = ({ template, onClick, selected, onLongPress }: {
  template: AITemplate; onClick: () => void; selected?: boolean; onLongPress?: () => void;
}) => {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  return (
    <button
      onClick={() => { if (!didLongPress.current) onClick(); }}
      onPointerDown={() => {
        didLongPress.current = false;
        if (onLongPress) {
          pressTimer.current = setTimeout(() => { didLongPress.current = true; onLongPress(); }, 500);
        }
      }}
      onPointerUp={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }}
      onPointerLeave={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }}
      className="relative rounded-full shrink-0 h-8 flex items-center"
    >
      {/* Gradient or plain border */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          padding: '1.5px',
          background: selected ? AI_GRADIENT : 'hsl(var(--border))',
        }}
      >
        <span className="block h-full w-full rounded-full bg-card" />
      </span>
      <span className={`relative z-10 px-3.5 text-[13px] font-medium truncate max-w-[200px] transition-colors ${
        selected ? 'text-foreground' : 'text-foreground/70'
      }`}>
        {template.name}
      </span>
    </button>
  );
};

/* ─── Inline Row (rendered inside RichEditor toolbar area) ─── */
interface InlineProps {
  onGenerate: (templatePrompt: string) => void;
  isGenerating?: boolean;
}

export function AICreatorInlineRow({ onGenerate, isGenerating = false }: InlineProps) {
  const [templates, setTemplates] = useState<AITemplate[]>(loadTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AITemplate | null>(null);

  // Refresh when sheet closes
  useEffect(() => { if (!sheetOpen) { setTemplates(loadTemplates()); setEditingTemplate(null); } }, [sheetOpen]);

  const handleChipClick = useCallback((tpl: AITemplate) => {
    setSelectedId(prev => prev === tpl.id ? null : tpl.id);
  }, []);

  const openEditFor = (tpl: AITemplate) => {
    setEditingTemplate(tpl);
    setSheetOpen(true);
  };

  const handleGenerate = () => {
    const tpl = templates.find(t => t.id === selectedId);
    if (tpl) onGenerate(tpl.prompt);
  };

  return (
    <>
      {/* Chips row */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-2 py-2 border-t border-border/40">
        {templates.map(tpl => (
          <TemplateChip
            key={tpl.id}
            template={tpl}
            selected={selectedId === tpl.id}
            onClick={() => handleChipClick(tpl)}
            onLongPress={() => openEditFor(tpl)}
          />
        ))}

        {/* + Adicionar */}
        <button
          onClick={() => { setEditingTemplate(null); setSheetOpen(true); }}
          className="shrink-0 rounded-full h-8 px-3.5 border border-dashed border-border text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Editar
        </button>
      </div>

      {/* Generate button — only when a template is selected */}
      {selectedId && (
        <div className="px-2 pb-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            size="sm"
            className="w-full h-9 rounded-xl text-xs font-bold gap-1.5 text-white border-0 shadow-md"
            style={{ background: AI_GRADIENT }}
          >
            {isGenerating
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</>
              : <><Sparkles className="h-3.5 w-3.5" /> Gerar com IA</>
            }
          </Button>
        </div>
      )}

      {/* Management Sheet */}
      <AIManagerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialEditing={editingTemplate}
        onGenerate={onGenerate}
        isGenerating={isGenerating}
      />
    </>
  );
}

/* ─── Manager Sheet: list all templates + create/edit/delete ─── */

function AIManagerSheet({ open, onOpenChange, initialEditing, onGenerate, isGenerating }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialEditing: AITemplate | null;
  onGenerate: (prompt: string) => void;
  isGenerating?: boolean;
}) {
  const [templates, setTemplates] = useState<AITemplate[]>(loadTemplates);
  const [editing, setEditing] = useState<AITemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  // When opening, refresh and optionally go to edit mode
  useEffect(() => {
    if (open) {
      setTemplates(loadTemplates());
      if (initialEditing) {
        setEditing(initialEditing);
        setIsNew(false);
        setName(initialEditing.name);
        setPrompt(initialEditing.prompt);
      } else {
        setEditing(null);
        setIsNew(false);
        setName('');
        setPrompt('');
      }
    }
  }, [open, initialEditing]);

  const startNew = () => {
    setEditing(null);
    setIsNew(true);
    setName('');
    setPrompt('');
  };

  const startEdit = (tpl: AITemplate) => {
    setEditing(tpl);
    setIsNew(false);
    setName(tpl.name);
    setPrompt(tpl.prompt);
  };

  const goBack = () => {
    setEditing(null);
    setIsNew(false);
    setName('');
    setPrompt('');
  };

  const handleSave = () => {
    if (!name.trim() || !prompt.trim()) return;
    const all = loadTemplates();
    if (editing) {
      const updated = all.map(t => t.id === editing.id ? { ...t, name: name.trim(), prompt: prompt.trim() } : t);
      saveTemplates(updated);
    } else {
      saveTemplates([...all, { id: crypto.randomUUID(), name: name.trim(), prompt: prompt.trim() }]);
    }
    setTemplates(loadTemplates());
    goBack();
  };

  const handleDelete = () => {
    if (!editing) return;
    saveTemplates(loadTemplates().filter(t => t.id !== editing.id));
    setTemplates(loadTemplates());
    goBack();
  };

  const showForm = editing || isNew;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center justify-center gap-2 text-base">
            <GradientSparkle className="h-5 w-5" />
            {showForm
              ? (editing ? 'Editar comando' : 'Novo comando')
              : 'Comandos IA'
            }
          </SheetTitle>
          {!showForm && (
            <p className="text-xs text-muted-foreground text-center -mt-1">
              Escolha um comando, escreva o assunto na frente e clique <b>Gerar</b>. A IA preenche o cartão pra você ✨
            </p>
          )}
        </SheetHeader>

        {showForm ? (
          /* ── Edit / Create form ── */
          <div className="space-y-3 pb-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome</label>
              <Input
                placeholder="ex: Definição, Vocabulário, Resumo..."
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-muted/30 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Instrução para a IA
              </label>
              <Textarea
                placeholder={`Descreva o que a IA deve gerar.\n\nExemplo:\n"Gere um flashcard com:\nFrente → O termo\nVerso → Definição + 2 exemplos"`}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={6}
                className="bg-muted/20 border-border text-sm leading-relaxed"
              />
            </div>

            <div className="flex gap-2 pt-1">
              {editing ? (
                <>
                  <Button variant="outline" onClick={goBack} className="h-10 rounded-xl text-sm px-4">
                    Voltar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!name.trim() || !prompt.trim()}
                    className="flex-1 h-10 rounded-xl text-sm font-semibold"
                  >
                    Salvar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={goBack} className="h-10 rounded-xl text-sm px-4">
                    Voltar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!name.trim() || !prompt.trim()}
                    className="flex-1 h-10 rounded-xl text-sm font-semibold"
                  >
                    Criar comando
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* ── Template list ── */
          <div className="space-y-1.5 pb-4">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => startEdit(tpl)}
                className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card hover:bg-muted/40 px-3.5 py-3 transition-colors text-left group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tpl.name}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {tpl.prompt.slice(0, 80)}...
                  </p>
                </div>
                <PenLine className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
              </button>
            ))}

            {/* New template button */}
            <button
              onClick={startNew}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3.5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors mt-2"
            >
              <Plus className="h-4 w-4" /> Criar novo comando
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─── Legacy default export ─── */
export default function AICreatorSheet({ open, onOpenChange, onGenerate, isGenerating = false }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGenerate: (templatePrompt: string) => void;
  isGenerating?: boolean;
}) {
  return (
    <AIManagerSheet
      open={open}
      onOpenChange={onOpenChange}
      initialEditing={null}
      onGenerate={onGenerate}
      isGenerating={isGenerating}
    />
  );
}
