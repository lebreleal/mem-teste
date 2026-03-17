/**
 * AICreatorSheet — Manage AI prompt templates for card generation.
 * Two-level UI:
 *   1. Inline row (rendered inside RichEditor toolbar area) with template chips + "+ Adicionar" + gear
 *   2. Sheet (opened by gear or "+ Adicionar") for creating/editing/deleting templates
 */

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, ArrowLeft, Sparkles, HelpCircle, Loader2, Settings } from 'lucide-react';

export interface AITemplate {
  id: string;
  name: string;
  prompt: string;
}

const STORAGE_KEY = 'ai-creator-templates';

function loadTemplates(): AITemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
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

/* ─── Template Chip (gradient border) ─── */
const TemplateChip = ({ template, onClick, selected }: { template: AITemplate; onClick: () => void; selected?: boolean }) => (
  <button
    onClick={onClick}
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

/* ─── Inline Row: template chips + add + gear ─── */
interface InlineProps {
  onGenerate: (templatePrompt: string) => void;
  isGenerating?: boolean;
}

export function AICreatorInlineRow({ onGenerate, isGenerating = false }: InlineProps) {
  const [templates, setTemplates] = useState<AITemplate[]>(loadTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'add' | 'detail'>('add');
  const [editingTemplate, setEditingTemplate] = useState<AITemplate | null>(null);

  // Reload templates when sheet closes
  useEffect(() => { if (!sheetOpen) setTemplates(loadTemplates()); }, [sheetOpen]);

  const handleChipClick = useCallback((tpl: AITemplate) => {
    if (selectedId === tpl.id) {
      // Already selected → generate
      onGenerate(tpl.prompt);
    } else {
      setSelectedId(tpl.id);
    }
  }, [selectedId, onGenerate]);

  const handleGearClick = () => {
    if (selectedId) {
      const tpl = templates.find(t => t.id === selectedId);
      if (tpl) {
        setEditingTemplate(tpl);
        setSheetMode('detail');
        setSheetOpen(true);
        return;
      }
    }
    // No selection → open add
    setSheetMode('add');
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
          />
        ))}
        <button
          onClick={() => { setSheetMode('add'); setEditingTemplate(null); setSheetOpen(true); }}
          className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          + Adicionar
        </button>
        <button
          onClick={handleGearClick}
          className="shrink-0 ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Configurações"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Generate button when a template is selected */}
      {selectedId && (
        <div className="flex items-center gap-2 px-2 pb-1.5">
          <Button
            onClick={() => { const tpl = templates.find(t => t.id === selectedId); if (tpl) onGenerate(tpl.prompt); }}
            disabled={isGenerating}
            size="sm"
            className="flex-1 h-8 rounded-lg text-xs font-semibold gap-1.5"
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

/* ─── Sheet Modal for Add/Edit/Delete ─── */

type SheetMode = 'add' | 'detail';

interface SheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: SheetMode;
  editingTemplate: AITemplate | null;
  onGenerate: (prompt: string) => void;
  isGenerating?: boolean;
}

function AICreatorSheetModal({ open, onOpenChange, mode, editingTemplate, onGenerate, isGenerating = false }: SheetProps) {
  const [templates, setTemplates] = useState<AITemplate[]>(loadTemplates);
  const [view, setView] = useState<SheetMode>(mode);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => { setTemplates(loadTemplates()); }, [open]);
  useEffect(() => {
    if (open) {
      setView(mode);
      if (mode === 'detail' && editingTemplate) {
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
    if (view === 'detail' && editingTemplate) {
      // Update existing
      const updated = templates.map(t => t.id === editingTemplate.id ? { ...t, name: name.trim(), prompt: prompt.trim() } : t);
      saveTemplates(updated);
      setTemplates(updated);
    } else {
      // Add new
      const tpl: AITemplate = { id: crypto.randomUUID(), name: name.trim(), prompt: prompt.trim() };
      const updated = [...templates, tpl];
      saveTemplates(updated);
      setTemplates(updated);
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!editingTemplate) return;
    const updated = templates.filter(t => t.id !== editingTemplate.id);
    saveTemplates(updated);
    setTemplates(updated);
    onOpenChange(false);
  };

  const handleGenerate = () => {
    if (editingTemplate) onGenerate(editingTemplate.prompt);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center justify-center gap-2">
            <GradientSparkle className="h-5 w-5" />
            <span>Criador de IA</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {view === 'detail' ? 'Detalhes do comando' : 'Novo comando'}
          </p>

          <Input
            placeholder="Nome do modelo (ex: Palavra/Definição)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-muted/30"
          />

          <Textarea
            placeholder={`ex.\nUse a palavra da frente e gere:\n\nFrente\n— A própria palavra\n\nVerso\n— Tradução para o espanhol\n— 2 exemplos de uso`}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={8}
            className="bg-primary/5 border-primary/20 text-sm"
          />

          {view === 'detail' && editingTemplate && (
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  // "Melhorar comando" — placeholder for future AI improvement
                  // For now just focus the textarea
                }}
              >
                Melhorar comando
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            {view === 'detail' && editingTemplate ? (
              <>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 h-12 rounded-xl text-base font-semibold gap-2"
                  style={{ background: 'linear-gradient(135deg, #00B3FF 0%, #3347FF 33%, #FF306B 66%, #FF9B23 100%)' }}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isGenerating ? 'Gerando...' : 'Gerar'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button
                onClick={handleSave}
                disabled={!name.trim() || !prompt.trim()}
                className="w-full h-12 rounded-xl text-base font-semibold"
              >
                Salvar
              </Button>
            )}
          </div>

          {view === 'detail' && editingTemplate && (
            <Button
              variant="ghost"
              onClick={handleSave}
              disabled={!name.trim() || !prompt.trim()}
              className="w-full text-sm text-muted-foreground"
            >
              Salvar alterações
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Legacy default export (kept for backward compat) ─── */
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
