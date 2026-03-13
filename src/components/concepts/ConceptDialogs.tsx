import type { GlobalConcept } from '@/services/globalConceptService';
import { MEDICAL_CATEGORIES, CATEGORY_SUBCATEGORIES, linkQuestionsToConcepts } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link2, Plus, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

/* ─── Edit Dialog ─── */
interface EditDialogProps {
  concept: GlobalConcept | null;
  onClose: () => void;
  onSave: (name: string, category: string | null, subcategory: string | null) => Promise<void>;
  isPending: boolean;
}

export const EditConceptDialog = ({ concept, onClose, onSave, isPending }: EditDialogProps) => {
  const [name, setName] = useState(concept?.name ?? '');
  const [category, setCategory] = useState(concept?.category ?? '');
  const [subcategory, setSubcategory] = useState(concept?.subcategory ?? '');

  // Reset when concept changes
  if (concept && name === '' && concept.name) {
    setName(concept.name);
    setCategory(concept.category ?? '');
    setSubcategory(concept.subcategory ?? '');
  }

  return (
    <Dialog open={!!concept} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar conceito</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Grande Área</label>
            <Select value={category || '__none__'} onValueChange={v => { setCategory(v === '__none__' ? '' : v); setSubcategory(''); }}>
              <SelectTrigger><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {MEDICAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {category && CATEGORY_SUBCATEGORIES[category] && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Especialidade</label>
              <Select value={subcategory || '__none__'} onValueChange={v => setSubcategory(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Geral</SelectItem>
                  {CATEGORY_SUBCATEGORIES[category].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(name.trim(), category || null, subcategory || null)} disabled={!name.trim() || isPending}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Delete Confirm ─── */
interface DeleteDialogProps {
  open: boolean;
  onClose: () => void;
  target: GlobalConcept | null;
  selectedCount: number;
  onConfirm: () => void;
  isPending: boolean;
}

export const DeleteConceptDialog = ({ open, onClose, target, selectedCount, onConfirm, isPending }: DeleteDialogProps) => (
  <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Excluir {target ? 'conceito' : `${selectedCount} conceitos`}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        {target ? (
          <>Tem certeza que deseja excluir <span className="font-semibold text-foreground">"{target.name}"</span>?</>
        ) : (
          <>Tem certeza que deseja excluir <span className="font-semibold text-foreground">{selectedCount} conceitos</span> selecionados?</>
        )}
        {' '}Os vínculos com questões serão removidos, mas as questões não serão afetadas.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? 'Excluindo...' : 'Excluir'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/* ─── Questions Sheet ─── */
interface QuestionsSheetProps {
  conceptId: string | null;
  questions: { id: string; questionText: string; deckId: string; deckName?: string }[];
  loading: boolean;
  onClose: () => void;
  onUnlink: (questionId: string) => void;
  onAddConcept: (questionId: string) => void;
}

export const QuestionsSheet = ({ conceptId, questions, loading, onClose, onUnlink, onAddConcept }: QuestionsSheetProps) => (
  <Sheet open={!!conceptId} onOpenChange={o => { if (!o) onClose(); }}>
    <SheetContent side="bottom" className="max-h-[70vh]">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Questões vinculadas
        </SheetTitle>
      </SheetHeader>
      <ScrollArea className="mt-3 max-h-[50vh]">
        {loading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : questions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma questão vinculada.</p>
        ) : (
          <div className="space-y-2 p-1">
            {questions.map(q => (
              <div key={q.id} className="flex items-start gap-2 rounded-lg border border-border/50 bg-card p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground line-clamp-2">{q.questionText}</p>
                  {q.deckName && <p className="text-[10px] text-muted-foreground mt-0.5">Baralho: {q.deckName}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" title="Adicionar conceito" onClick={() => onAddConcept(q.id)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" title="Desvincular" onClick={() => onUnlink(q.id)}>
                  <Unlink className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </SheetContent>
  </Sheet>
);

/* ─── Add Concept to Question Dialog ─── */
interface AddConceptDialogProps {
  open: boolean;
  questionId: string | null;
  onClose: () => void;
}

export const AddConceptDialog = ({ open, questionId, onClose }: AddConceptDialogProps) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !questionId || !name.trim()) return;
    setSaving(true);
    try {
      await linkQuestionsToConcepts(user.id, [{
        questionId,
        conceptNames: [name.trim()],
        category: category || undefined,
        subcategory: subcategory || undefined,
      }]);
      toast.success(`Conceito "${name.trim()}" vinculado`);
      onClose();
    } catch { toast.error('Erro ao vincular conceito'); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular conceito à questão</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Adicione esta questão a um conceito adicional (ex: uma questão de Clínica Médica que também serve para Oftalmologia).
        </p>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do conceito</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Hipertensão intracraniana" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Grande Área (opcional)</label>
            <Select value={category || '__none__'} onValueChange={v => { setCategory(v === '__none__' ? '' : v); setSubcategory(''); }}>
              <SelectTrigger><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {MEDICAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {category && CATEGORY_SUBCATEGORIES[category] && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Especialidade</label>
              <Select value={subcategory || '__none__'} onValueChange={v => setSubcategory(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Geral</SelectItem>
                  {CATEGORY_SUBCATEGORIES[category].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Vinculando...' : 'Vincular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
