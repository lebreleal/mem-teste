/**
 * Explorar Salas — lista Salas publicadas.
 * Layout idêntico ao SalaCard do Dashboard.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiscoverTurmas, type Turma } from '@/hooks/useTurmas';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Sparkles, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatRelative = (d: string) => {
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ptBR }); } catch { return ''; }
};

const SalaCard = ({
  sala,
  onClick,
}: {
  sala: Turma & { member_count?: number; card_count?: number; deck_count?: number; question_count?: number; owner_name?: string; last_updated?: string };
  onClick: () => void;
}) => {
  const cover = sala.cover_image_url || defaultSalaIcon;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all hover:bg-muted/50 active:bg-muted/70"
    >
      <img
        src={cover}
        alt={sala.name}
        className="h-12 w-12 rounded-xl object-cover shrink-0"
        loading="lazy"
        decoding="async"
      />

      <div className="flex-1 min-w-0">
        <h3 className="font-display font-semibold text-foreground truncate">{sala.name}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            {(sala.deck_count ?? 0) > 0 && <span>{sala.deck_count} {(sala.deck_count ?? 0) === 1 ? 'deck' : 'decks'}</span>}
            {(sala.card_count ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Layers className="h-3 w-3" />
                  {sala.card_count}
                </span>
              </>
            )}
            {(sala.question_count ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <HelpCircle className="h-3 w-3" />
                  {sala.question_count}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {sala.owner_name && (
            <span className="text-[11px] text-muted-foreground">por <span className="font-medium text-foreground">{sala.owner_name}</span></span>
          )}
          {sala.last_updated && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">{formatRelative(sala.last_updated)}</span>
            </>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
};

const EmptyState = ({ searchQuery }: { searchQuery: string }) => (
  <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center">
    <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
    <h2 className="font-display text-lg font-bold text-foreground">Nenhuma Sala encontrada</h2>
    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
      {searchQuery ? `Nenhuma Sala para "${searchQuery}"` : 'Nenhuma Sala pública disponível.'}
    </p>
  </div>
);

const Turmas = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: salas, isLoading } = useDiscoverTurmas(searchQuery);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">Explorar Salas</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-2xl">
        <div className="mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar Sala ou deck publicado..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
            ))}
          </div>
        ) : (salas?.length ?? 0) > 0 ? (
          <div className="divide-y divide-border/50 rounded-xl border border-border/50 bg-card shadow-sm">
            {salas!.map((sala) => (
              <SalaCard
                key={sala.id}
                sala={sala}
                onClick={() => navigate(`/turmas/${sala.id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState searchQuery={searchQuery} />
        )}
      </main>
    </div>
  );
};

export default Turmas;
