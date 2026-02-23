/**
 * PublicDeckPreviewSheet — preview a public deck from the marketplace
 * with card list, forecast simulation, and import action.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { sanitizeHtml } from '@/lib/sanitize';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Layers, RefreshCw, BarChart3, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useForecastSimulator, useForecastView } from '@/hooks/useForecastSimulator';
import type { PublicDeckItem } from '@/services/turmaService';
import type { ForecastView } from '@/types/forecast';

// ─── Forecast chart (simplified) ───
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: PublicDeckItem | null;
}

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

/* ─── Card Row (compact table-like) ─── */
const CardRow = ({ front, back, type, index }: { front: string; back: string; type: string; index: number }) => {
  const isCloze = type === 'cloze' || front.includes('{{c');
  const frontText = stripHtml(front).replace(/\{\{c\d+::(.+?)\}\}/g, '[$1]');
  const backText = isCloze ? '' : stripHtml(back);

  return (
    <div className={`flex gap-3 px-4 py-3 text-sm ${index % 2 === 0 ? 'bg-muted/30' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-foreground line-clamp-2">{frontText}</p>
      </div>
      {backText && (
        <div className="flex-1 min-w-0">
          <p className="text-muted-foreground line-clamp-2">{backText}</p>
        </div>
      )}
    </div>
  );
};

/* ─── Simplified Forecast Chart ─── */
const SimpleForecast = ({ deckId }: { deckId: string }) => {
  const [view, setView] = useState<ForecastView>('30d');
  const horizonMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const horizonDays = horizonMap[view] ?? 30;

  const { data, summary, isSimulating, progress } = useForecastSimulator({
    deckIds: [deckId],
    horizonDays,
    dailyMinutes: 60,
    weeklyMinutes: null,
    enabled: true,
  });

  const chartData = data.map(d => ({
    ...d,
    totalCards: d.reviewCards + d.newCards + d.learningCards + d.relearningCards,
  }));

  const viewOptions = [
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    { value: '1y', label: '1 ano' },
  ];

  return (
    <div className="space-y-3">
      {/* View selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            Simulação de Carga
          </h3>
        </div>
        <div className="flex gap-1">
          {viewOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value as ForecastView)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                view === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {summary && !isSimulating && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-lg font-bold text-foreground">{summary.avgDailyMin}</p>
            <p className="text-[10px] text-muted-foreground">min/dia (média)</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-lg font-bold text-foreground">{summary.peakMin}</p>
            <p className="text-[10px] text-muted-foreground">min no pico</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-48 w-full">
        {isSimulating ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-[11px] text-muted-foreground">Simulando... {progress}%</p>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} className="text-muted-foreground" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="reviewCards" name="Revisão" stackId="1" fill="hsl(217 91% 60%)" stroke="hsl(217 91% 60%)" fillOpacity={0.6} />
              <Area type="monotone" dataKey="newCards" name="Novos" stackId="1" fill="hsl(142 71% 45%)" stroke="hsl(142 71% 45%)" fillOpacity={0.6} />
              <Area type="monotone" dataKey="learningCards" name="Aprendendo" stackId="1" fill="hsl(38 92% 50%)" stroke="hsl(38 92% 50%)" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">Sem dados para simular</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[hsl(217_91%_60%)]" /> Revisão</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[hsl(142_71%_45%)]" /> Novos</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[hsl(38_92%_50%)]" /> Aprendendo</span>
      </div>
    </div>
  );
};

/* ─── Preview Content ─── */
const PreviewContent = ({ deck, onClose }: { deck: PublicDeckItem; onClose: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  // Check if user already owns this deck
  const { data: alreadyOwns } = useQuery({
    queryKey: ['owns-deck', deck.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from('decks')
        .select('id')
        .eq('user_id', user.id)
        .eq('source_listing_id', deck.id)
        .limit(1);
      // Also check if they own the exact deck
      if (deck.owner_id === user.id) return true;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user,
  });

  // Fetch cards for this deck
  const { data: allCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['public-deck-cards', deck.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('id, front_content, back_content, card_type')
        .eq('deck_id', deck.id)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!deck.id,
  });

  const totalPages = Math.ceil(allCards.length / PAGE_SIZE);
  const paginatedCards = allCards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Import mutation
  const importDeck = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Create a new deck for the user
      const { data: newDeck, error: deckError } = await supabase
        .from('decks')
        .insert({
          user_id: user.id,
          name: deck.name,
          is_public: false,
        })
        .select('id')
        .single();
      if (deckError) throw deckError;

      // Copy all cards
      if (allCards.length > 0) {
        const cardsToInsert = allCards.map(c => ({
          deck_id: newDeck.id,
          front_content: c.front_content,
          back_content: c.back_content,
          card_type: c.card_type,
        }));

        // Insert in batches of 100
        for (let i = 0; i < cardsToInsert.length; i += 100) {
          const batch = cardsToInsert.slice(i, i + 100);
          const { error } = await supabase.from('cards').insert(batch);
          if (error) throw error;
        }
      }

      return newDeck;
    },
    onSuccess: () => {
      toast({ title: 'Deck importado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      onClose();
    },
    onError: () => {
      toast({ title: 'Erro ao importar deck', variant: 'destructive' });
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pb-4 border-b border-border/30 space-y-2">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">{deck.name}</h2>
          <p className="text-xs text-muted-foreground">
            por <span className="font-semibold text-foreground">{deck.owner_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-foreground" />
            <span className="font-bold text-foreground">{deck.card_count}</span> cards
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {formatDistanceToNow(new Date(deck.updated_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cards" className="flex-1 flex flex-col mt-3">
        <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
          <TabsTrigger
            value="cards"
            className="text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <Layers className="h-3.5 w-3.5" /> Cards ({allCards.length})
          </TabsTrigger>
          <TabsTrigger
            value="simulation"
            className="text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Simulação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="flex-1 mt-0">
          <ScrollArea className="flex-1" style={{ maxHeight: 'calc(70vh - 200px)' }}>
            {cardsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : allCards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhum card neste baralho.</p>
            ) : (
              <>
                {/* Table header */}
                <div className="flex gap-3 px-4 py-2 border-b border-border/50 bg-muted/50">
                  <span className="flex-1 text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">Frente</span>
                  <span className="flex-1 text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">Verso</span>
                </div>
                {paginatedCards.map((card, i) => (
                  <CardRow
                    key={card.id}
                    front={card.front_content}
                    back={card.back_content}
                    type={card.card_type}
                    index={i}
                  />
                ))}
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-3 border-t border-border/30">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = totalPages <= 5 ? i : (
                        page < 3 ? i :
                        page > totalPages - 3 ? totalPages - 5 + i :
                        page - 2 + i
                      );
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`h-7 w-7 rounded-md text-xs font-semibold transition-colors ${
                            page === pageNum
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {pageNum + 1}
                        </button>
                      );
                    })}
                    {totalPages > 5 && (
                      <span className="text-xs text-muted-foreground">... {totalPages}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="simulation" className="flex-1 mt-3">
          <ScrollArea style={{ maxHeight: 'calc(70vh - 200px)' }}>
            <SimpleForecast deckId={deck.id} />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Action bar */}
      <div className="sticky bottom-0 pt-3 border-t border-border/30 bg-background pb-1">
        {alreadyOwns ? (
          <Button className="w-full gap-2" disabled>
            ✓ Já na sua coleção
          </Button>
        ) : (
          <Button
            className="w-full gap-2"
            onClick={() => importDeck.mutate()}
            disabled={importDeck.isPending}
          >
            <Copy className="h-4 w-4" />
            {importDeck.isPending ? 'Importando...' : 'Importar para minha coleção'}
          </Button>
        )}
      </div>
    </div>
  );
};

/* ─── Sheet/Drawer wrapper ─── */
const PublicDeckPreviewSheet = ({ open, onOpenChange, deck }: Props) => {
  const isMobile = useIsMobile();

  if (!deck) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{deck.name}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-2 pb-4 flex flex-col" style={{ maxHeight: '85vh' }}>
            <PreviewContent deck={deck} onClose={() => onOpenChange(false)} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>{deck.name}</SheetTitle>
        </SheetHeader>
        <PreviewContent deck={deck} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
};

export default PublicDeckPreviewSheet;
