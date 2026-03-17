/**
 * AICreatorSheet — AI prompt templates for card generation.
 * 
 * Two-level UI:
 *   1. Inline row (inside toolbar) → template chips + "+ Adicionar" + ⚙️
 *   2. Sheet (⚙️ or chip long-press) → edit/delete/create templates
 *
 * Ships with sensible pre-built templates so new users can generate immediately.
 */

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Sparkles, Loader2, Settings, X } from 'lucide-react';

export interface AITemplate {
  id: string;
  name: string;
  prompt: string;
}

const STORAGE_KEY = 'ai-creator-templates-v2';

/* ─── Default templates (seeded on first use) ─── */
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
    name: 'Explique como se eu tivesse 5 anos',
    prompt: `Com base no texto da frente, gere um flashcard assim:

Frente: Uma pergunta simples sobre o conceito
Verso: Uma explicação extremamente simples, como se estivesse explicando para uma criança de 5 anos. Use analogias do dia a dia e linguagem coloquial.`,
  },
];

function loadTemplates(): AITemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // First time → seed defaults
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

/* ─── Template Chip ─── */
const TemplateChip = ({ template, onClick, selected, onLongPress }: {
  template: AITemplate; onClick: () => void; selected?: boolean; onLongPress?: () => void;
}) => {
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  return (
    <button
      onClick={onClick}
      onPointerDown={() => {
        if (onLongPress) {
          const timer = setTimeout(() => onLongPress(), 500);
          setPressTimer(timer);
        }
      }}
      onPointerUp={() => { if (pressTimer) { clearTimeout(pressTimer); setPressTimer(null); } }}
      onPointerLeave={() => { if (pressTimer) { clearTimeout(pressTimer); setPressTimer(null); } }}
      className={`relative rounded-full px-3 py-1 text-xs font-medium transition-all shrink-0 ${
        selected ? 'text-foreground' : 'text-foreground/80 hover:text-foreground'
      }`}
    >
      <span className="absolute inset-0 rounded-full p-[1.5px]" style={{
        background: selected
          ? 'linear-gradient(135deg, #00B3FF 0%, #3347FF 33%, #FF306B 66%, #FF9B23 100%)'
          : 'hsl(var(--border))',
      }}>
        <span className="block h-full w-full rounded-full bg-card" />
      </span>
      <span className="relative z-10 truncate max-w-[180px] block">{template.name}</span>
    </button>
  );
};

/* ─── Inline Row ─── */
interface InlineProps {
  onGenerate: (templatePrompt: string) => void;
  isGenerating?: boolean;
}

export function AICreatorInlineRow({ onGenerate, isGenerating = false }: InlineProps) {
  const [templates, setTemplates] = useState<AITemplate[]>(loadTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'add' | 'edit'>('add');
  const [editingTemplate, setEditingTemplate] = useState<AITemplate | null>(null);

  useEffect(() => { if (!sheetOpen) setTemplates(loadTemplates()); }, [sheetOpen]);

  const handleChipClick = useCallback((tpl: AITemplate) => {
    setSelectedId(prev => prev === tpl.id ? null : tpl.id);
  }, []);

  const openEdit = (tpl: AITemplate) => {
    setEditingTemplate(tpl);
    setSheetMode('edit');
    setSheetOpen(true);
  };

  return (
    <>
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-2 py-1.5 border-t border-border/50">
        {templates.map(tpl => (
          <TemplateChip
            key={tpl.id}
            template={tpl}
            selected={selectedId === tpl.id}
            onClick={() => handleChipClick(tpl)}
            onLongPress={() => openEdit(tpl)}
          />
        ))}
        <button
          onClick={() => { setSheetMode('add'); setEditingTemplate(null); setSheetOpen(true); }}
          className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          + Adicionar
        </button>
        <button
          onClick={() => {
            const tpl = selectedId ? templates.find(t => t.id === selectedId) : null;
            if (tpl) { openEdit(tpl); } else { setSheetMode('add'); setEditingTemplate(null); setSheetOpen(true); }
          }}
          className="shrink-0 ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Configurações"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Generate bar */}
      {selectedId && (
        <div className="flex items-center gap-2 px-2 pb-1.5">
          <Button
            onClick={() => { const tpl = templates.find(t => t.id === selectedId); if (tpl) onGenerate(tpl.prompt); }}
            disabled={isGenerating}
            size="sm"
            className="flex-1 h-8 rounded-lg text-xs font-semibold gap-1.5 text-white border-0"
            style={{ background: 'linear-gradient(135deg, #00B3FF 0%, #3347FF 33%, #FF306B 66%, #FF9B23 100%)' }}
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isGenerating ? 'Gerando...' : 'Gerar'}
          </Button>
        </div>
      )}

      <AICreatorSheetModal
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        editingTemplate={editingTemplate}
        onGenerate={onGenerate}
        isGenerating={isGenerating}
      />
    </>
  );
}

/* ─── Sheet Modal ─── */

interface SheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'add' | 'edit';
  editingTemplate: AITemplate | null;
  onGenerate: (prompt: string) => void;
  isGenerating?: boolean;
}

function AICreatorSheetModal({ open, onOpenChange, mode, editingTemplate, onGenerate, isGenerating = false }: SheetProps) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && editingTemplate) {
        setName(editingTemplate.name);
        setPrompt(editingTemplate.prompt);
      } else {
        setName('');
        setPrompt('');
      }
    }
  }, [open, mode, editingTemplate]);

  const handleSave = () => {
    if (!name.trim() || !prompt.trim()) return;
    const templates = loadTemplates();
    if (mode === 'edit' && editingTemplate) {
      const updated = templates.map(t => t.id === editingTemplate.id ? { ...t, name: name.trim(), prompt: prompt.trim() } : t);
      saveTemplates(updated);
    } else {
      saveTemplates([...templates, { id: crypto.randomUUID(), name: name.trim(), prompt: prompt.trim() }]);
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!editingTemplate) return;
    saveTemplates(loadTemplates().filter(t => t.id !== editingTemplate.id));
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center justify-center gap-2 text-base">
            <GradientSparkle className="h-5 w-5" />
            {mode === 'edit' ? 'Editar modelo' : 'Novo modelo'}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3 pb-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome curto</label>
            <Input
              placeholder="ex: Definição, Cloze Médico, Vocabulário..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-muted/30 text-sm"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              O que a IA deve fazer?
            </label>
            <Textarea
              placeholder={`Escreva aqui as instruções para a IA. Exemplo:\n\n"Pegue o texto da frente e gere:\n\nFrente → O termo principal\nVerso → Definição + 2 exemplos práticos"\n\nQuanto mais claro, melhor o resultado!`}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={7}
              className="bg-muted/20 border-border text-sm leading-relaxed"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              💡 Dica: escreva na frente do cartão o assunto, selecione um modelo e clique Gerar.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {mode === 'edit' ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={!name.trim() || !prompt.trim()}
                  className="flex-1 h-11 rounded-xl text-sm font-semibold"
                >
                  Salvar alterações
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                onClick={handleSave}
                disabled={!name.trim() || !prompt.trim()}
                className="w-full h-11 rounded-xl text-sm font-semibold"
              >
                Salvar modelo
              </Button>
            )}
          </div>
        </div>
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
    <AICreatorSheetModal
      open={open}
      onOpenChange={onOpenChange}
      mode="add"
      editingTemplate={null}
      onGenerate={onGenerate}
      isGenerating={isGenerating}
    />
  );
}
