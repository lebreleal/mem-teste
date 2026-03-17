/**
 * MateriaDetail — full-screen view for a "Pasta" (parent deck).
 * Header: "< Sala" back + name + edit icon + 3-dot menu.
 * Lists sub-decks with classification bars.
 * Edit modal: rename + color selector.
 * Add menu: only baralho + importar (no pasta creation inside a pasta).
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Play, ChevronRight, MoreVertical, GripVertical } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDecks } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';
import type { DeckWithStats } from '@/types/deck';
import { IconFolder, IconEdit, IconDeck, IconArchive, IconTrash } from '@/components/icons';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const MATERIA_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

const COLOR_STORAGE_KEY = 'memo-materia-colors';

function getMateriaColors(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function setMateriaColor(deckId: string, color: string | null) {
  const colors = getMateriaColors();
  if (color) { colors[deckId] = color; } else { delete colors[deckId]; }
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors));
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
  const { decks } = useDecks();
  const { folders } = useFolders();

  // Find the materia and its sub-decks from the cached decks list
  const materia = useMemo(() => decks?.find(d => d.id === id), [decks, id]);
  const subDecks = useMemo(
    () => (decks ?? []).filter(d => d.parent_deck_id === id && !d.is_archived),
    [decks, id]
  );

  // Find parent sala (folder) name
  const parentFolder = useMemo(() => {
    if (!materia?.folder_id) return null;
    return (folders as Array<{ id: string; name: string }>)?.find(f => f.id === materia.folder_id) ?? null;
  }, [materia, folders]);
  const backLabel = parentFolder?.name ?? 'Sala';

  const [colorVersion, setColorVersion] = useState(0);
  const materiaColor = useMemo(() => id ? getMateriaColors()[id] ?? null : null, [id, colorVersion]);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [organizeMode, setOrganizeMode] = useState(false);

  const openEdit = useCallback(() => {
    if (!materia) return;
    setEditName(materia.name);
    setEditColor(materiaColor);
    setShowEdit(true);
  }, [materia, materiaColor]);

  const updateMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string | null }) => {
      if (!id) throw new Error('No materia id');
      setMateriaColor(id, color);
      const { error } = await supabase.from('decks').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      setColorVersion(v => v + 1);
      setShowEdit(false);
      toast({ title: 'Pasta atualizada' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No materia id');
      const { error } = await supabase.from('decks').update({ is_archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Pasta arquivada' });
      navigate(-1);
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao arquivar', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No materia id');
      const { error } = await supabase.from('decks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Pasta excluída' });
      navigate(-1);
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    },
  });

  const { createDeck } = useDecks();

  const handleCreateManual = useCallback((name: string) => {
    if (!id || !user) return;
    createDeck.mutate({ name, parentDeckId: id }, {
      onSuccess: () => {
        setShowAddDeck(false);
        toast({ title: 'Baralho criado' });
      },
    });
  }, [id, user, createDeck]);

  if (!materia) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header — matches sala hero style */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{backLabel}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setOrganizeMode(!organizeMode)}>
                <GripVertical className="h-4 w-4 mr-2" /> {organizeMode ? 'Concluir organização' : 'Organizar pasta'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
                <IconArchive className="h-4 w-4 mr-2" /> Arquivar pasta
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deleteMutation.mutate()}
              >
                <IconTrash className="h-4 w-4 mr-2" /> Excluir pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Pasta name row */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <div className="shrink-0" style={materiaColor ? { color: materiaColor } : undefined}>
            <IconFolder className="h-5 w-5" />
          </div>
          <h1 className="flex-1 text-base font-bold text-foreground truncate">{materia.name}</h1>
          <button onClick={openEdit} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <IconEdit className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub-decks list */}
      <div className="divide-y divide-border/30">
        {subDecks.map(sub => {
          const cls = getClassification(sub);
          const hasDue = sub.new_count + sub.learning_count + sub.review_count > 0;
          return (
            <div
              key={sub.id}
              className="group flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => !organizeMode && navigate(`/decks/${sub.id}`)}
            >
              {organizeMode && (
                <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing" />
              )}
              <IconDeck className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-medium text-foreground truncate">{sub.name}</h3>
                <ClassificationBar {...cls} className="mt-1" />
              </div>
              {hasDue && !organizeMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/decks/${sub.id}`); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                  aria-label="Estudar"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </button>
              )}
              {!organizeMode && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {subDecks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <IconDeck className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum baralho nesta pasta</p>
        </div>
      )}

      {/* Add deck button */}
      <div className="px-4 pt-4">
        <button
          onClick={() => setShowAddDeck(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <Plus className="h-4 w-4" />
          Adicionar Baralho
        </button>
      </div>

      {/* Add deck choice modal */}
      <Dialog open={showAddDeck} onOpenChange={setShowAddDeck}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Novo baralho em {materia.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            <AddDeckNameInput
              onSubmit={(name) => { handleCreateManual(name); }}
              loading={createDeck.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Editar Pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome da pasta"
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
    </div>
  );
};

/** Simple input to create a deck by name */
const AddDeckNameInput = ({ onSubmit, loading }: { onSubmit: (name: string) => void; loading: boolean }) => {
  const [name, setName] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); }} className="flex flex-col gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do baralho" autoFocus />
      <Button type="submit" disabled={!name.trim() || loading} className="w-full">
        {loading ? 'Criando...' : 'Criar'}
      </Button>
    </form>
  );
};

export default MateriaDetail;