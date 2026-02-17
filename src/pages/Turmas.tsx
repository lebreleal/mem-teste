import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTurmas, useDiscoverTurmas, type Turma } from '@/hooks/useTurmas';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  ArrowLeft, Plus, Users, Copy, LogIn, Crown, Search,
  UserPlus, Globe, Lock, ChevronRight, Star,
} from 'lucide-react';
import CommunityPreviewSheet from '@/components/community/CommunityPreviewSheet';
import LeaveConfirmDialog from '@/components/community/LeaveConfirmDialog';

const DESC_MAX = 2000;

const RatingStars = ({ rating, count }: { rating: number; count: number }) => {
  if (count === 0) return <span className="text-[11px] text-muted-foreground">Sem nota</span>;
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <Star className="h-3 w-3 text-warning fill-warning" />
      <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
};

const Turmas = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { turmas, isLoading, createTurma, joinTurma, joinTurmaById, leaveTurma } = useTurmas();

  // Communities now open for everyone - no admin gate

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('mine');
  const [previewTurma, setPreviewTurma] = useState<(Turma & { member_count: number; owner_name: string }) | null>(null);

  const { data: discoverTurmas, isLoading: discoverLoading } = useDiscoverTurmas(discoverSearch);

  const myTurmaIds = new Set(turmas.map(t => t.id));
  const discoverFiltered = (discoverTurmas ?? []).filter(t => !myTurmaIds.has(t.id));

  const filteredTurmas = turmas.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const handleJoinById = (turmaId: string) => {
    joinTurmaById.mutate(turmaId, {
      onSuccess: () => {
        toast({ title: 'Entrou na comunidade!' });
        setPreviewTurma(null);
        setActiveTab('mine');
      },
      onError: (e) => toast({ title: e.message || 'Erro', variant: 'destructive' }),
    });
  };

  const openPreview = (turma: Turma & { member_count: number; owner_name: string }) => {
    setPreviewTurma(turma);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Comunidades</h1>
              <p className="text-[10px] text-muted-foreground">Estude junto com outras pessoas</p>
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

      <main className="container mx-auto px-4 py-5 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
            <TabsTrigger value="mine" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
              <Users className="h-3.5 w-3.5" /> Minhas
            </TabsTrigger>
            <TabsTrigger value="discover" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
              <Globe className="h-3.5 w-3.5" /> Descobrir
            </TabsTrigger>
          </TabsList>

          {/* ─── My Communities ─── */}
          <TabsContent value="mine" className="space-y-3">
            {turmas.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar comunidades..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
            ) : filteredTurmas.length === 0 && turmas.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h2 className="font-display text-xl font-bold text-foreground">Nenhuma comunidade</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Crie uma comunidade, entre com um código ou descubra comunidades públicas.
                </p>
                <Button variant="outline" className="mt-4 gap-1.5" onClick={() => setActiveTab('discover')}>
                  <Globe className="h-4 w-4" /> Descobrir comunidades
                </Button>
              </div>
            ) : filteredTurmas.length === 0 ? (
              <div className="rounded-2xl border border-border/40 bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma comunidade encontrada para "{searchQuery}"</p>
              </div>
            ) : (
              filteredTurmas.map(turma => (
                <div
                  key={turma.id}
                  className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card px-4 py-4 cursor-pointer hover:border-primary/20 hover:shadow-md transition-all"
                  onClick={() => navigate(`/turmas/${turma.id}`)}
                >
                  {turma.cover_image_url ? (
                    <div className="h-12 w-12 shrink-0 rounded-2xl overflow-hidden">
                      <img src={turma.cover_image_url} alt={turma.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-display font-semibold text-foreground truncate">{turma.name}</h3>
                      {turma.owner_id === user?.id && <Crown className="h-3.5 w-3.5 text-warning shrink-0" />}
                    </div>
                    {turma.description && <p className="text-xs text-muted-foreground line-clamp-1">{turma.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <RatingStars rating={Number(turma.avg_rating ?? 0)} count={turma.rating_count ?? 0} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        navigator.clipboard.writeText(turma.invite_code);
                        toast({ title: 'Código copiado!', description: turma.invite_code });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setConfirmLeave(turma.id)}
                    >
                      <LogIn className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))
            )}
          </TabsContent>

          {/* ─── Discover Communities ─── */}
          <TabsContent value="discover" className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar comunidades públicas..."
                value={discoverSearch}
                onChange={e => setDiscoverSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {discoverLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
            ) : discoverFiltered.length === 0 ? (
              <div className="rounded-2xl border border-border/40 bg-card p-10 text-center">
                <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {discoverSearch ? `Nenhuma comunidade encontrada para "${discoverSearch}"` : 'Nenhuma comunidade pública disponível no momento.'}
                </p>
              </div>
            ) : (
              discoverFiltered.map(turma => (
                <div
                  key={turma.id}
                  className="flex items-center gap-4 rounded-2xl border border-border/40 bg-card px-4 py-4 transition-all hover:border-primary/20 hover:shadow-md cursor-pointer"
                  onClick={() => openPreview(turma)}
                >
                  {(turma as any).cover_image_url ? (
                    <div className="h-12 w-12 shrink-0 rounded-2xl overflow-hidden">
                      <img src={(turma as any).cover_image_url} alt={turma.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/50">
                      <Users className="h-5 w-5 text-accent-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-foreground truncate">{turma.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <RatingStars rating={Number(turma.avg_rating ?? 0)} count={turma.rating_count ?? 0} />
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {turma.member_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Crown className="h-3 w-3 text-warning" /> {turma.owner_name}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Community Preview Sheet */}
      <CommunityPreviewSheet
        turma={previewTurma}
        open={!!previewTurma}
        onOpenChange={open => !open && setPreviewTurma(null)}
        onJoin={handleJoinById}
        isJoining={joinTurmaById.isPending}
        isMember={previewTurma ? myTurmaIds.has(previewTurma.id) : false}
        onNavigate={(id) => navigate(`/turmas/${id}`)}
      />

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
