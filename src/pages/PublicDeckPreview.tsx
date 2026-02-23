/**
 * PublicDeckPreview — full page preview of a public deck from the marketplace
 * with card list, forecast simulation, and import action.
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Layers, RefreshCw, BarChart3, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useForecastSimulator } from '@/hooks/useForecastSimulator';
import type { ForecastView } from '@/types/forecast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

/* ─── Card Row ─── */
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

      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[hsl(217_91%_60%)]" /> Revisão</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[hsl(142_71%_45%)]" /> Novos</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[hsl(38_92%_50%)]" /> Aprendendo</span>
      </div>
    </div>
  );
};

/* ─── Main Page ─── */
const PublicDeckPreview = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  // Fetch deck info
  const { data: deck, isLoading: deckLoading } = useQuery({
    queryKey: ['public-deck-info', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decks')
        .select('id, name, is_public, updated_at, user_id')
        .eq('id', deckId!)
        .single();
      if (error) throw error;

      // Get owner name
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', data.user_id)
        .single();

      return { ...data, owner_name: profile?.name ?? 'Criador' };
    },
    enabled: !!deckId,
  });

  // Check ownership
  const { data: alreadyOwns } = useQuery({
    queryKey: ['owns-deck', deckId, user?.id],
    queryFn: async () => {
      if (!user || !deckId) return false;
      if (deck?.user_id === user.id) return true;
      const { data } = await supabase
        .from('decks')
        .select('id')
        .eq('user_id', user.id)
        .eq('source_listing_id', deckId)
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user && !!deckId && !!deck,
  });

  // Fetch cards
  const { data: allCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['public-deck-cards', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('id, front_content, back_content, card_type')
        .eq('deck_id', deckId!)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!deckId,
  });

  const totalPages = Math.ceil(allCards.length / PAGE_SIZE);
  const paginatedCards = allCards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Import mutation
  const importDeck = useMutation({
    mutationFn: async () => {
      if (!user || !deck) throw new Error('Not authenticated');

      const { data: newDeck, error: deckError } = await supabase
        .from('decks')
        .insert({ user_id: user.id, name: deck.name, is_public: false })
        .select('id')
        .single();
      if (deckError) throw deckError;

      if (allCards.length > 0) {
        const cardsToInsert = allCards.map(c => ({
          deck_id: newDeck.id,
          front_content: c.front_content,
          back_content: c.back_content,
          card_type: c.card_type,
        }));
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
      navigate('/dashboard');
    },
    onError: () => {
      toast({ title: 'Erro ao importar deck', variant: 'destructive' });
    },
  });

  if (deckLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Deck não encontrado</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-base sm:text-xl font-bold text-foreground truncate">
              {deck.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              por <span className="font-semibold text-foreground">{deck.owner_name}</span>
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Stats bar */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-foreground" />
            <span className="font-bold text-foreground">{allCards.length}</span> cards
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {formatDistanceToNow(new Date(deck.updated_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="cards" className="flex-1 flex flex-col">
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

          <TabsContent value="cards" className="mt-0">
            {cardsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : allCards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhum card neste baralho.</p>
            ) : (
              <>
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
          </TabsContent>

          <TabsContent value="simulation" className="mt-3">
            <SimpleForecast deckId={deck.id} />
          </TabsContent>
        </Tabs>

        {/* Action bar */}
        <div className="sticky bottom-4 pt-3">
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
      </main>
    </div>
  );
};

export default PublicDeckPreview;
