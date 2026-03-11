/**
 * PublicCommunity — Full browsable public preview of a community.
 * Accessible without authentication via /c/:slugOrId
 * Users can browse decks, preview cards, but interactions prompt login.
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sanitizeHtml } from '@/lib/sanitize';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Layers, Users, Star, BookOpen, ArrowLeft, LogIn, Loader2,
  ChevronRight, Clock, Folder, FolderOpen, Crown, Globe,
  UserPlus, Lock, Sparkles,
} from 'lucide-react';
import MemoCardsLogo from '@/components/MemoCardsLogo';

const formatRelativeTime = (dateStr: string) => {
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); } catch { return ''; }
};

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

/* ── Card Preview Sheet (read-only) ── */
const CardPreviewSheet = ({ open, onOpenChange, deckId, deckName }: {
  open: boolean; onOpenChange: (v: boolean) => void; deckId: string; deckName: string;
}) => {
  const isMobile = useIsMobile();
  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['public-deck-cards', deckId],
    queryFn: async () => {
      const { data } = await supabase.from('cards').select('id, front_content, back_content, card_type').eq('deck_id', deckId).limit(50);
      return data ?? [];
    },
    enabled: open && !!deckId,
  });

  const content = (
    <div className="space-y-3 p-1">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : cards.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum cartão neste deck</p>
      ) : (
        cards.map((card: any) => (
          <div key={card.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Frente</p>
              <div className="text-sm text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front_content) }} />
            </div>
            <div className="border-t border-border/50 pt-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Verso</p>
              <div className="text-sm text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back_content) }} />
            </div>
          </div>
        ))
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader><DrawerTitle className="truncate">{deckName}</DrawerTitle></DrawerHeader>
          <ScrollArea className="flex-1 px-4 pb-6">{content}</ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader><SheetTitle className="truncate">{deckName}</SheetTitle></SheetHeader>
        <ScrollArea className="flex-1 mt-4">{content}</ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

/* ── Auth Gate Dialog ── */
const AuthGatePrompt = ({ open, onOpenChange, slugOrId }: {
  open: boolean; onOpenChange: (v: boolean) => void; slugOrId: string;
}) => {
  const navigate = useNavigate();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-2">
          <MemoCardsLogo size={36} />
          <h3 className="font-display text-lg font-bold text-foreground">Crie sua conta gratuita</h3>
          <p className="text-sm text-muted-foreground">Para interagir com esta comunidade, você precisa de uma conta.</p>
        </div>
        <Button className="w-full" onClick={() => navigate('/auth', { state: { from: `/c/${slugOrId}` } })}>
          <LogIn className="mr-2 h-4 w-4" /> Criar conta e entrar
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          Continuar navegando
        </Button>
      </div>
    </div>
  );
};

/* ── Main Page ── */
const PublicCommunity = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [previewDeck, setPreviewDeck] = useState<{ id: string; name: string } | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Fetch turma by slug or ID
  const { data: turma, isLoading } = useQuery({
    queryKey: ['public-community', slugOrId],
    queryFn: async () => {
      const { data: bySlug } = await supabase.from('turmas').select('*').eq('share_slug', slugOrId!).maybeSingle();
      if (bySlug) return bySlug;
      const { data: byId } = await supabase.from('turmas').select('*').eq('id', slugOrId!).maybeSingle();
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
        .select('id, deck_id, created_at, shared_by, is_published, subject_id')
        .eq('turma_id', turma!.id)
        .eq('is_published', true);
      if (!tDecks || tDecks.length === 0) return [];

      const deckIds = tDecks.map((d: any) => d.deck_id);
      const { data: deckInfo } = await supabase.from('decks').select('id, name').in('id', deckIds);
      const nameMap = new Map((deckInfo ?? []).map((d: any) => [d.id, d.name]));

      const sharerIds = [...new Set(tDecks.map((d: any) => d.shared_by).filter(Boolean))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sharerIds.length > 0 ? sharerIds : ['__none__']);
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

  // Navigation
  const currentFolders = useMemo(() => {
    return subjects.filter((s: any) => (s.parent_id ?? null) === currentFolderId);
  }, [subjects, currentFolderId]);

  const currentDecks = useMemo(() => {
    return decks.filter((d: any) => (d.subject_id ?? null) === currentFolderId);
  }, [decks, currentFolderId]);

  const breadcrumb = useMemo(() => {
    const trail: { id: string | null; name: string }[] = [{ id: null, name: 'Conteúdo' }];
    let cur = currentFolderId;
    const items: { id: string; name: string }[] = [];
    while (cur) {
      const s = subjects.find((s: any) => s.id === cur);
      if (!s) break;
      items.unshift({ id: s.id, name: s.name });
      cur = s.parent_id;
    }
    return [...trail, ...items];
  }, [currentFolderId, subjects]);

  const countDecksInFolder = (folderId: string): number => {
    const direct = decks.filter((d: any) => d.subject_id === folderId).length;
    const childFolders = subjects.filter((s: any) => s.parent_id === folderId);
    return direct + childFolders.reduce((sum: number, cf: any) => sum + countDecksInFolder(cf.id), 0);
  };

  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum: number, d: any) => sum + (d.card_count || 0), 0);

  const handleInteraction = () => {
    if (!user) { setShowAuthGate(true); return false; }
    return true;
  };

  const handleDeckClick = (td: any) => {
    setPreviewDeck({ id: td.deck_id, name: td.deck_name });
  };

  const handleJoin = () => {
    if (!user) { setShowAuthGate(true); return; }
    navigate(`/turmas/${turma!.id}`);
  };

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

  const isRoot = currentFolderId === null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative">
        <div className="h-40 sm:h-52 bg-muted/30 overflow-hidden">
          {turma.cover_image_url ? (
            <img src={turma.cover_image_url} alt={turma.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/15 to-primary/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/60 backdrop-blur-sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 mx-auto max-w-2xl">
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">Comunidade Pública</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-foreground">{turma.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                {ownerProfile?.name && (
                  <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-warning" /> {ownerProfile.name}</span>
                )}
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {memberCount} membros</span>
                {turma.avg_rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-warning fill-warning" /> {Number(turma.avg_rating).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mx-auto max-w-2xl px-4 py-4">
        <Button className="w-full gap-2" size="lg" onClick={handleJoin}>
          <UserPlus className="h-4 w-4" />
          {user ? 'Entrar na comunidade' : 'Criar conta e entrar'}
        </Button>
      </div>

      <main className="mx-auto max-w-2xl px-4 pb-10 space-y-5">
        {/* Description */}
        {turma.description && (
          <div className="rounded-2xl border border-border/40 bg-card p-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{turma.description}</p>
          </div>
        )}

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
              <Users className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xl font-bold text-foreground">{memberCount}</p>
              <p className="text-[11px] text-muted-foreground">Membros</p>
            </CardContent>
          </Card>
        </div>

        {/* Breadcrumb */}
        {!isRoot && (
          <div className="flex items-center gap-1.5 text-sm">
            {breadcrumb.map((item, idx) => (
              <span key={item.id ?? 'root'} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <button
                  onClick={() => setCurrentFolderId(item.id)}
                  className={`hover:text-primary transition-colors ${idx === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Back button when inside folder */}
        {!isRoot && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => {
            const cur = subjects.find((s: any) => s.id === currentFolderId);
            setCurrentFolderId(cur?.parent_id ?? null);
          }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        )}

        {/* Folders */}
        {currentFolders.length > 0 && (
          <div className="space-y-1.5">
            {currentFolders.map((s: any) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setCurrentFolderId(s.id)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <Folder className="h-4 w-4 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground truncate">{s.name}</h3>
                  <span className="text-[11px] text-muted-foreground">{countDecksInFolder(s.id)} decks</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Decks */}
        {currentDecks.length > 0 && (
          <div className="space-y-1.5">
            {!isRoot && <h2 className="font-display text-sm font-bold text-foreground">Decks</h2>}
            {isRoot && <h2 className="font-display text-lg font-bold text-foreground">Decks disponíveis</h2>}
            {currentDecks.map((td: any) => (
              <div
                key={td.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => handleDeckClick(td)}
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
                      <Layers className="h-3 w-3 shrink-0" /> {td.card_count} cartões
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {currentFolders.length === 0 && currentDecks.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {isRoot ? 'Nenhum conteúdo nesta comunidade ainda' : 'Pasta vazia'}
            </p>
          </div>
        )}
      </main>

      {/* Card Preview Sheet */}
      {previewDeck && (
        <CardPreviewSheet
          open={!!previewDeck}
          onOpenChange={v => { if (!v) setPreviewDeck(null); }}
          deckId={previewDeck.id}
          deckName={previewDeck.name}
        />
      )}

      {/* Auth Gate */}
      <AuthGatePrompt open={showAuthGate} onOpenChange={setShowAuthGate} slugOrId={slugOrId!} />
    </div>
  );
};

export default PublicCommunity;
