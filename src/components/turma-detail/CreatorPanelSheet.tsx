/**
 * Creator Panel Sheet — shows stats and pending suggestions for a single community.
 * Opened from the admin config icon in TurmaSubHeader.
 */

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Users, DollarSign, Layers, MessageSquare, Check, X, Edit3,
  Loader2, BookOpen, TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PendingSuggestion {
  id: string;
  deck_id: string;
  card_id: string | null;
  suggester_name: string;
  rationale: string;
  suggested_content: { front_content?: string; back_content?: string };
  original_content: { front_content: string; back_content: string } | null;
  created_at: string;
  deck_name: string;
}

/* ── Stats Card ── */
const StatCard = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: string }) => (
  <Card>
    <CardContent className="flex items-center gap-3 p-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent ?? 'bg-primary/10'}`}>
        <Icon className={`h-4 w-4 ${accent ? 'text-white' : 'text-primary'}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

/* ── Diff Block ── */
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

/* ── Hook: community-scoped stats ── */
const useCommunityCreatorStats = (turmaId: string, enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['creator-community-stats', turmaId],
    queryFn: async () => {
      const { data: members } = await supabase.from('turma_members').select('is_subscriber').eq('turma_id', turmaId);
      const { data: tDecks } = await supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId);
      const deckIds = (tDecks ?? []).map((d: any) => d.deck_id);
      let totalCards = 0;
      let pendingSuggestions = 0;
      if (deckIds.length > 0) {
        const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', deckIds);
        totalCards = count ?? 0;
        const { count: sugCount } = await supabase.from('deck_suggestions').select('id', { count: 'exact', head: true }).in('deck_id', deckIds).eq('status', 'pending');
        pendingSuggestions = sugCount ?? 0;
      }
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const { data: revenue } = await supabase
        .from('community_revenue_logs').select('owner_amount')
        .eq('community_id', turmaId).gte('created_at', startOfMonth.toISOString());
      const monthlyRevenue = (revenue ?? []).reduce((sum: number, r: any) => sum + Number(r.owner_amount || 0), 0);
      return {
        memberCount: (members ?? []).length,
        subscriberCount: (members ?? []).filter((m: any) => m.is_subscriber).length,
        totalDecks: deckIds.length,
        totalCards,
        pendingSuggestions,
        monthlyRevenue,
      };
    },
    enabled: enabled && !!user,
  });
};

/* ── Hook: community-scoped suggestions ── */
const useCommunityPendingSuggestions = (turmaId: string, enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['creator-community-suggestions', turmaId],
    queryFn: async (): Promise<PendingSuggestion[]> => {
      if (!user) return [];
      const { data: tDecks } = await supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId);
      const deckIds = (tDecks ?? []).map((d: any) => d.deck_id);
      if (deckIds.length === 0) return [];
      const { data: suggestions } = await supabase.from('deck_suggestions').select('*').in('deck_id', deckIds).eq('status', 'pending').order('created_at', { ascending: false });
      if (!suggestions || suggestions.length === 0) return [];

      const suggesterIds = [...new Set(suggestions.map((s: any) => s.suggester_user_id))];
      const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: suggesterIds });
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

      const cardIds = suggestions.filter((s: any) => s.card_id).map((s: any) => s.card_id);
      let cardMap = new Map<string, { front_content: string; back_content: string }>();
      if (cardIds.length > 0) {
        const { data: cards } = await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds);
        (cards ?? []).forEach((c: any) => cardMap.set(c.id, { front_content: c.front_content, back_content: c.back_content }));
      }

      const { data: decks } = await supabase.from('decks').select('id, name').in('id', deckIds);
      const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));

      return suggestions.map((s: any) => ({
        id: s.id,
        deck_id: s.deck_id,
        card_id: s.card_id,
        suggester_name: profileMap.get(s.suggester_user_id) ?? 'Anônimo',
        rationale: s.rationale,
        suggested_content: s.suggested_content as any,
        original_content: s.card_id ? cardMap.get(s.card_id) ?? null : null,
        created_at: s.created_at,
        deck_name: deckMap.get(s.deck_id) ?? 'Deck',
      }));
    },
    enabled: enabled && !!user,
  });
};

/* ── Main Sheet ── */
interface CreatorPanelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmaId: string;
}

const CreatorPanelSheet = ({ open, onOpenChange, turmaId }: CreatorPanelSheetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats } = useCommunityCreatorStats(turmaId, open);
  const { data: suggestions = [], isLoading: loadingSuggestions } = useCommunityPendingSuggestions(turmaId, open);

  const [editMode, setEditMode] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PendingSuggestion | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, content }: { id: string; status: 'accepted' | 'rejected'; content?: { front_content: string; back_content: string } }) => {
      const updateData: any = { status, moderator_user_id: user!.id };
      if (content) updateData.suggested_content = content;
      const { error } = await supabase.from('deck_suggestions').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['creator-community-suggestions', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['creator-community-stats', turmaId] });
      toast({ title: vars.status === 'accepted' ? 'Sugestão aceita!' : 'Sugestão rejeitada' });
      setSelectedSuggestion(null);
      setEditMode(false);
    },
  });

  const handleAccept = (s: PendingSuggestion) => reviewMutation.mutate({ id: s.id, status: 'accepted' });
  const handleReject = (s: PendingSuggestion) => reviewMutation.mutate({ id: s.id, status: 'rejected' });
  const handleEditAndAccept = () => {
    if (!selectedSuggestion) return;
    reviewMutation.mutate({ id: selectedSuggestion.id, status: 'accepted', content: { front_content: editFront, back_content: editBack } });
  };
  const openEditMode = (s: PendingSuggestion) => {
    setSelectedSuggestion(s);
    setEditFront(s.suggested_content.front_content ?? s.original_content?.front_content ?? '');
    setEditBack(s.suggested_content.back_content ?? s.original_content?.back_content ?? '');
    setEditMode(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] flex flex-col rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> Painel do Criador
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={Users} label="Assinantes" value={stats?.subscriberCount ?? 0} />
              <StatCard icon={DollarSign} label="Receita" value={`R$${(stats?.monthlyRevenue ?? 0).toFixed(0)}`} accent="bg-green-600" />
              <StatCard icon={Layers} label="Decks" value={stats?.totalDecks ?? 0} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={BookOpen} label="Cards" value={stats?.totalCards ?? 0} />
              <StatCard icon={MessageSquare} label="Sugestões" value={stats?.pendingSuggestions ?? 0} accent={stats?.pendingSuggestions ? 'bg-amber-500' : undefined} />
              <StatCard icon={Users} label="Membros" value={stats?.memberCount ?? 0} />
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Sugestões Pendentes
                {(stats?.pendingSuggestions ?? 0) > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px]">{stats?.pendingSuggestions}</Badge>
                )}
              </h3>

              {loadingSuggestions ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : suggestions.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma sugestão pendente</p>
                </div>
              ) : (
                suggestions.map((s) => (
                  <Card key={s.id}>
                    <CardHeader className="pb-2 p-3">
                      <CardTitle className="text-sm font-medium">{s.deck_name}</CardTitle>
                      <CardDescription className="text-[11px]">
                        por {s.suggester_name} · {formatDistanceToNow(new Date(s.created_at), { locale: ptBR, addSuffix: true })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 p-3 pt-0">
                      <DiffBlock label="Frente" original={s.original_content?.front_content} suggested={s.suggested_content.front_content} />
                      <DiffBlock label="Verso" original={s.original_content?.back_content} suggested={s.suggested_content.back_content} />
                      {s.rationale && (
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Justificativa</p>
                          <p className="text-xs text-foreground">{s.rationale}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => handleAccept(s)} disabled={reviewMutation.isPending}>
                          <Check className="h-3 w-3" /> Aceitar
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => openEditMode(s)} disabled={reviewMutation.isPending}>
                          <Edit3 className="h-3 w-3" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs text-destructive" onClick={() => handleReject(s)} disabled={reviewMutation.isPending}>
                          <X className="h-3 w-3" /> Rejeitar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit & Accept Dialog */}
      <Dialog open={editMode} onOpenChange={(o) => { if (!o) { setEditMode(false); setSelectedSuggestion(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar e Aceitar</DialogTitle></DialogHeader>
          <CardEditorForm
            front={editFront}
            onFrontChange={setEditFront}
            back={editBack}
            onBackChange={setEditBack}
            onSave={handleEditAndAccept}
            onCancel={() => setEditMode(false)}
            isSaving={reviewMutation.isPending}
            compact
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreatorPanelSheet;
