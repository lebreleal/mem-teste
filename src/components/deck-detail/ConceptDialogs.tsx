/**
 * ConceptDialogs — Create concept + Edit concept cards dialogs.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';
import { useCards } from '@/hooks/useCards';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Create Concept Dialog ───────────────────────
interface CreateConceptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  onConfirm: (name: string, cardIds: string[]) => void;
}

export const CreateConceptDialog = ({ open, onOpenChange, deckId, onConfirm }: CreateConceptDialogProps) => {
  const [name, setName] = useState('');
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const { cards } = useCards(deckId);

  const filtered = useMemo(() => {
    if (!search) return cards;
    const q = search.toLowerCase();
    return cards.filter((c: any) =>
      c.front_content?.replace(/<[^>]*>/g, '').toLowerCase().includes(q) ||
      c.back_content?.replace(/<[^>]*>/g, '').toLowerCase().includes(q)
    );
  }, [cards, search]);

  const toggle = (id: string) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim(), Array.from(selectedCards));
      setName('');
      setSelectedCards(new Set());
      setSearch('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Criar conceito</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Nome do conceito"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">Selecione os cards que pertencem a este conceito:</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar card..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <ScrollArea className="flex-1 max-h-64 border rounded-lg">
          <div className="p-2 space-y-1">
            {filtered.map((card: any) => (
              <label
                key={card.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedCards.has(card.id)}
                  onCheckedChange={() => toggle(card.id)}
                />
                <span
                  className="text-xs text-foreground truncate"
                  dangerouslySetInnerHTML={{
                    __html: card.front_content?.replace(/<[^>]*>/g, '').slice(0, 100) || '(sem conteúdo)',
                  }}
                />
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum card encontrado</p>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Criar ({selectedCards.size} cards)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Edit Concept Cards Dialog ───────────────────
interface EditConceptCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  conceptId: string;
  conceptName: string;
  onConfirm: (cardIds: string[]) => void;
}

export const EditConceptCardsDialog = ({ open, onOpenChange, deckId, conceptId, conceptName, onConfirm }: EditConceptCardsDialogProps) => {
  const { cards } = useCards(deckId);
  const { data: existingCardIds = [] } = useQuery({
    queryKey: ['concept-cards-legacy', conceptId],
    queryFn: async () => {
      const { data } = await supabase
        .from('concept_cards' as any)
        .select('card_id')
        .eq('concept_id', conceptId);
      return ((data ?? []) as any[]).map((r: any) => r.card_id);
    },
    enabled: !!conceptId && open,
    staleTime: 60_000,
  });
  const [selectedCards, setSelectedCards] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState('');

  // Initialize from existing when data arrives
  const effective = selectedCards ?? new Set(existingCardIds);

  const filtered = useMemo(() => {
    if (!search) return cards;
    const q = search.toLowerCase();
    return cards.filter((c: any) =>
      c.front_content?.replace(/<[^>]*>/g, '').toLowerCase().includes(q) ||
      c.back_content?.replace(/<[^>]*>/g, '').toLowerCase().includes(q)
    );
  }, [cards, search]);

  const toggle = (id: string) => {
    const current = new Set(effective);
    if (current.has(id)) current.delete(id); else current.add(id);
    setSelectedCards(current);
  };

  const handleConfirm = () => {
    onConfirm(Array.from(effective));
    setSelectedCards(null);
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSelectedCards(null); setSearch(''); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Cards de "{conceptName}"</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar card..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <ScrollArea className="flex-1 max-h-72 border rounded-lg">
          <div className="p-2 space-y-1">
            {filtered.map((card: any) => (
              <label
                key={card.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={effective.has(card.id)}
                  onCheckedChange={() => toggle(card.id)}
                />
                <span
                  className="text-xs text-foreground truncate"
                  dangerouslySetInnerHTML={{
                    __html: card.front_content?.replace(/<[^>]*>/g, '').slice(0, 100) || '(sem conteúdo)',
                  }}
                />
              </label>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm}>
            Salvar ({effective.size} cards)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
