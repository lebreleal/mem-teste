import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorCommunities, useCreatorStats, usePendingSuggestions, type PendingSuggestion } from '@/hooks/useCreatorPanel';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewSuggestion } from '@/services/adminService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, Users, DollarSign, Layers, MessageSquare, Check, X, Edit3,
  Loader2, TrendingUp, BookOpen, AlertCircle, Star, ExternalLink
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/* ── Stats Cards ── */
const StatCard = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: string }) => (
  <Card>
    <CardContent className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent ?? 'bg-primary/10'}`}>
        <Icon className={`h-5 w-5 ${accent ? 'text-white' : 'text-primary'}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

/* ── Suggestion Diff ── */
const DiffBlock = ({ label, original, suggested }: { label: string; original?: string; suggested?: string }) => {
  if (!suggested && !original) return null;
  const changed = original !== suggested;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {original && changed && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm line-through text-muted-foreground" dangerouslySetInnerHTML={{ __html: original }} />
      )}
      {suggested && (
        <div className={`rounded-md border p-2 text-sm ${changed ? 'border-green-500/30 bg-green-500/5' : 'border-border'}`} dangerouslySetInnerHTML={{ __html: suggested }} />
      )}
    </div>
  );
};

/* ── Main Page ── */
const CreatorPanel = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: communities = [], isLoading: loadingCommunities } = useCreatorCommunities();
  const { data: stats } = useCreatorStats();
  const { data: suggestions = [], isLoading: loadingSuggestions } = usePendingSuggestions();

  const [selectedSuggestion, setSelectedSuggestion] = useState<PendingSuggestion | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, content }: { id: string; status: 'accepted' | 'rejected'; content?: { front_content: string; back_content: string } }) => {
      await reviewSuggestion(id, status, user!.id, content);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['creator-pending-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['creator-stats'] });
      queryClient.invalidateQueries({ queryKey: ['creator-communities'] });
      toast({ title: vars.status === 'accepted' ? 'Sugestão aceita!' : 'Sugestão rejeitada' });
      setSelectedSuggestion(null);
      setEditMode(false);
    },
  });

  const handleAccept = (s: PendingSuggestion) => {
    reviewMutation.mutate({ id: s.id, status: 'accepted' });
  };

  const handleReject = (s: PendingSuggestion) => {
    reviewMutation.mutate({ id: s.id, status: 'rejected' });
  };

  const handleEditAndAccept = () => {
    if (!selectedSuggestion) return;
    reviewMutation.mutate({
      id: selectedSuggestion.id,
      status: 'accepted',
      content: { front_content: editFront, back_content: editBack },
    });
  };

  const openEditMode = (s: PendingSuggestion) => {
    setSelectedSuggestion(s);
    setEditFront(s.suggested_content.front_content ?? s.original_content?.front_content ?? '');
    setEditBack(s.suggested_content.back_content ?? s.original_content?.back_content ?? '');
    setEditMode(true);
  };

  if (loadingCommunities) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (communities.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto flex items-center gap-3 px-4 py-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-display text-xl font-bold">Painel do Criador</h1>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">Você ainda não criou nenhuma comunidade</p>
          <p className="text-sm text-muted-foreground">Crie uma comunidade para acessar o painel do criador.</p>
          <Button onClick={() => navigate('/turmas')}>Ir para Comunidades</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-xl font-bold">Painel do Criador</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={Users} label="Assinantes" value={stats?.totalSubscribers ?? 0} />
          <StatCard icon={DollarSign} label="Receita Mensal" value={`R$ ${(stats?.monthlyRevenue ?? 0).toFixed(2)}`} accent="bg-green-600" />
          <StatCard icon={Layers} label="Decks" value={stats?.totalDecks ?? 0} />
          <StatCard icon={BookOpen} label="Cards" value={stats?.totalCards ?? 0} />
          <StatCard icon={MessageSquare} label="Sugestões Pendentes" value={stats?.pendingSuggestions ?? 0} accent={stats?.pendingSuggestions ? 'bg-amber-500' : undefined} />
          <StatCard icon={TrendingUp} label="Comunidades" value={stats?.totalCommunities ?? 0} />
        </div>

        <Tabs defaultValue="communities" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="communities" className="flex-1">Comunidades</TabsTrigger>
            <TabsTrigger value="suggestions" className="flex-1 gap-1.5">
              Sugestões
              {(stats?.pendingSuggestions ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{stats?.pendingSuggestions}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Communities Tab ── */}
          <TabsContent value="communities" className="space-y-3 mt-4">
            {communities.map((c) => (
              <Card key={c.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate(`/turmas/${c.id}`)}>
                <CardContent className="flex items-center gap-4 p-4">
                  {c.cover_image_url ? (
                    <img src={c.cover_image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                      <Star className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-foreground truncate">{c.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{c.member_count} membros</span>
                      <span>{c.subscriber_count} assinantes</span>
                      <span>{c.deck_count} decks</span>
                    </div>
                    {c.pending_suggestions > 0 && (
                      <Badge variant="outline" className="mt-1 text-amber-600 border-amber-500/30 text-[10px]">
                        {c.pending_suggestions} sugestões pendentes
                      </Badge>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Suggestions Tab ── */}
          <TabsContent value="suggestions" className="space-y-3 mt-4">
            {loadingSuggestions ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma sugestão pendente</p>
              </div>
            ) : (
              suggestions.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-medium">{s.deck_name}</CardTitle>
                        <CardDescription className="text-xs">
                          {s.community_name} · por {s.suggester_name} · {formatDistanceToNow(new Date(s.created_at), { locale: ptBR, addSuffix: true })}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DiffBlock label="Frente" original={s.original_content?.front_content} suggested={s.suggested_content.front_content} />
                    <DiffBlock label="Verso" original={s.original_content?.back_content} suggested={s.suggested_content.back_content} />

                    {s.rationale && (
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Justificativa</p>
                        <p className="text-sm text-foreground">{s.rationale}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" className="gap-1.5" onClick={() => handleAccept(s)} disabled={reviewMutation.isPending}>
                        <Check className="h-3.5 w-3.5" /> Aceitar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEditMode(s)} disabled={reviewMutation.isPending}>
                        <Edit3 className="h-3.5 w-3.5" /> Editar e Aceitar
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => handleReject(s)} disabled={reviewMutation.isPending}>
                        <X className="h-3.5 w-3.5" /> Rejeitar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Edit & Accept Dialog ── */}
      <Dialog open={editMode} onOpenChange={(o) => { if (!o) { setEditMode(false); setSelectedSuggestion(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar e Aceitar Sugestão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Frente</label>
              <Textarea value={editFront} onChange={(e) => setEditFront(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Verso</label>
              <Textarea value={editBack} onChange={(e) => setEditBack(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
            <Button onClick={handleEditAndAccept} disabled={reviewMutation.isPending} className="gap-1.5">
              {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Aceitar com Edição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreatorPanel;
