/**
 * Community Marketplace — grid of public communities with search and category filters.
 * Members can also access their own communities via "Minhas" tab.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTurmas, useDiscoverTurmas, type Turma } from '@/hooks/useTurmas';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Plus, Users, LogIn, Search, Star, Crown,
  Globe, Lock, Filter, Sparkles, BookOpen,
} from 'lucide-react';
import LeaveConfirmDialog from '@/components/community/LeaveConfirmDialog';

const DESC_MAX = 2000;

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'medicina', label: 'Medicina' },
  { value: 'direito', label: 'Direito' },
  { value: 'engenharia', label: 'Engenharia' },
  { value: 'concursos', label: 'Concursos' },
  { value: 'idiomas', label: 'Idiomas' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'vestibular', label: 'Vestibular' },
  { value: 'outros', label: 'Outros' },
];

const formatPrice = (price: number) => {
  if (!price || price <= 0) return 'Grátis';
  return `R$${(price / 100).toFixed(2).replace('.', ',')}`;
};

const formatCount = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(0)} mil`;
  return String(n);
};

const RatingStars = ({ rating, count }: { rating: number; count: number }) => {
  if (count === 0) return <span className="text-[11px] text-muted-foreground">Novo</span>;
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <Star className="h-3 w-3 text-warning fill-warning" />
      <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
};

const CommunityCard = ({
  turma,
  onClick,
  isMine,
}: {
  turma: Turma & { member_count?: number; owner_name?: string };
  onClick: () => void;
  isMine?: boolean;
}) => {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
      onClick={onClick}
    >
      {/* Title + Creator */}
      <div className="space-y-1">
        <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug">{turma.name}</h3>
        <p className="text-xs text-muted-foreground">
          por <span className="font-semibold text-foreground">{turma.owner_name ?? 'Criador'}</span>
        </p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-foreground" />
          <span className="font-bold text-foreground">{formatCount(turma.member_count ?? 0)}</span>
          membros
        </span>
        <RatingStars rating={Number(turma.avg_rating ?? 0)} count={turma.rating_count ?? 0} />
      </div>

      {/* Action */}
      {isMine ? (
        <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
          ✓ Inscrito
        </span>
      ) : (
        <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          Inscreva-se
        </span>
      )}
    </div>
  );
};

const Turmas = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { turmas, isLoading, createTurma, joinTurma, leaveTurma } = useTurmas();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [viewMode, setViewMode] = useState<'discover' | 'mine'>('discover');
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  const { data: discoverTurmas, isLoading: discoverLoading } = useDiscoverTurmas(searchQuery);

  const myTurmaIds = new Set(turmas.map(t => t.id));

  // Merge: all public communities, marking which ones user is member of
  const allCommunities = useMemo(() => {
    if (viewMode === 'mine') {
      return turmas
        .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(t => !selectedCategory || (t as any).category === selectedCategory);
    }
    return (discoverTurmas ?? [])
      .filter(t => !selectedCategory || (t as any).category === selectedCategory);
  }, [viewMode, turmas, discoverTurmas, searchQuery, selectedCategory]);

  const handleCreate = () => {
    if (!name.trim()) return;
    createTurma.mutate({ name: name.trim(), description: description.trim() }, {
      onSuccess: () => { setShowCreate(false); setName(''); setDescription(''); toast({ title: 'Comunidade criada!' }); },
      onError: () => toast({ title: 'Erro ao criar', variant: 'destructive' }),
    });
  };

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    joinTurma.mutate(inviteCode.trim(), {
      onSuccess: () => { setShowJoin(false); setInviteCode(''); toast({ title: 'Entrou na comunidade!' }); },
      onError: (e) => toast({ title: e.message || 'Erro', variant: 'destructive' }),
    });
  };

  const loading = viewMode === 'discover' ? discoverLoading : isLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Comunidades</h1>
              <p className="text-[10px] text-muted-foreground">Descubra e aprenda com criadores</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowJoin(true)} className="gap-1.5">
              <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Código</span>
            </Button>
            <Button size="sm" onClick={() => { setShowCreate(true); setName(''); setDescription(''); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Criar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-4xl">
        {/* View toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setViewMode('discover')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              viewMode === 'discover' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Globe className="h-3.5 w-3.5" /> Descobrir
          </button>
          <button
            onClick={() => setViewMode('mine')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              viewMode === 'mine' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" /> Minhas ({turmas.length})
          </button>
        </div>

        {/* Search + Category filters */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar comunidades..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : allCommunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h2 className="font-display text-lg font-bold text-foreground">
              {viewMode === 'mine' ? 'Nenhuma comunidade' : 'Nenhuma comunidade encontrada'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {viewMode === 'mine'
                ? 'Crie uma comunidade ou descubra comunidades públicas.'
                : searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhuma comunidade pública disponível.'}
            </p>
            {viewMode === 'mine' && (
              <Button variant="outline" className="mt-4 gap-1.5" onClick={() => setViewMode('discover')}>
                <Globe className="h-4 w-4" /> Descobrir comunidades
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {allCommunities.map(turma => (
              <CommunityCard
                key={turma.id}
                turma={turma}
                onClick={() => navigate(`/turmas/${turma.id}`)}
                isMine={myTurmaIds.has(turma.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Comunidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nome da comunidade" value={name} onChange={e => setName(e.target.value)} maxLength={60} />
            <div className="space-y-1">
              <Textarea
                placeholder="Descrição (opcional)"
                value={description}
                onChange={e => { if (e.target.value.length <= DESC_MAX) setDescription(e.target.value); }}
                maxLength={DESC_MAX}
              />
              <p className="text-[11px] text-muted-foreground text-right">{description.length}/{DESC_MAX}</p>
            </div>
            <Button onClick={handleCreate} disabled={!name.trim() || createTurma.isPending} className="w-full">
              {createTurma.isPending ? 'Criando...' : 'Criar Comunidade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join by Code Dialog */}
      <Dialog open={showJoin} onOpenChange={setShowJoin}>
        <DialogContent>
          <DialogHeader><DialogTitle>Entrar com código</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Código de convite" value={inviteCode} onChange={e => setInviteCode(e.target.value)} />
            <Button onClick={handleJoin} disabled={!inviteCode.trim() || joinTurma.isPending} className="w-full">
              {joinTurma.isPending ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Confirmation */}
      <LeaveConfirmDialog
        confirmLeave={confirmLeave}
        setConfirmLeave={setConfirmLeave}
        turmas={turmas}
        userId={user?.id}
        leaveTurma={leaveTurma}
        toast={toast}
      />
    </div>
  );
};

export default Turmas;
