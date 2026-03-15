import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import * as deckService from '@/services/deckService';
import { useAuth } from '@/hooks/useAuth';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft, ChevronRight, Layers, Zap, Volume2, Palette,
  Share2, Store, Sparkles, Download, Edit3, FolderInput, Copy,
  RotateCcw, Archive, Upload, Trash2, Loader2, Plus, X,
  Shuffle, BookOpen, Mail, Globe, BarChart3, Settings,
} from 'lucide-react';
import { DeckStatsTab } from '@/components/deck-detail/DeckStatsTab';
import ankiLogo from '@/assets/anki-logo.svg';
import { exportAsApkg } from '@/lib/ankiExport';
import DeckSettingsModals from '@/pages/DeckSettingsModals';

// ── Settings row component ──────────────────────────────────────
interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  rightContent?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

const SettingsRow = ({ icon, label, subtitle, rightContent, onClick, destructive, disabled }: SettingsRowProps) => (
  <button
    className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed ${
      destructive ? 'text-destructive' : ''
    }`}
    onClick={onClick}
    disabled={disabled}
    type="button"
  >
    <span className={`shrink-0 ${destructive ? 'text-destructive' : 'text-muted-foreground'}`}>{icon}</span>
    <div className="flex-1 min-w-0">
      <p className={`font-medium text-sm ${destructive ? 'text-destructive' : 'text-foreground'}`}>{label}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {rightContent ?? (onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />)}
  </button>
);

// ── Settings group component ────────────────────────────────────
const SettingsGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
    {children}
  </div>
);

// ── Main Component ──────────────────────────────────────────────
const DeckSettings = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { duplicateDeck, archiveDeck, decks } = useDecks();
  const queryClient = useQueryClient();

  // Deck data
  const [name, setName] = useState('');
  const [dailyNewLimit, setDailyNewLimit] = useState(20);
  const [dailyReviewLimit, setDailyReviewLimit] = useState(100);
  const [algorithmMode, setAlgorithmMode] = useState<'fsrs' | 'quick_review'>('fsrs');
  const [requestedRetention, setRequestedRetention] = useState(0.85);
  const [shuffleCards, setShuffleCards] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [allowDuplication, setAllowDuplication] = useState(false);
  const [learningSteps, setLearningSteps] = useState<string[]>(['1m', '10m']);
  const [easyBonus, setEasyBonus] = useState(130);
  const [intervalModifier, setIntervalModifier] = useState(100);
  const [maxInterval, setMaxInterval] = useState(1000);
  const [easyGraduatingInterval, setEasyGraduatingInterval] = useState(15);
  const [buryNewSiblings, setBuryNewSiblings] = useState(true);
  const [buryReviewSiblings, setBuryReviewSiblings] = useState(true);
  const [buryLearningSiblings, setBuryLearningSiblings] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentDeckId, setParentDeckId] = useState<string | null>(null);
  const [sourceTurmaDeckId, setSourceTurmaDeckId] = useState<string | null>(null);
  const [sourceListingId, setSourceListingId] = useState<string | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);

  // Modals
  const [algorithmModal, setAlgorithmModal] = useState(false);
  const [studySettingsModal, setStudySettingsModal] = useState(false);
  const [advancedModal, setAdvancedModal] = useState(false);
  const [renameModal, setRenameModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingAnki, setExportingAnki] = useState(false);
  const [detachConfirm, setDetachConfirm] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [algorithmChangeTarget, setAlgorithmChangeTarget] = useState<'fsrs' | 'quick_review' | null>(null);

  const studyPlansQuery = useQuery({
    queryKey: ['study-plans-lock', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plans')
        .select('deck_ids')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ deck_ids: string[] | null }>;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const getRootAncestorId = useMemo(() => {
    return (id: string): string => {
      const visited = new Set<string>();
      let currentId: string = id;
      while (true) {
        if (visited.has(currentId)) return currentId;
        visited.add(currentId);
        const deck = decks.find(d => d.id === currentId);
        if (!deck?.parent_deck_id) return currentId;
        currentId = deck.parent_deck_id;
      }
    };
  }, [decks]);

  const objectiveRootIds = useMemo(() => {
    const roots = new Set<string>();
    for (const plan of studyPlansQuery.data ?? []) {
      for (const id of (plan.deck_ids ?? [])) {
        roots.add(getRootAncestorId(id));
      }
    }
    return roots;
  }, [studyPlansQuery.data, getRootAncestorId]);

  const currentDeckRootId = useMemo(() => {
    if (!deckId) return null;
    return getRootAncestorId(deckId);
  }, [deckId, getRootAncestorId]);

  const isDeckLockedByObjective = useMemo(() => {
    if (!currentDeckRootId) return false;
    return objectiveRootIds.has(currentDeckRootId);
  }, [objectiveRootIds, currentDeckRootId]);

  useEffect(() => {
    if (!deckId || !user) return;
    supabase.from('decks').select('*').eq('id', deckId).single().then(({ data, error }) => {
      if (error || !data) {
        toast({ title: 'Erro', description: 'Baralho não encontrado.', variant: 'destructive' });
        navigate('/dashboard');
        return;
      }
      setName(data.name);
      setDailyNewLimit(data.daily_new_limit);
      setDailyReviewLimit(data.daily_review_limit);
      setAlgorithmMode(data.algorithm_mode === 'quick_review' ? 'quick_review' : 'fsrs');
      setRequestedRetention((data as any).requested_retention ?? 0.85);
      setShuffleCards(data.shuffle_cards ?? true);
      setLearningSteps(data.learning_steps || ['1m', '10m']);
      setEasyBonus(data.easy_bonus ?? 130);
      setIntervalModifier(data.interval_modifier ?? 100);
      setMaxInterval(data.max_interval ?? 1000);
      setEasyGraduatingInterval((data as any).easy_graduating_interval ?? 15);
      setParentDeckId(data.parent_deck_id ?? null);
      setIsPublic((data as any).is_public ?? true);
      setAllowDuplication((data as any).allow_duplication ?? false);
      setSourceTurmaDeckId(data.source_turma_deck_id ?? null);
      setSourceListingId((data as any).source_listing_id ?? null);
      setCommunityId((data as any).community_id ?? null);
      setBuryNewSiblings((data as any).bury_new_siblings !== false);
      setBuryReviewSiblings((data as any).bury_review_siblings !== false);
      setBuryLearningSiblings((data as any).bury_learning_siblings !== false);
      setLoading(false);
    });
  }, [deckId, user]);

  // ── Handlers ────────────────────────────────────────────────
  const saveSettings = async (updates: Record<string, any>) => {
    if (!deckId) return;
    setSaving(true);
    const { error } = await supabase.from('decks').update(updates as any).eq('id', deckId);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } else {
      toast({ title: 'Salvo!' });
      queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['study-queue', deckId] });
      queryClient.invalidateQueries({ queryKey: ['deck-stats', deckId] });
    }
  };

  const handleSaveStudySettings = () => {
    if (isDeckLockedByObjective) {
      toast({
        title: 'Bloqueado pelo Meu Plano',
        description: 'Remova este baralho dos objetivos em Meu Plano para editar os limites diários.',
        variant: 'destructive',
      });
      setStudySettingsModal(false);
      setAdvancedModal(false);
      return;
    }

    saveSettings({
      daily_new_limit: dailyNewLimit,
      daily_review_limit: dailyReviewLimit,
      shuffle_cards: shuffleCards,
      learning_steps: learningSteps,
      easy_bonus: easyBonus,
      interval_modifier: intervalModifier,
      max_interval: maxInterval,
      easy_graduating_interval: easyGraduatingInterval,
      requested_retention: requestedRetention,
      bury_new_siblings: buryNewSiblings,
      bury_review_siblings: buryReviewSiblings,
      bury_learning_siblings: buryLearningSiblings,
    } as any);
    setStudySettingsModal(false);
    setAdvancedModal(false);
  };

  const handleRename = () => {
    if (!name.trim()) return;
    saveSettings({ name: name.trim() });
    setRenameModal(false);
  };

  const handleResetProgress = async () => {
    if (!deckId) return;
    try {
      await deckService.resetDeckProgress(deckId);
      toast({ title: 'Progresso redefinido!' });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['study-queue'] });
      queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
      queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
    setResetConfirm(false);
  };

  const handleDelete = async () => {
    if (!deckId) return;
    const { error } = await supabase.from('decks').delete().eq('id', deckId);
    if (error) {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    } else {
      toast({ title: 'Baralho excluído' });
      navigate('/dashboard');
    }
    setDeleteConfirm(false);
  };

  const handleDuplicate = () => {
    if (!deckId) return;
    duplicateDeck.mutate(deckId, {
      onSuccess: (data: any) => {
        toast({ title: 'Baralho duplicado!' });
        if (data?.id) navigate(`/decks/${data.id}`);
      },
    });
  };

  const isCommunityDeck = useMemo(() => {
    if (sourceTurmaDeckId || sourceListingId || communityId) return true;
    if (!deckId) return false;
    let parentId = decks.find(d => d.id === deckId)?.parent_deck_id;
    while (parentId) {
      const parent = decks.find(d => d.id === parentId) as any;
      if (!parent) break;
      if (parent.source_turma_deck_id || parent.source_listing_id || parent.is_live_deck || parent.community_id) return true;
      parentId = parent.parent_deck_id;
    }
    return false;
  }, [sourceTurmaDeckId, sourceListingId, communityId, deckId, decks]);

  const handleDetachDeck = async () => {
    if (!deckId) return;
    setDetaching(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Not authenticated');

      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', deckId).single();
      if (!originalDeck) throw new Error('Deck not found');

      const { data: newDeck, error } = await supabase.from('decks').insert({
        name: `${(originalDeck as any).name}`,
        user_id: currentUser.id,
        folder_id: null,
      } as any).select().single();
      if (error || !newDeck) throw error || new Error('Failed');

      const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', deckId);
      if (cards && cards.length > 0) {
        const newCards = cards.map((c: any) => ({
          deck_id: (newDeck as any).id,
          front_content: c.front_content,
          back_content: c.back_content,
          card_type: c.card_type ?? 'basic',
        }));
        await supabase.from('cards').insert(newCards as any);
      }

      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Deck copiado!', description: 'Uma cópia pessoal independente foi criada.' });
      setDetachConfirm(false);
      navigate(`/decks/${(newDeck as any).id}`);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    } finally {
      setDetaching(false);
    }
  };

  const handleArchive = () => {
    if (!deckId) return;
    archiveDeck.mutate(deckId, {
      onSuccess: () => {
        toast({ title: 'Baralho arquivado' });
        navigate('/dashboard');
      },
    });
  };

  const handleAlgorithmSwitch = (target: 'fsrs' | 'quick_review') => {
    if (target === algorithmMode) return;
    setAlgorithmChangeTarget(target);
    setAlgorithmModal(false);
  };

  const handleSwitchAndReset = async () => {
    if (!algorithmChangeTarget || !deckId) return;
    const shouldReset = algorithmChangeTarget !== 'fsrs';
    await supabase.from('decks').update({ algorithm_mode: algorithmChangeTarget } as any).eq('id', deckId);
    if (shouldReset) {
      await supabase.from('cards').update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any).eq('deck_id', deckId);
    }
    // Propagate to child decks
    const { data: children } = await supabase.from('decks').select('id').eq('parent_deck_id', deckId);
    if (children && children.length > 0) {
      for (const child of children) {
        await supabase.from('decks').update({ algorithm_mode: algorithmChangeTarget } as any).eq('id', child.id);
        if (shouldReset) {
          await supabase.from('cards').update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any).eq('deck_id', child.id);
        }
      }
    }
    setAlgorithmMode(algorithmChangeTarget);
    queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
    queryClient.invalidateQueries({ queryKey: ['decks'] });
    queryClient.invalidateQueries({ queryKey: ['study-queue', deckId] });
    toast({
      title: 'Algoritmo alterado',
      description: shouldReset
        ? `Progresso redefinido${children?.length ? ` (+ ${children.length} sub-baralho${children.length > 1 ? 's' : ''})` : ''}.`
        : 'Progresso mantido.',
    });
    setAlgorithmChangeTarget(null);
  };

  const handleCopyWithAlgorithm = async () => {
    if (!algorithmChangeTarget || !deckId || !user) return;
    const { data: currentDeck } = await supabase.from('decks').select('*').eq('id', deckId).single();
    if (!currentDeck) return;
    const newName = `${currentDeck.name} (${algorithmChangeTarget === 'fsrs' ? 'FSRS' : 'Revisão rápida'})`;
    const { data: newDeck, error } = await supabase
      .from('decks')
      .insert({ name: newName, user_id: user.id, folder_id: currentDeck.folder_id, algorithm_mode: algorithmChangeTarget } as any)
      .select().single();
    if (error || !newDeck) { toast({ title: 'Erro', variant: 'destructive' }); setAlgorithmChangeTarget(null); return; }
    const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', deckId);
    if (cards && cards.length > 0) {
      await supabase.from('cards').insert(cards.map((c: any) => ({
        deck_id: (newDeck as any).id, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type ?? 'basic',
      })) as any);
    }
    toast({ title: 'Novo baralho criado!', description: `"${newName}" foi criado.` });
    setAlgorithmChangeTarget(null);
    navigate(`/decks/${(newDeck as any).id}`);
  };

  const handleExportCSV = async () => {
    if (!deckId) return;
    setExportingCsv(true);
    try {
      const { data: cards, error } = await supabase
        .from('cards')
        .select('front_content, back_content, card_type')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!cards || cards.length === 0) {
        toast({ title: 'Nenhum cartão para exportar', variant: 'destructive' });
        setExportingCsv(false);
        return;
      }
      const escapeCSV = (s: string) => {
        // Keep image tags as-is for CSV so they can be re-imported
        const text = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };
      const csv = cards.map(c => `${escapeCSV(c.front_content)},${escapeCSV(c.back_content)}`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'baralho'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${cards.length} cartões exportados!` });
      setExportModal(false);
    } catch {
      toast({ title: 'Erro ao exportar', variant: 'destructive' });
    }
    setExportingCsv(false);
  };

  const handleExportAnki = async () => {
    if (!deckId) return;
    setExportingAnki(true);
    try {
      const { data: cards, error } = await supabase
        .from('cards')
        .select('front_content, back_content, card_type')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!cards || cards.length === 0) {
        toast({ title: 'Nenhum cartão para exportar', variant: 'destructive' });
        setExportingAnki(false);
        return;
      }
      await exportAsApkg(
        name || 'baralho',
        cards.map(c => ({ front: c.front_content, back: c.back_content, cardType: c.card_type })),
      );
      toast({ title: `${cards.length} cartões exportados como .apkg!` });
      setExportModal(false);
    } catch (err) {
      console.error('Anki export error:', err);
      toast({ title: 'Erro ao exportar', description: 'Tente novamente.', variant: 'destructive' });
    }
    setExportingAnki(false);
  };

  const addLearningStep = () => setLearningSteps(prev => [...prev, '10m']);
  const removeLearningStep = (i: number) => { if (learningSteps.length > 1) setLearningSteps(prev => prev.filter((_, idx) => idx !== i)); };
  const updateLearningStep = (i: number, v: string) => setLearningSteps(prev => prev.map((s, idx) => idx === i ? v : s));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const algoLabel = algorithmMode === 'quick_review' ? 'Revisão rápida' : 'FSRS-6';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/decks/${deckId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{name}</p>
            <h1 className="font-display text-lg font-bold text-foreground">Configurações</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList className="w-full">
            <TabsTrigger value="settings" className="flex-1 gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex-1 gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Estatísticas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            {/* ── Section: Estudo ──────────────────────────────── */}
            <SettingsGroup>
              <SettingsRow
                icon={<Layers className="h-5 w-5" />}
                label="Algoritmo de Aprendizagem"
                subtitle={parentDeckId ? `${algoLabel} (herdado do pai)` : algoLabel}
                onClick={parentDeckId ? () => toast({ title: 'Algoritmo herdado', description: 'Este sub-baralho herda o algoritmo do baralho pai.' }) : () => setAlgorithmModal(true)}
              />
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow
                icon={<BookOpen className="h-5 w-5" />}
                label="Configurações de estudo"
                subtitle={parentDeckId
                  ? 'Herdado do baralho pai'
                  : isDeckLockedByObjective
                    ? 'Bloqueado por objetivo ativo (Meu Plano)'
                    : `${dailyNewLimit} novos · ${dailyReviewLimit} revisões/dia`}
                onClick={
                  parentDeckId
                    ? () => toast({ title: 'Configuração herdada', description: 'As configurações de estudo são definidas pelo baralho pai.' })
                    : isDeckLockedByObjective
                      ? () => toast({
                          title: 'Bloqueado pelo Meu Plano',
                          description: 'Remova este baralho dos objetivos para editar os limites diários nas configurações do deck.',
                          variant: 'destructive',
                        })
                      : () => setStudySettingsModal(true)
                }
              />
              <SettingsRow
                icon={<Volume2 className="h-5 w-5" />}
                label="Texto para voz"
                rightContent={<Badge variant="secondary" className="text-xs">Em breve</Badge>}
                disabled
              />
              <SettingsRow
                icon={<Palette className="h-5 w-5" />}
                label="Estilo do cartão"
                rightContent={<Badge variant="secondary" className="text-xs">Em breve</Badge>}
                disabled
              />
            </SettingsGroup>

            {/* ── Section: Social ─────────────────────────────── */}
            {!isCommunityDeck && (
              <SettingsGroup>
                <SettingsRow
                  icon={<Globe className="h-5 w-5" />}
                  label="Publicar na comunidade"
                  subtitle="Visível para todos na aba Comunidade"
                  rightContent={
                    <Switch
                      checked={isPublic}
                      onCheckedChange={(checked) => {
                        setIsPublic(checked);
                        saveSettings({ is_public: checked });
                      }}
                    />
                  }
                />
                <SettingsRow
                  icon={<Copy className="h-5 w-5" />}
                  label="Permitir duplicação"
                  subtitle="Outros usuários podem duplicar este deck para uso pessoal"
                  rightContent={
                    <Switch
                      checked={allowDuplication}
                      onCheckedChange={(checked) => {
                        setAllowDuplication(checked);
                        saveSettings({ allow_duplication: checked });
                      }}
                    />
                  }
                />
                <SettingsRow
                  icon={<Share2 className="h-5 w-5" />}
                  label="Compartilhar baralho"
                  onClick={() => setShareModal(true)}
                />
              </SettingsGroup>
            )}

            {/* ── Section: IA ─────────────────────────────────── */}
            {!isCommunityDeck && (
              <SettingsGroup>
                <SettingsRow
                  icon={<Download className="h-5 w-5" />}
                  label="Importar cartões"
                  onClick={() => navigate(`/decks/${deckId}/manage`)}
                />
              </SettingsGroup>
            )}

            {/* ── Section: Gerenciar ──────────────────────────── */}
            <SettingsGroup>
              <SettingsRow
                icon={<Edit3 className="h-5 w-5" />}
                label="Renomear baralho"
                onClick={() => setRenameModal(true)}
                disabled={isCommunityDeck}
              />
              {isCommunityDeck ? (
                <SettingsRow
                  icon={<Copy className="h-5 w-5" />}
                  label="Copiar para meu deck pessoal"
                  subtitle="Criar cópia independente e editável"
                  onClick={() => setDetachConfirm(true)}
                />
              ) : (
                <SettingsRow
                  icon={<Copy className="h-5 w-5" />}
                  label="Duplicar baralho"
                  onClick={handleDuplicate}
                />
              )}
              <SettingsRow
                icon={<RotateCcw className="h-5 w-5" />}
                label="Redefinir progresso"
                onClick={() => setResetConfirm(true)}
                disabled={isCommunityDeck}
              />
              <SettingsRow
                icon={<Archive className="h-5 w-5" />}
                label="Arquivar baralho"
                onClick={handleArchive}
                disabled={isCommunityDeck}
              />
              <SettingsRow
                icon={<Upload className="h-5 w-5" />}
                label="Exportar cartões"
                subtitle="CSV ou Anki (.apkg)"
                onClick={() => setExportModal(true)}
              />
              {isCommunityDeck && (
                <p className="px-5 pb-2 text-xs text-muted-foreground">Para alterar conteúdo, envie uma sugestão ao dono da sala.</p>
              )}
            </SettingsGroup>

            {/* ── Section: Danger ─────────────────────────────── */}
            <SettingsGroup>
              <SettingsRow
                icon={<Trash2 className="h-5 w-5" />}
                label="Excluir baralho"
                destructive
                onClick={() => setDeleteConfirm(true)}
                disabled={isCommunityDeck}
              />
            </SettingsGroup>

            <div className="h-8" />
          </TabsContent>

          <TabsContent value="stats">
            {deckId && <DeckStatsTab deckId={deckId} />}
          </TabsContent>
        </Tabs>
      </main>

      <DeckSettingsModals
        deckId={deckId!}
        name={name}
        setName={setName}
        saving={saving}
        algorithmMode={algorithmMode}
        isDeckLockedByObjective={isDeckLockedByObjective}
        dailyNewLimit={dailyNewLimit}
        setDailyNewLimit={setDailyNewLimit}
        dailyReviewLimit={dailyReviewLimit}
        setDailyReviewLimit={setDailyReviewLimit}
        shuffleCards={shuffleCards}
        setShuffleCards={setShuffleCards}
        requestedRetention={requestedRetention}
        setRequestedRetention={setRequestedRetention}
        maxInterval={maxInterval}
        setMaxInterval={setMaxInterval}
        easyGraduatingInterval={easyGraduatingInterval}
        setEasyGraduatingInterval={setEasyGraduatingInterval}
        learningSteps={learningSteps}
        addLearningStep={addLearningStep}
        removeLearningStep={removeLearningStep}
        updateLearningStep={updateLearningStep}
        buryNewSiblings={buryNewSiblings}
        setBuryNewSiblings={setBuryNewSiblings}
        buryReviewSiblings={buryReviewSiblings}
        setBuryReviewSiblings={setBuryReviewSiblings}
        buryLearningSiblings={buryLearningSiblings}
        setBuryLearningSiblings={setBuryLearningSiblings}
        algorithmModal={algorithmModal}
        setAlgorithmModal={setAlgorithmModal}
        studySettingsModal={studySettingsModal}
        setStudySettingsModal={setStudySettingsModal}
        advancedModal={advancedModal}
        setAdvancedModal={setAdvancedModal}
        renameModal={renameModal}
        setRenameModal={setRenameModal}
        shareModal={shareModal}
        setShareModal={setShareModal}
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
        resetConfirm={resetConfirm}
        setResetConfirm={setResetConfirm}
        exportModal={exportModal}
        setExportModal={setExportModal}
        exportingCsv={exportingCsv}
        exportingAnki={exportingAnki}
        algorithmChangeTarget={algorithmChangeTarget}
        setAlgorithmChangeTarget={setAlgorithmChangeTarget}
        handleAlgorithmSwitch={handleAlgorithmSwitch}
        handleSwitchAndReset={handleSwitchAndReset}
        handleCopyWithAlgorithm={handleCopyWithAlgorithm}
        handleSaveStudySettings={handleSaveStudySettings}
        handleRename={handleRename}
        handleResetProgress={handleResetProgress}
        handleDelete={handleDelete}
        handleExportCSV={handleExportCSV}
        handleExportAnki={handleExportAnki}
        toast={toast}
      />

      {/* Copy community deck dialog */}
      <AlertDialog open={detachConfirm} onOpenChange={setDetachConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar para meu deck pessoal</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Uma cópia independente de <strong>"{name}"</strong> será criada no seu deck pessoal.</p>
              <p>A cópia:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Será um deck <strong>pessoal e editável</strong></li>
                <li><strong>Não receberá</strong> atualizações automáticas da comunidade</li>
                <li>O deck original da comunidade <strong>permanecerá intacto</strong></li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={detaching}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDetachDeck} disabled={detaching}>
              {detaching ? 'Copiando...' : 'Confirmar cópia'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeckSettings;
