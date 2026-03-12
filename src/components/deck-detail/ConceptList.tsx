/**
 * ConceptList — list of concepts with CRUD actions and card preview.
 */
import { useState, useMemo } from 'react';
import { BrainCircuit, Lightbulb, CheckCircle2, MoreVertical, Pencil, Trash2, Layers, ChevronDown, ChevronUp, Search, RotateCcw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useCards } from '@/hooks/useCards';
import { useConceptCards } from '@/hooks/useDeckConcepts';
import type { ConceptRow } from '@/services/conceptService';
import { mapCardState } from '@/types/domain';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConceptListProps {
  deckId: string;
  concepts: ConceptRow[];
  onRename: (conceptId: string, newName: string) => void;
  onDelete: (conceptId: string) => void;
  onEditCards: (conceptId: string) => void;
  onStudyConcept: (conceptId: string) => void;
}

type FilterType = 'all' | 'new' | 'learning' | 'mastered';

const stateLabel = (state: number) => {
  switch (state) {
    case 0: return { label: 'Novo', icon: Lightbulb, color: 'text-muted-foreground' };
    case 1: case 3: return { label: 'Aprendendo', icon: BrainCircuit, color: 'text-orange-500' };
    case 2: return { label: 'Dominado', icon: CheckCircle2, color: 'text-primary' };
    default: return { label: 'Novo', icon: Lightbulb, color: 'text-muted-foreground' };
  }
};

const ConceptList = ({ deckId, concepts, onRename, onDelete, onEditCards, onStudyConcept }: ConceptListProps) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const filtered = useMemo(() => {
    let result = concepts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }
    if (filter === 'new') result = result.filter(c => c.state === 0);
    else if (filter === 'learning') result = result.filter(c => c.state === 1 || c.state === 3);
    else if (filter === 'mastered') result = result.filter(c => c.state === 2);
    return result;
  }, [concepts, search, filter]);

  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <Network className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <h3 className="font-display text-base font-semibold text-foreground">Nenhum conceito</h3>
        <p className="mt-1 text-sm text-muted-foreground">Crie conceitos para agrupar seus cards por tema.</p>
      </div>
    );
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'new', label: 'Novos' },
    { key: 'learning', label: 'Aprendendo' },
    { key: 'mastered', label: 'Dominados' },
  ];

  return (
    <div className="space-y-3">
      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar conceito..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Concept items */}
      {filtered.map(concept => {
        const { label, icon: Icon, color } = stateLabel(concept.state);
        const isExpanded = expandedId === concept.id;
        const isDue = new Date(concept.scheduled_date) <= new Date() || concept.state === 0;

        return (
          <div key={concept.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : concept.id)}
            >
              <Icon className={`h-5 w-5 shrink-0 ${color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{concept.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Layers className="h-3 w-3" /> {concept.card_count ?? 0} cards
                  </span>
                  <span className={`text-[10px] font-medium ${color}`}>{label}</span>
                  {concept.last_reviewed_at && (
                    <span className="text-[10px] text-muted-foreground">
                      · {formatDistanceToNow(new Date(concept.last_reviewed_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isDue && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={(e) => { e.stopPropagation(); onStudyConcept(concept.id); }}
                  >
                    <RotateCcw className="h-3 w-3" /> Estudar
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setRenameDialog({ id: concept.id, name: concept.name }); setRenameName(concept.name); }}>
                      <Pencil className="h-4 w-4 mr-2" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditCards(concept.id)}>
                      <Layers className="h-4 w-4 mr-2" /> Editar cards
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialog(concept.id)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>

            {isExpanded && (
              <ConceptCardPreview conceptId={concept.id} deckId={deckId} />
            )}
          </div>
        );
      })}

      {/* Rename Dialog */}
      <Dialog open={!!renameDialog} onOpenChange={(o) => !o && setRenameDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear conceito</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="Nome do conceito"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (renameDialog && renameName.trim()) {
                  onRename(renameDialog.id, renameName.trim());
                  setRenameDialog(null);
                }
              }}
              disabled={!renameName.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir conceito?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Os cards vinculados não serão excluídos, apenas o agrupamento.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDialog) {
                  onDelete(deleteDialog);
                  setDeleteDialog(null);
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Shows cards linked to a concept (read-only preview) */
const ConceptCardPreview = ({ conceptId, deckId }: { conceptId: string; deckId: string }) => {
  const { data: cardIds = [], isLoading } = useConceptCards(conceptId);
  const { cards } = useCards(deckId);

  const linkedCards = useMemo(() => {
    const idSet = new Set(cardIds);
    return cards.filter((c: any) => idSet.has(c.id));
  }, [cards, cardIds]);

  if (isLoading) {
    return <div className="px-3 pb-3"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" /></div>;
  }

  if (linkedCards.length === 0) {
    return (
      <div className="px-3 pb-3">
        <p className="text-xs text-muted-foreground text-center py-2">Nenhum card vinculado</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 px-3 pb-3 pt-2 space-y-1.5 max-h-48 overflow-y-auto">
      {linkedCards.map((card: any) => {
        const stateInfo = mapCardState(card.state);
        return (
          <div key={card.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5">
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${
                stateInfo === 'new' ? 'bg-muted-foreground' :
                stateInfo === 'learning' || stateInfo === 'relearning' ? 'bg-orange-500' :
                'bg-primary'
              }`}
            />
            <p
              className="text-xs text-foreground truncate flex-1"
              dangerouslySetInnerHTML={{ __html: card.front_content?.replace(/<[^>]*>/g, '').slice(0, 80) || '(sem conteúdo)' }}
            />
          </div>
        );
      })}
    </div>
  );
};

export default ConceptList;
