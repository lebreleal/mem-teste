/**
 * Explorar Decks — lista apenas Salas publicadas.
 * Busca por nome da Sala ou por nome de deck publicado dentro da Sala.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiscoverTurmas, type Turma } from '@/hooks/useTurmas';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Sparkles, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const formatCount = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(0)} mil`;
  return String(n);
};

/** Map of keywords → cover image paths (same visual language from recommendations) */
const COVER_MAP: Record<string, string> = {
  medic: '/deck-covers/medicina.webp',
  saúde: '/deck-covers/medicina.webp',
  saude: '/deck-covers/medicina.webp',
  anato: '/deck-covers/medicina.webp',
  fisiolog: '/deck-covers/medicina.webp',
  cardio: '/deck-covers/medicina.webp',
  farmaco: '/deck-covers/medicina.webp',
  patolog: '/deck-covers/medicina.webp',
  neuro: '/deck-covers/neurociencia.webp',
  psico: '/deck-covers/neurociencia.webp',
  direit: '/deck-covers/direito.webp',
  jurí: '/deck-covers/direito.webp',
  constitu: '/deck-covers/direito.webp',
  penal: '/deck-covers/direito.webp',
  civil: '/deck-covers/direito.webp',
  matemát: '/deck-covers/matematica.webp',
  matemat: '/deck-covers/matematica.webp',
  cálcul: '/deck-covers/matematica.webp',
  calcul: '/deck-covers/matematica.webp',
  álgebr: '/deck-covers/matematica.webp',
  algebr: '/deck-covers/matematica.webp',
  biolog: '/deck-covers/biologia.webp',
  genétic: '/deck-covers/biologia.webp',
  genetic: '/deck-covers/biologia.webp',
  ecolog: '/deck-covers/biologia.webp',
  físic: '/deck-covers/fisica.webp',
  fisic: '/deck-covers/fisica.webp',
  mecânic: '/deck-covers/fisica.webp',
  mecanica: '/deck-covers/fisica.webp',
  termodin: '/deck-covers/fisica.webp',
  inglês: '/deck-covers/idiomas.webp',
  ingles: '/deck-covers/idiomas.webp',
  english: '/deck-covers/idiomas.webp',
  german: '/deck-covers/idiomas.webp',
  french: '/deck-covers/idiomas.webp',
  espanhol: '/deck-covers/idiomas.webp',
  idioma: '/deck-covers/idiomas.webp',
  program: '/deck-covers/programacao.webp',
  código: '/deck-covers/programacao.webp',
  codigo: '/deck-covers/programacao.webp',
  python: '/deck-covers/programacao.webp',
  java: '/deck-covers/programacao.webp',
  react: '/deck-covers/programacao.webp',
  química: '/deck-covers/quimica.webp',
  quimica: '/deck-covers/quimica.webp',
  orgânic: '/deck-covers/quimica.webp',
  organica: '/deck-covers/quimica.webp',
  bioquímic: '/deck-covers/quimica.webp',
  bioquimic: '/deck-covers/quimica.webp',
};

function getCoverForName(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, path] of Object.entries(COVER_MAP)) {
    if (lower.includes(keyword)) return path;
  }
  return '/deck-covers/geral.webp';
}

const SalaCard = ({
  sala,
  onClick,
}: {
  sala: Turma & { member_count?: number; card_count?: number; owner_name?: string };
  onClick: () => void;
}) => {
  const cover = sala.cover_image_url || getCoverForName(sala.name);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-xl border border-border/50 bg-card p-3 shadow-sm hover:shadow-md transition-shadow text-left"
    >
      <img
        src={cover}
        alt={sala.name}
        className="h-12 w-12 rounded-lg object-cover shrink-0"
        loading="lazy"
        decoding="async"
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{sala.name}</h3>
        <div className="flex items-center gap-3 mt-0.5">
          {sala.owner_name && (
            <span className="text-xs text-muted-foreground truncate">por {sala.owner_name}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="h-3 w-3" />
            {formatCount(sala.card_count ?? 0)}
          </span>
        </div>
      </div>
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
          <h1 className="font-display text-xl font-bold text-foreground">Explorar Decks</h1>
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
          <div className="space-y-2">
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
