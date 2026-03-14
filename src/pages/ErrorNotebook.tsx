/**
 * ErrorNotebook — Shows cards in the error deck.
 * Cards move here when the user fails them (rating=1).
 * They return to their origin deck when mastered (state=2).
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft, BookX, CheckCircle2, PlayCircle,
  Loader2, Trash2, Undo2, FolderOpen,
} from 'lucide-react';
import {
  getErrorDeckCards, getErrorDeckId, returnCardsToOrigin, deleteErrorCards,
  type ErrorDeckCard,
} from '@/services/errorDeckService';
import { useToast } from '@/hooks/use-toast';
import ErrorDetailSheet from '@/components/error-notebook/ErrorDetailSheet';

type FilterTab = 'all' | 'due' | 'learning' | 'mastered';

const STATE_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'Novo', className: 'bg-muted text-muted-foreground' },
  1: { label: 'Aprendendo', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  2: { label: 'Dominado', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  3: { label: 'Reaprendendo', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'due', label: 'Para Revisar' },
  { key: 'learning', label: 'Aprendendo' },
  { key: 'mastered', label: 'Dominados' },
];

// ─── Card Row ───
const CardRow = ({
  card, selected, selectionMode, onToggle, onTap,
}: {
  card: ErrorDeckCard;
  selected: boolean;
  selectionMode: boolean;
  onToggle: () => void;
  onTap: () => void;
}) => {
  const stateInfo = STATE_LABELS[card.state] ?? STATE_LABELS[0];
  const frontText = card.front_content.replace(/<[^>]+>/g, '').slice(0, 120);

  return (
    <div
      onClick={selectionMode ? onToggle : onTap}
      className={`rounded-xl border bg-card px-4 py-3 space-y-2 cursor-pointer transition-colors ${
        selected ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-2">
        {selectionMode && (
          <Checkbox checked={selected} onCheckedChange={onToggle} onClick={e => e.stopPropagation()} />
        )}
        <span className="text-sm font-medium truncate flex-1">{frontText || '(card vazio)'}</span>
        <Badge variant="outline" className={`text-[10px] shrink-0 ${stateInfo.className}`}>
          {stateInfo.label}
        </Badge>
      </div>
      {card.origin_deck_name && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FolderOpen className="h-3 w-3" />
          <span className="truncate">{card.origin_deck_name}</span>
        </div>
      )}
    </div>
  );
};

// ─── Main Page ───
const ErrorNotebook = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailCard, setDetailCard] = useState<ErrorDeckCard | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['error-deck-cards', user?.id],
    queryFn: () => getErrorDeckCards(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: errorDeckId = null } = useQuery({
    queryKey: ['error-deck-id', user?.id],
    queryFn: () => getErrorDeckId(user!.id),
    enabled: !!user,
  });

  const filteredCards = useMemo(() => {
    const now = new Date().toISOString();
    switch (activeTab) {
      case 'due': return cards.filter(c => c.scheduled_date <= now && c.state !== 2);
      case 'learning': return cards.filter(c => c.state === 1 || c.state === 3);
      case 'mastered': return cards.filter(c => c.state === 2);
      default: return cards;
    }
  }, [cards, activeTab]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['error-deck-cards'] });
    queryClient.invalidateQueries({ queryKey: ['error-notebook-count'] });
  };

  const returnMutation = useMutation({
    mutationFn: (ids: string[]) => returnCardsToOrigin(ids),
    onSuccess: (count) => {
      toast({ title: `${count} card(s) devolvido(s) ao deck original` });
      setSelectedIds(new Set());
      setSelectionMode(false);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteErrorCards(ids),
    onSuccess: () => {
      toast({ title: 'Cards excluídos' });
      setSelectedIds(new Set());
      setSelectionMode(false);
      invalidate();
    },
  });

  const handleBulkReturn = () => returnMutation.mutate([...selectedIds]);
  const handleBulkDelete = () => deleteMutation.mutate([...selectedIds]);
  const handleSingleReturn = (id: string) => returnMutation.mutate([id]);
  const handleSingleDelete = (id: string) => deleteMutation.mutate([id]);

  const dueCount = cards.filter(c => c.scheduled_date <= new Date().toISOString() && c.state !== 2).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <BookX className="h-5 w-5 text-destructive" />
              Caderno de Erros
            </h1>
            <p className="text-xs text-muted-foreground">
              {cards.length} itens · {dueCount} para revisar
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cards.length > 0 && (
              <Button
                variant={selectionMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  setSelectedIds(new Set());
                }}
              >
                {selectionMode ? 'Cancelar' : 'Selecionar'}
              </Button>
            )}
            {errorDeckId && dueCount > 0 && !selectionMode && (
              <Button size="sm" className="gap-1" onClick={() => navigate(`/study/${errorDeckId}`)}>
                <PlayCircle className="h-3.5 w-3.5" />
                Estudar
              </Button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        {cards.length > 0 && (
          <div className="container mx-auto px-4 pb-3 flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground">Nenhum erro!</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Erros em cards e questões podem aparecer aqui para revisão rápida.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/dashboard')}>
              Voltar ao Dashboard
            </Button>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Nenhum card nesta categoria.
          </div>
        ) : (
          filteredCards.map(card => (
            <CardRow
              key={card.id}
              card={card}
              selected={selectedIds.has(card.id)}
              selectionMode={selectionMode}
              onToggle={() => toggleSelect(card.id)}
              onTap={() => setDetailCard(card)}
            />
          ))
        )}
      </main>

      {/* Bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full border bg-card shadow-lg px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleBulkReturn}>
            <Undo2 className="h-3.5 w-3.5" /> Devolver
          </Button>
          <Button size="sm" variant="destructive" className="gap-1" onClick={handleBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </div>
      )}

      {/* Detail Sheet */}
      <ErrorDetailSheet
        card={detailCard}
        open={!!detailCard}
        onOpenChange={(open) => { if (!open) setDetailCard(null); }}
        errorDeckId={errorDeckId}
        onReturn={handleSingleReturn}
        onDelete={handleSingleDelete}
      />
    </div>
  );
};

export default ErrorNotebook;
