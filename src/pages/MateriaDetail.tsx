/**
 * MateriaDetail — full-screen view for a "Matéria" (parent deck).
 * Shows header with back button + name + edit icon.
 * Lists sub-decks with classification bars.
 * Edit modal: rename + color selector.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Play, Info, ChevronRight } from 'lucide-react';
import { useDecks } from '@/hooks/useDecks';
import { useAuth } from '@/hooks/useAuth';
import { IconFolder, IconEdit, IconDeck } from '@/components/icons';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { DeckWithStats } from '@/hooks/useDecks';
import CreateDeckDialog from '@/components/CreateDeckDialog';
import AICreateDeckDialog from '@/components/AICreateDeckDialog';

const MATERIA_COLORS = [
  '#6366F1', // indigo
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

/** Parse color from image_url field (format: "color:#HEX") */
function parseMateriaColor(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const match = imageUrl.match(/^color:(#[0-9A-Fa-f]{6})$/);
  return match ? match[1] : null;
}

/** 5-segment classification bar */
const ClassificationBar = ({ facilPct, bomPct, dificilPct, erreiPct, novoPct, className = '' }: {
  facilPct: number; bomPct: number; dificilPct: number; erreiPct: number; novoPct: number; className?: string;
}) => (
  <div className={`relative h-1 w-full overflow-hidden rounded-full bg-muted/30 ${className}`}>
    <div className="absolute inset-y-0 left-0 flex w-full">
      {facilPct > 0 && <div className="h-full transition-all duration-500 rounded-l-full" style={{ width: `${facilPct}%`, backgroundColor: 'hsl(var(--info))' }} />}
      {bomPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${bomPct}%`, backgroundColor: 'hsl(var(--success))' }} />}
      {dificilPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${dificilPct}%`, backgroundColor: 'hsl(var(--warning))' }} />}
      {erreiPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${erreiPct}%`, backgroundColor: 'hsl(var(--destructive))' }} />}
      {novoPct > 0 && <div className="h-full bg-muted transition-all duration-500 rounded-r-full" style={{ width: `${novoPct}%` }} />}
    </div>
  </div>
);

function getClassification(deck: DeckWithStats) {
  const total = deck.total_cards;
  if (total === 0) return { facilPct: 0, bomPct: 0, dificilPct: 0, erreiPct: 0, novoPct: 0 };
  return {
    facilPct: ((deck.class_facil ?? 0) / total) * 100,
    bomPct: ((deck.class_bom ?? 0) / total) * 100,
    dificilPct: ((deck.class_dificil ?? 0) / total) * 100,
    erreiPct: ((deck.class_errei ?? 0) / total) * 100,
    novoPct: ((deck.class_novo ?? 0) / total) * 100,
  };
}

const MateriaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { decks, getSubDecks, getAggregateStats } = useDecks();

  const materia = useMemo(() => decks?.find(d => d.id === id), [decks, id]);
  const subDecks = useMemo(() => (id ? getSubDecks(id) : []), [id, getSubDecks]);
  const materiaColor = parseMateriaColor(materia?.image_url);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [showCreateAI, setShowCreateAI] = useState(false);

  const openEdit = useCallback(() => {
    if (!materia) return;
    setEditName(materia.name);
    setEditColor(parseMateriaColor(materia.image_url));
    setShowEdit(true);
  }, [materia]);

  const updateMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string | null }) => {
      if (!id) throw new Error('No materia id');
      const updates: Record<string, string> = { name };
      if (color) {
        updates.image_url = `color:${color}`;
      } else {
        updates.image_url = '';
      }
      const { error } = await supabase.from('decks').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      setShowEdit(false);
      toast({ title: 'Matéria atualizada' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  if (!materia) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <IconFolder className="h-5 w-5 shrink-0" style={materiaColor ? { color: materiaColor } : undefined} />
          <h1 className="flex-1 text-base font-bold text-foreground truncate">{materia.name}</h1>
          <button onClick={openEdit} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <IconEdit className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Sub-decks list */}
      <div className="divide-y divide-border/30">
        {subDecks.map(sub => {
          const stats = getAggregateStats(sub);
          const cls = getClassification(sub);
          const hasDue = stats.new_count + stats.learning_count + stats.review_count > 0;
          return (
            <div
              key={sub.id}
              className="group flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/decks/${sub.id}`)}
            >
              <IconDeck className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">{sub.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {sub.total_cards} {sub.total_cards === 1 ? 'cartão' : 'cartões'}
                </p>
                <ClassificationBar {...cls} className="mt-1" />
              </div>
              {hasDue && (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/decks/${sub.id}`); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                  aria-label="Estudar"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {subDecks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <IconDeck className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum baralho nesta matéria</p>
        </div>
      )}

      {/* Add deck button */}
      <div className="px-4 pt-4">
        <button
          onClick={() => setShowAddDeck(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <Plus className="h-4 w-4" />
          Adicionar Deck
        </button>
      </div>

      {/* Add deck choice modal */}
      <Dialog open={showAddDeck} onOpenChange={setShowAddDeck}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Novo baralho em {materia.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => { setShowAddDeck(false); setShowCreateDeck(true); }}
              className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
            >
              <span className="text-sm font-medium text-foreground">Criar baralho manualmente</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </button>
            <button
              onClick={() => { setShowAddDeck(false); setShowCreateAI(true); }}
              className="w-full rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted flex items-center gap-2"
            >
              <span className="text-sm font-medium text-foreground">Criar baralho com IA</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Editar Matéria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome da matéria"
              autoFocus
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor do ícone</p>
              <div className="flex flex-wrap gap-2">
                {MATERIA_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setEditColor(editColor === color ? null : color)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${editColor === color ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!editName.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate({ name: editName.trim(), color: editColor })}
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create deck dialog */}
      {showCreateDeck && (
        <CreateDeckDialog
          open={showCreateDeck}
          onOpenChange={setShowCreateDeck}
          parentDeckId={id}
        />
      )}
      {showCreateAI && (
        <AICreateDeckDialog
          open={showCreateAI}
          onOpenChange={setShowCreateAI}
          parentDeckId={id}
        />
      )}
    </div>
  );
};

export default MateriaDetail;
