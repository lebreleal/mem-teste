/**
 * PublicCommunity — Public preview page for a community.
 * Accessible without authentication via /c/:slugOrId
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Layers, Users, Star, BookOpen, ArrowLeft, LogIn, Loader2,
  ChevronRight, Clock, Folder,
} from 'lucide-react';
import MemoCardsLogo from '@/components/MemoCardsLogo';

const formatRelativeTime = (dateStr: string) => {
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); } catch { return ''; }
};

const PublicCommunity = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch turma by slug or ID
  const { data: turma, isLoading } = useQuery({
    queryKey: ['public-community', slugOrId],
    queryFn: async () => {
      // Try slug first
      const { data: bySlug } = await supabase
        .from('turmas')
        .select('*')
        .eq('share_slug', slugOrId!)
        .maybeSingle();
      if (bySlug) return bySlug;
      // Fallback to ID
      const { data: byId } = await supabase
        .from('turmas')
        .select('*')
        .eq('id', slugOrId!)
        .maybeSingle();
      return byId;
    },
    enabled: !!slugOrId,
  });

  // Fetch owner name
  const { data: ownerProfile } = useQuery({
    queryKey: ['public-community-owner', turma?.owner_id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('name').eq('id', turma!.owner_id).single();
      return data;
    },
    enabled: !!turma?.owner_id,
  });

  // Fetch published decks
  const { data: decks = [] } = useQuery({
    queryKey: ['public-community-decks', turma?.id],
    queryFn: async () => {
      const { data: tDecks } = await supabase
        .from('turma_decks')
        .select('id, deck_id, created_at, shared_by, is_published')
        .eq('turma_id', turma!.id)
        .eq('is_published', true);
      if (!tDecks || tDecks.length === 0) return [];

      const deckIds = tDecks.map((d: any) => d.deck_id);
      const { data: deckInfo } = await supabase
        .from('decks')
        .select('id, name')
        .in('id', deckIds);
      const nameMap = new Map((deckInfo ?? []).map((d: any) => [d.id, d.name]));

      const sharerIds = [...new Set(tDecks.map((d: any) => d.shared_by).filter(Boolean))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sharerIds);
      const sharerMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]));

      const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
      const countMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));

      return tDecks.map((td: any) => ({
        ...td,
        deck_name: nameMap.get(td.deck_id) || 'Sem nome',
        card_count: countMap.get(td.deck_id) ?? 0,
        shared_by_name: sharerMap.get(td.shared_by) || null,
      }));
    },
    enabled: !!turma?.id,
  });

  // Fetch subjects (folders)
  const { data: subjects = [] } = useQuery({
    queryKey: ['public-community-subjects', turma?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('turma_subjects')
        .select('id, name, parent_id')
        .eq('turma_id', turma!.id)
        .order('sort_order', { ascending: true });
      return data ?? [];
    },
    enabled: !!turma?.id,
  });

  // Member count
  const { data: memberCount = 0 } = useQuery({
    queryKey: ['public-community-members', turma?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('turma_members')
        .select('id', { count: 'exact', head: true })
        .eq('turma_id', turma!.id);
      return count ?? 0;
    },
    enabled: !!turma?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!turma) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <MemoCardsLogo size={48} />
        <h1 className="font-display text-xl font-bold text-foreground">Comunidade não encontrada</h1>
        <p className="text-sm text-muted-foreground text-center">Esse link pode estar incorreto ou a comunidade foi removida.</p>
        <Button onClick={() => navigate('/')}>Ir para o início</Button>
      </div>
    );
  }

  const rootSubjects = subjects.filter((s: any) => !s.parent_id);
  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum: number, d: any) => sum + (d.card_count || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <MemoCardsLogo size={28} />
          <span className="font-display font-bold text-foreground truncate flex-1">{turma.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Cover */}
        {turma.cover_image_url && (
          <div className="rounded-2xl overflow-hidden h-40 sm:h-52 bg-muted">
            <img src={turma.cover_image_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Info */}
        <div className="space-y-3">
          <h1 className="font-display text-2xl font-bold text-foreground">{turma.name}</h1>
          {turma.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{turma.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {ownerProfile?.name && (
              <span className="flex items-center gap-1">
                por <span className="font-medium text-foreground">{ownerProfile.name}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {memberCount} membros
            </span>
            {turma.avg_rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-warning fill-warning" /> {Number(turma.avg_rating).toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <Layers className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xl font-bold text-foreground">{totalDecks}</p>
              <p className="text-[11px] text-muted-foreground">Decks</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <BookOpen className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xl font-bold text-foreground">{totalCards}</p>
              <p className="text-[11px] text-muted-foreground">Cartões</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <Folder className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xl font-bold text-foreground">{rootSubjects.length}</p>
              <p className="text-[11px] text-muted-foreground">Pastas</p>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 text-center space-y-3">
            {user ? (
              <>
                <p className="text-sm font-medium text-foreground">Quer acessar esses decks?</p>
                <Button className="w-full" onClick={() => navigate(`/turmas/${turma.id}`)}>
                  <BookOpen className="mr-2 h-4 w-4" /> Entrar na comunidade
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">Crie sua conta gratuita para acessar</p>
                <Button className="w-full" onClick={() => navigate('/auth', { state: { from: `/c/${slugOrId}` } })}>
                  <LogIn className="mr-2 h-4 w-4" /> Criar conta e entrar
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Decks list */}
        {decks.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-display text-lg font-bold text-foreground">Decks disponíveis</h2>
            <div className="space-y-1.5">
              {decks.map((td: any) => (
                <div
                  key={td.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{td.deck_name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      {td.shared_by_name && (
                        <span>por <span className="font-medium text-foreground">{td.shared_by_name}</span></span>
                      )}
                      {td.created_at && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3 shrink-0" /> {formatRelativeTime(td.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3 shrink-0" /> {td.card_count}
                      </span>
                    </div>
                  </div>
                  {user ? (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/turmas/${turma.id}`)}>
                      Ver deck
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/auth', { state: { from: `/c/${slugOrId}` } })}>
                      <LogIn className="mr-1.5 h-3.5 w-3.5" /> Entrar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Folders */}
        {rootSubjects.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-display text-lg font-bold text-foreground">Conteúdo</h2>
            <div className="space-y-1.5">
              {rootSubjects.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate flex-1">{s.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicCommunity;
