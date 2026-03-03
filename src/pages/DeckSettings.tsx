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
            {!sourceTurmaDeckId && (
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
            {!sourceTurmaDeckId && (
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
              />
              <SettingsRow
                icon={<Copy className="h-5 w-5" />}
                label="Duplicar baralho"
                onClick={handleDuplicate}
              />
              <SettingsRow
                icon={<RotateCcw className="h-5 w-5" />}
                label="Redefinir progresso"
                onClick={() => setResetConfirm(true)}
              />
              <SettingsRow
                icon={<Archive className="h-5 w-5" />}
                label="Arquivar baralho"
                onClick={handleArchive}
              />
              <SettingsRow
                icon={<Upload className="h-5 w-5" />}
                label="Exportar cartões"
                subtitle="CSV ou Anki (.apkg)"
                onClick={() => setExportModal(true)}
              />
            </SettingsGroup>

            {/* ── Section: Danger ─────────────────────────────── */}
            <SettingsGroup>
              <SettingsRow
                icon={<Trash2 className="h-5 w-5" />}
                label="Excluir baralho"
                destructive
                onClick={() => setDeleteConfirm(true)}
              />
            </SettingsGroup>

            <div className="h-8" />
          </TabsContent>

          <TabsContent value="stats">
            {deckId && <DeckStatsTab deckId={deckId} />}
          </TabsContent>
        </Tabs>
      </main>

      {/* ══════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════ */}

      {/* Algorithm selection modal */}
      <Dialog open={algorithmModal} onOpenChange={setAlgorithmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Modo de Estudo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* FSRS-6 option */}
            <button
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-all text-left ${
                algorithmMode === 'fsrs' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => handleAlgorithmSwitch('fsrs')}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                algorithmMode === 'fsrs' ? 'bg-primary/10' : 'bg-muted'
              }`}>
                <Sparkles className={`h-5 w-5 ${algorithmMode === 'fsrs' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">FSRS-6</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Padrão</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Algoritmo moderno com otimização automática.</p>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                algorithmMode === 'fsrs' ? 'border-primary' : 'border-muted-foreground/30'
              }`}>
                {algorithmMode === 'fsrs' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </div>
            </button>

            {/* Quick review option */}
            <button
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-all text-left ${
                algorithmMode === 'quick_review' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => handleAlgorithmSwitch('quick_review')}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                algorithmMode === 'quick_review' ? 'bg-primary/10' : 'bg-muted'
              }`}>
                <Zap className={`h-5 w-5 ${algorithmMode === 'quick_review' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Revisão rápida</p>
                <p className="text-xs text-muted-foreground">Revise sem programação, no seu próprio ritmo.</p>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                algorithmMode === 'quick_review' ? 'border-primary' : 'border-muted-foreground/30'
              }`}>
                {algorithmMode === 'quick_review' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Algorithm change confirmation */}
      <Dialog open={!!algorithmChangeTarget} onOpenChange={(open) => { if (!open) setAlgorithmChangeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Trocar para {algorithmChangeTarget === 'fsrs' ? 'FSRS-6' : 'Revisão rápida'}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O progresso atual pode não ser compatível. Escolha como prosseguir:
          </p>
          <div className="space-y-3 pt-2">
            <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={handleSwitchAndReset}>
              <RotateCcw className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">Trocar e redefinir progresso</p>
                <p className="text-xs text-muted-foreground">Todos os cards voltam ao estado "novo"</p>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={handleCopyWithAlgorithm}>
              <Copy className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">Criar cópia com novo algoritmo</p>
                <p className="text-xs text-muted-foreground">Novo baralho criado, o atual permanece intacto</p>
              </div>
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setAlgorithmChangeTarget(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Study settings modal */}
      <Dialog open={studySettingsModal} onOpenChange={setStudySettingsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Configurações de Estudo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {isDeckLockedByObjective && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Este deck está em objetivo ativo. Para editar os limites diários, remova-o primeiro em Meu Plano.
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Novos cartões por dia</Label>
              <Input
                type="number" min={0} max={999}
                value={dailyNewLimit}
                onChange={(e) => setDailyNewLimit(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 text-right font-semibold"
                disabled={isDeckLockedByObjective}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Máximo de revisões por dia</Label>
              <Input
                type="number" min={0} max={9999}
                value={dailyReviewLimit}
                onChange={(e) => setDailyReviewLimit(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 text-right font-semibold"
                disabled={isDeckLockedByObjective}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-muted-foreground" />
                <Label>Embaralhar cartões</Label>
              </div>
              <Switch checked={shuffleCards} onCheckedChange={setShuffleCards} disabled={isDeckLockedByObjective} />
            </div>

            {algorithmMode === 'fsrs' && (
              <>
                <Separator />
                <Button variant="outline" className="w-full" onClick={() => { setStudySettingsModal(false); setAdvancedModal(true); }} disabled={isDeckLockedByObjective}>
                  Configurações avançadas (FSRS)
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
              </>
            )}

            <Button className="w-full" onClick={handleSaveStudySettings} disabled={saving || isDeckLockedByObjective}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advanced settings modal */}
      <Dialog open={advancedModal} onOpenChange={setAdvancedModal}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Configurações avançadas (FSRS)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
                {/* FSRS: Requested Retention */}
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-foreground">Retenção desejada</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Probabilidade alvo de lembrar um cartão ao revisá-lo. Valores mais altos = intervalos menores.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={70}
                      max={99}
                      value={Math.round(requestedRetention * 100)}
                      onChange={(e) => setRequestedRetention(parseInt(e.target.value) / 100)}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-lg font-bold text-foreground w-14 text-right">{Math.round(requestedRetention * 100)}%</span>
                  </div>
                </div>

                <Separator />

                {/* FSRS: Max interval */}
                <div className="space-y-2">
                  <Label>Intervalo máximo</Label>
                  <div className="relative">
                    <Input type="number" min={1} max={36500} value={maxInterval} onChange={(e) => setMaxInterval(Math.max(1, parseInt(e.target.value) || 36500))} className="pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">dias</span>
                  </div>
                </div>

                <Separator />

                {/* FSRS: Easy graduating interval */}
                <div className="space-y-2">
                  <div>
                    <Label>Intervalo do Fácil (graduação)</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Intervalo máximo ao apertar "Fácil" em um card novo ou em aprendizado.
                    </p>
                  </div>
                  <div className="relative">
                    <Input type="number" min={1} max={365} value={easyGraduatingInterval} onChange={(e) => setEasyGraduatingInterval(Math.max(1, parseInt(e.target.value) || 15))} className="pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">dias</span>
                  </div>
                </div>

                <Separator />
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-foreground">Etapas de aprendizado</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Duração fixa de cada revisão durante a fase de aprendizado.
                    </p>
                  </div>
                  {learningSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-16">Etapa {i + 1}:</span>
                      <Input value={step} onChange={(e) => updateLearningStep(i, e.target.value)} className="flex-1" placeholder="Ex: 1m, 15m, 1h" />
                      {learningSteps.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLearningStep(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full gap-1" onClick={addLearningStep}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar etapa
                  </Button>
                </div>

                <Separator />

                {/* Bury siblings toggles (state-aware, like Anki) */}
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-foreground">Ocultar irmãos cloze</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ao revisar um card cloze, seus irmãos são ocultados até o dia seguinte conforme o estado.
                    </p>
                  </div>
                  <div className="space-y-2 pl-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Ocultar novos irmãos</span>
                      <Switch checked={buryNewSiblings} onCheckedChange={setBuryNewSiblings} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Ocultar irmãos de revisão</span>
                      <Switch checked={buryReviewSiblings} onCheckedChange={setBuryReviewSiblings} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Ocultar irmãos em aprendizado</span>
                      <Switch checked={buryLearningSiblings} onCheckedChange={setBuryLearningSiblings} />
                    </div>
                  </div>
                </div>

            <Button className="w-full" onClick={handleSaveStudySettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename modal */}
      <Dialog open={renameModal} onOpenChange={setRenameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Renomear baralho</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameModal(false)}>Cancelar</Button>
              <Button onClick={handleRename} disabled={!name.trim() || saving}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share modal */}
      <Dialog open={shareModal} onOpenChange={setShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Compartilhar baralho</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Convide pessoas para estudar este baralho enviando um convite por e-mail.
            </p>
            <div className="space-y-2">
              <Label>E-mail do convidado</Label>
              <div className="flex gap-2">
                <Input placeholder="email@exemplo.com" type="email" />
                <Button className="gap-1.5 shrink-0">
                  <Mail className="h-4 w-4" />
                  Enviar
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Link de convite</Label>
              <div className="flex gap-2">
                <Input readOnly value={`${window.location.origin}/invite/${deckId}`} className="text-xs" />
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/invite/${deckId}`);
                    toast({ title: 'Link copiado!' });
                  }}
                >
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Qualquer pessoa com o link poderá acessar este baralho.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export modal */}
      <Dialog open={exportModal} onOpenChange={setExportModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Exportar cartões</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <button
              className="flex w-full items-center gap-4 rounded-xl border-2 border-border p-4 transition-all text-left hover:border-primary/50 hover:bg-primary/5"
              onClick={handleExportCSV}
              disabled={exportingCsv || exportingAnki}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                {exportingCsv ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Download className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">Exportar como CSV</p>
                <p className="text-xs text-muted-foreground">Baixar arquivo separado por vírgulas</p>
              </div>
            </button>
            <button
              className="flex w-full items-center gap-4 rounded-xl border-2 border-border p-4 transition-all text-left hover:border-primary/50 hover:bg-primary/5"
              onClick={handleExportAnki}
              disabled={exportingCsv || exportingAnki}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted p-1.5">
                {exportingAnki ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <img src={ankiLogo} alt="Anki" className="h-full w-full object-contain" />}
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">Exportar como Anki</p>
                <p className="text-xs text-muted-foreground">Arquivo .apkg compatível com Anki</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Reset progress confirmation */}
      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Redefinir progresso?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os cards voltarão ao estado "novo". O histórico de revisões será mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetProgress}>Redefinir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir "{name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os cards e registros de revisão serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeckSettings;
