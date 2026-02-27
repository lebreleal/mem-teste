/**
 * PublicDeckPreview — full page preview of a public deck
 * with card list, community suggestions, and import action.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Layers, RefreshCw, ArrowLeft, MessageSquare, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

const getCardTypeLabel = (type: string, front: string) => {
  const isCloze = type === 'cloze' || front.includes('{{c');
  if (isCloze) return { label: 'CLOZE', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
  if (type === 'multiple_choice') return { label: 'MÚLTIPLA', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  return { label: 'BÁSICO', className: 'bg-muted text-muted-foreground border-border/50' };
};

/* ─── Flashcard Viewer ─── */
const FlashcardViewer = ({ cards }: { cards: { id: string; front_content: string; back_content: string; card_type: string }[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (cards.length === 0) return null;

  const card = cards[currentIndex];
  const isCloze = card.card_type === 'cloze' || card.front_content.includes('{{c');
  const frontText = stripHtml(card.front_content).replace(/\{\{c\d+::(.+?)\}\}/g, '[...]');
  const backText = isCloze
    ? stripHtml(card.front_content).replace(/\{\{c\d+::(.+?)\}\}/g, '$1')
    : stripHtml(card.back_content);

  const hasImage = card.front_content.includes('<img');
  const imgMatch = card.front_content.match(/<img[^>]+src="([^"]+)"/);
  const imgSrc = imgMatch?.[1];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center">
        <span className="text-xs font-semibold text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
          <span className="text-primary">{currentIndex + 1}</span>/{cards.length}
        </span>
      </div>

      <div
        className="rounded-2xl border border-border/50 bg-card p-5 min-h-[200px] flex flex-col items-center justify-center cursor-pointer transition-all hover:border-primary/30 active:scale-[0.99]"
        onClick={() => setRevealed(!revealed)}
      >
        {!revealed ? (
          <div className="text-center space-y-3 w-full">
            {hasImage && imgSrc && (
              <img src={imgSrc} alt="" className="max-h-40 mx-auto rounded-lg object-contain" />
            )}
            <p className="text-sm text-foreground leading-relaxed">{frontText}</p>
          </div>
        ) : (
          <div className="text-center space-y-3 w-full">
            <p className="text-sm text-primary leading-relaxed font-medium">{backText}</p>
          </div>
        )}
      </div>

      {!revealed && (
        <p className="text-center text-[11px] text-muted-foreground/60">Toque para revelar</p>
      )}

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={currentIndex === 0}
          onClick={() => { setCurrentIndex(currentIndex - 1); setRevealed(false); }}
        >
          ← Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={currentIndex === cards.length - 1}
          onClick={() => { setCurrentIndex(currentIndex + 1); setRevealed(false); }}
        >
          Próximo →
        </Button>
      </div>
    </div>
  );
};

/* ─── Parse MC JSON ─── */
function parseMcOptions(back: string): { options: string[]; correctIndex: number } | null {
  try {
    const data = JSON.parse(back);
    if (Array.isArray(data.options) && typeof data.correctIndex === 'number') return data;
  } catch {}
  return null;
}

/* ─── Card Item (matches Study card layout) ─── */
const CardItem = ({ front, back, type }: { front: string; back: string; type: string }) => {
  const isCloze = type === 'cloze' || front.includes('{{c');
  const frontText = stripHtml(front).replace(/\{\{c\d+::(.+?)\}\}/g, '[$1]');
  const typeInfo = getCardTypeLabel(type, front);
  const mcData = parseMcOptions(back);

  // For non-MC, non-cloze: plain back text
  const backText = isCloze
    ? stripHtml(front).replace(/\{\{c\d+::(.+?)\}\}/g, '$1')
    : mcData ? '' : stripHtml(back);

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-4 py-3 space-y-2">
        {/* Top row: state badge + type badge */}
        <div className="flex items-center justify-between">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
            Novo
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${typeInfo.className}`}>
            {typeInfo.label}
          </span>
        </div>

        {/* Question */}
        <p className="text-sm font-semibold text-foreground leading-snug">{frontText}</p>

        {/* Answer / Options */}
        {mcData ? (
          <div className="space-y-1 pt-1">
            {mcData.options.map((option, i) => (
              <p key={i} className={`text-xs leading-relaxed ${i === mcData.correctIndex ? 'text-emerald-500 font-medium' : 'text-muted-foreground'}`}>
                {i === mcData.correctIndex && '✓ '}{option}
              </p>
            ))}
          </div>
        ) : backText ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{backText}</p>
        ) : null}
      </div>
    </div>
  );
};

/* ─── Suggestion Card (AnkiHub-style) ─── */
interface Suggestion {
  id: string;
  status: string;
  rationale: string;
  created_at: string;
  suggester_name: string;
  card_id: string | null;
  suggested_content: Json;
  original_front: string | null;
  original_back: string | null;
}

const SuggestionCard = ({ suggestion }: { suggestion: Suggestion }) => {
  const content = suggestion.suggested_content as { front_content?: string; back_content?: string } | null;
  const suggestedFront = content?.front_content ?? '';
  const suggestedBack = content?.back_content ?? '';
  const originalFront = suggestion.original_front ?? '';
  const originalBack = suggestion.original_back ?? '';

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/20' },
    accepted: { label: 'Aceita', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    rejected: { label: 'Rejeitada', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };

  const status = statusConfig[suggestion.status] ?? statusConfig.pending;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
            {suggestion.suggester_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{suggestion.suggester_name}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatDistanceToNow(new Date(suggestion.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${status.className}`}>
          {status.label}
        </span>
      </div>

      {/* Rationale */}
      {suggestion.rationale && (
        <div className="px-4 py-2 bg-muted/20 border-b border-border/30">
          <p className="text-xs text-muted-foreground italic">"{suggestion.rationale}"</p>
        </div>
      )}

      {/* Diff view */}
      <div className="divide-y divide-border/30">
        {/* Front diff */}
        {suggestedFront && originalFront !== suggestedFront && (
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Frente</p>
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive line-through">{stripHtml(originalFront)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{stripHtml(suggestedFront)}</p>
            </div>
          </div>
        )}

        {/* Back diff */}
        {suggestedBack && originalBack !== suggestedBack && (
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Verso</p>
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive line-through">{stripHtml(originalBack)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{stripHtml(suggestedBack)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Community Suggestions Section ─── */
const CommunitySuggestions = ({ deckId }: { deckId: string }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['deck-suggestions-public', deckId],
    queryFn: async () => {
      // Fetch suggestions with card info
      const { data, error } = await supabase
        .from('deck_suggestions')
        .select('id, status, rationale, created_at, suggester_user_id, card_id, suggested_content')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Get suggester names
      const userIds = [...new Set(data.map(s => s.suggester_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.id, p.name]));

      // Get original card content
      const cardIds = data.map(s => s.card_id).filter(Boolean) as string[];
      const { data: cards } = cardIds.length > 0
        ? await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds)
        : { data: [] };
      const cardMap = new Map((cards ?? []).map(c => [c.id, c]));

      return data.map(s => ({
        ...s,
        suggester_name: nameMap.get(s.suggester_user_id) ?? 'Usuário',
        original_front: s.card_id ? cardMap.get(s.card_id)?.front_content ?? null : null,
        original_back: s.card_id ? cardMap.get(s.card_id)?.back_content ?? null : null,
      })) as Suggestion[];
    },
    enabled: !!deckId,
  });

  const filtered = filter === 'all' ? suggestions : suggestions.filter(s => s.status === filter);
  const counts = {
    all: suggestions.length,
    pending: suggestions.filter(s => s.status === 'pending').length,
    accepted: suggestions.filter(s => s.status === 'accepted').length,
    rejected: suggestions.filter(s => s.status === 'rejected').length,
  };

  const filters = [
    { value: 'all' as const, label: 'Todas' },
    { value: 'pending' as const, label: 'Pendentes' },
    { value: 'accepted' as const, label: 'Aceitas' },
    { value: 'rejected' as const, label: 'Rejeitadas' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              filter === f.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
            }`}
          >
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma sugestão {filter !== 'all' ? `${filters.find(f => f.value === filter)?.label.toLowerCase()}` : 'da comunidade'}.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Sugestões aparecem quando usuários propõem melhorias nos cards.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(suggestion => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      )}
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', data.user_id)
        .single();

      return { ...data, owner_name: profile?.name ?? 'Criador' };
    },
    enabled: !!deckId,
  });

  // Check ownership — user already has this deck or imported it
  const { data: alreadyOwns } = useQuery({
    queryKey: ['owns-deck', deckId, user?.id],
    queryFn: async () => {
      if (!user || !deckId) return false;
      if (deck?.user_id === user.id) return true;
      // Check if user has a deck linked via marketplace listing
      const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('id')
        .eq('deck_id', deckId)
        .limit(1)
        .maybeSingle();
      if (listing) {
        const { data } = await supabase
          .from('decks')
          .select('id')
          .eq('user_id', user.id)
          .eq('source_listing_id', listing.id)
          .limit(1);
        if ((data?.length ?? 0) > 0) return true;
      }
      return false;
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

  // Suggestion count for tab badge
  const { data: suggestionCount = 0 } = useQuery({
    queryKey: ['deck-suggestion-count', deckId],
    queryFn: async () => {
      const { count } = await supabase
        .from('deck_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', deckId!);
      return count ?? 0;
    },
    enabled: !!deckId,
  });

  const totalPages = Math.ceil(allCards.length / PAGE_SIZE);
  const paginatedCards = allCards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Import mutation
  const importDeck = useMutation({
    mutationFn: async () => {
      if (!user || !deck) throw new Error('Not authenticated');

      // Find marketplace listing for this deck (if any) to set source_listing_id
      const { data: listing } = await supabase
        .from('marketplace_listings')
        .select('id')
        .eq('deck_id', deckId!)
        .eq('is_published', true)
        .limit(1)
        .maybeSingle();

      const { data: newDeck, error: deckError } = await supabase
        .from('decks')
        .insert({
          user_id: user.id,
          name: deck.name,
          is_public: false,
          ...(listing ? { source_listing_id: listing.id } : { is_live_deck: true }),
        })
        .select('id')
        .single();
      if (deckError) throw deckError;

      if (allCards.length > 0) {
        const cardsToInsert = allCards.map(c => ({
          deck_id: newDeck.id,
          front_content: c.front_content,
          back_content: c.back_content,
          card_type: c.card_type,
          state: 0,
          stability: 0,
          difficulty: 0,
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
              value="suggestions"
              className="text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Sugestões {suggestionCount > 0 && `(${suggestionCount})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="mt-4 space-y-6">
            {cardsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : allCards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhum card neste baralho.</p>
            ) : (
              <>
                {/* Flashcard Viewer */}
                <FlashcardViewer cards={allCards} />

                {/* Card list */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider px-1">
                    Todos os cards ({allCards.length})
                  </h3>
                  {paginatedCards.map((card) => (
                    <CardItem
                      key={card.id}
                      front={card.front_content}
                      back={card.back_content}
                      type={card.card_type}
                    />
                  ))}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 py-3">
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
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="mt-3">
            <CommunitySuggestions deckId={deck.id} />
          </TabsContent>
        </Tabs>

        {/* Action bar removed — deck actions handled in community context */}
      </main>
    </div>
  );
};

export default PublicDeckPreview;
