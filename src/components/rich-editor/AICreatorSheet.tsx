/**
 * AICreatorSheet — Manage AI prompt templates for card generation.
 * User saves templates (name + prompt), then clicks "Gerar" to create card content.
 * Templates are stored in localStorage.
 */

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, ArrowLeft, Sparkles, HelpCircle, Loader2 } from 'lucide-react';

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
const GradientSparkle = ({ className = 'h-5 w-5' }: { className?: string }) => (
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
const TemplateChip = ({ template, onClick, selected }: { template: AITemplate; onClick: () => void; selected?: boolean }) => (
  <button
    onClick={onClick}
    className={`relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
      selected ? 'text-foreground' : 'text-foreground/80 hover:text-foreground'
    }`}
  >
    {/* Gradient border */}
    <span className="absolute inset-0 rounded-full p-[1.5px]" style={{
      background: 'linear-gradient(135deg, #00B3FF 0%, #3347FF 33%, #FF306B 66%, #FF9B23 100%)',
    }}>
      <span className="block h-full w-full rounded-full bg-card" />
    </span>
    <span className="relative z-10 truncate max-w-[200px] block">{template.name}</span>
  </button>
);

type View = 'list' | 'add' | 'detail';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGenerate: (templatePrompt: string) => void;
  isGenerating?: boolean;
}

export default function AICreatorSheet({ open, onOpenChange, onGenerate, isGenerating = false }: Props) {
  const [templates, setTemplates] = useState<AITemplate[]>(loadTemplates);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Sync localStorage
  useEffect(() => { saveTemplates(templates); }, [templates]);

  // Reset on close
  useEffect(() => { if (!open) { setView('list'); setSelectedId(null); setNewName(''); setNewPrompt(''); setShowHelp(false); } }, [open]);

  const selectedTemplate = templates.find(t => t.id === selectedId);

  const handleAdd = () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    const tpl: AITemplate = { id: crypto.randomUUID(), name: newName.trim(), prompt: newPrompt.trim() };
    setTemplates(prev => [...prev, tpl]);
    setNewName('');
    setNewPrompt('');
    setView('list');
  };

  const handleDelete = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    setView('list');
    setSelectedId(null);
  };

  const handleGenerate = () => {
    if (!selectedTemplate) return;
    onGenerate(selectedTemplate.prompt);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center justify-center gap-2">
            {view !== 'list' && (
              <button onClick={() => { setView('list'); setSelectedId(null); }} className="absolute left-4">
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            {view === 'list' && (
              <button onClick={() => setShowHelp(h => !h)} className="absolute left-4">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            <GradientSparkle className="h-5 w-5" />
            <span>Criador de IA</span>
          </SheetTitle>
        </SheetHeader>

        {/* Help */}
        {showHelp && view === 'list' && (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">Como funciona o criador de IA?</p>
            <p>Crie <strong>modelos</strong> (templates) com instruções de como a IA deve gerar seus cartões. Por exemplo:</p>
            <div className="rounded-lg bg-card border border-border p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">Exemplo de modelo: "Palavra/Definição"</p>
              <p className="text-muted-foreground italic">Use a palavra da frente e gere:<br/>Frente — A própria palavra<br/>Verso — Uma definição clara e 2 exemplos de uso</p>
            </div>
            <p>Depois, basta digitar uma palavra na frente do cartão, selecionar o modelo e clicar <strong>Gerar</strong>.</p>
          </div>
        )}

        {/* List view */}
        {view === 'list' && (
          <div className="space-y-4 pb-4">
            {templates.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Seu modelo</p>
                <div className="flex flex-wrap items-center gap-2">
                  {templates.map(tpl => (
                    <TemplateChip
                      key={tpl.id}
                      template={tpl}
                      selected={selectedId === tpl.id}
                      onClick={() => { setSelectedId(tpl.id); setView('detail'); }}
                    />
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setView('add'); setNewName(''); setNewPrompt(''); }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              + Adicionar
            </button>

            {templates.length === 0 && !showHelp && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum modelo criado.<br/>Toque em <strong>+ Adicionar</strong> para começar.
              </p>
            )}
          </div>
        )}

        {/* Add view */}
        {view === 'add' && (
          <div className="space-y-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Novo comando</p>

            <Input
              placeholder="Nome do modelo"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="bg-muted/30"
            />

            <Textarea
              placeholder={`ex.\nUse a palavra da frente e gere o seguinte cartão:\n\nFrente\n— A própria palavra\n\nVerso\n— Tradução para o espanhol\n— 2 exemplos de uso`}
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
              rows={8}
              className="bg-primary/5 border-primary/20 text-sm"
            />

            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || !newPrompt.trim()}
              className="w-full h-12 rounded-xl text-base font-semibold"
            >
              Salvar
            </Button>
          </div>
        )}

        {/* Detail view */}
        {view === 'detail' && selectedTemplate && (
          <div className="space-y-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detalhes do comando</p>

            <div className="rounded-xl bg-muted/30 border border-border p-3">
              <p className="font-semibold text-foreground text-sm">{selectedTemplate.name}</p>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm whitespace-pre-wrap text-foreground/80">
              {selectedTemplate.prompt}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex-1 h-12 rounded-xl text-base font-semibold gap-2"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGenerating ? 'Gerando...' : 'Gerar'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                onClick={() => handleDelete(selectedTemplate.id)}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
