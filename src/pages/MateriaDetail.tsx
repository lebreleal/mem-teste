/**
 * MateriaDetail — full-screen view for a deck-pai (parent deck with subdecks).
 * Matches the Sala layout: hero banner, study bar, DeckRow list, BottomNav.
 * Subdecks cannot be created inside subdecks (max 2 levels).
 */
import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, MoreVertical, GripVertical, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDecks } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import type { DeckWithStats } from '@/types/deck';
import { IconEdit, IconArchive, IconTrash, IconDeck, IconInfo } from '@/components/icons';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import DeckRow from '@/components/dashboard/DeckRow';
import DashboardModals from '@/components/dashboard/DashboardModals';
import { calculateRealStudyTime, DEFAULT_CALIBRATION_FACTOR } from '@/lib/studyUtils';
import { renameDeck, archiveDeck, deleteDeckCascade, updateDeck } from '@/services/deck';
import { invalidateDeckRelatedQueries } from '@/lib/queryKeys';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

const StudySettingsSheet = lazy(() => import('@/components/dashboard/StudySettingsSheet'));
const AICreateDeckDialog = lazy(() => import('@/components/AICreateDeckDialog'));

const MATERIA_COLORS = [
  null, '#C8B6FF', '#FFF3BF', '#FFD6E0', '#D4FFDA',
];
const COLOR_STORAGE_KEY = 'memo-materia-colors';

function getMateriaColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function setMateriaColor(deckId: string, color: string | null) {
  const colors = getMateriaColors();
  if (color) { colors[deckId] = color; } else { delete colors[deckId]; }
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors));
}

const MateriaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { decks, createDeck } = useDecks();
  const { folders } = useFolders();
  const { realStudyMetrics, calibrationFactor, globalCapacity } = useStudyPlan();

  const materia = useMemo(() => decks?.find(d => d.id === id), [decks, id]);
  const subDecks = useMemo(
    () => (decks ?? []).filter(d => d.parent_deck_id === id && !d.is_archived),
    [decks, id],
  );

  // Build childrenIndex for hierarchical limit calculation
  const childrenIndex = useMemo(() => {
    const map = new Map<string, DeckWithStats[]>();
    for (const d of (decks ?? [])) {
      if (d.parent_deck_id && !d.is_archived) {
        const list = map.get(d.parent_deck_id) ?? [];
        list.push(d);
        map.set(d.parent_deck_id, list);
      }
    }
    return map;
  }, [decks]);

  const deckMap = useMemo(() => {
    const map = new Map<string, DeckWithStats>();
    for (const d of (decks ?? [])) map.set(d.id, d);
    return map;
  }, [decks]);

  // Parent sala (folder)
  const parentFolder = useMemo(() => {
    if (!materia?.folder_id) return null;
    return (folders as Array<{ id: string; name: string; image_url?: string | null }>)?.find(f => f.id === materia.folder_id) ?? null;
  }, [materia, folders]);
  const backLabel = parentFolder?.name ?? 'Sala';
  const salaImage = (parentFolder as Record<string, unknown>)?.image_url as string | null | undefined;

  // User info
  const userMeta = user?.user_metadata as Record<string, string> | undefined;
  const displayName = userMeta?.full_name || userMeta?.name || user?.email?.split('@')[0] || 'Você';
  const avatarUrl = userMeta?.avatar_url;

  // State
  const [colorVersion, setColorVersion] = useState(0);
  const materiaColor = useMemo(() => id ? getMateriaColors()[id] ?? null : null, [id, colorVersion]);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [organizeMode, setOrganizeMode] = useState(false);
  const [studySettingsOpen, setStudySettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Add menu state (reusing DashboardModals)
  const [salaAddMenuOpen, setSalaAddMenuOpen] = useState(false);
  const [addMenuInfoType, setAddMenuInfoType] = useState<'deck' | 'deck-manual' | 'deck-ia' | null>(null);
  const [aiDeckOpen, setAiDeckOpen] = useState(false);
  

  // Listen for + button from BottomNav
  useEffect(() => {
    const handler = () => setSalaAddMenuOpen(true);
    window.addEventListener('open-pasta-add-menu', handler);
    return () => window.removeEventListener('open-pasta-add-menu', handler);
  }, []);

  const openEdit = useCallback(() => {
    if (!materia) return;
    setEditName(materia.name);
    setEditColor(materiaColor);
    setShowEdit(true);
  }, [materia, materiaColor]);

  // Mutations — using service layer (Law 2A)
  const updateMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string | null }) => {
      if (!id) throw new Error('No materia id');
      setMateriaColor(id, color);
      await updateDeck(id, { name });
    },
    onSuccess: () => {
      invalidateDeckRelatedQueries(queryClient);
      setColorVersion(v => v + 1);
      setShowEdit(false);
      toast({ title: 'Baralho atualizado' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No materia id');
      await archiveDeck(id);
    },
    onSuccess: () => {
      invalidateDeckRelatedQueries(queryClient);
      toast({ title: 'Baralho arquivado' });
      navigate(-1);
    },
    onError: () => { toast({ title: 'Erro ao arquivar', variant: 'destructive' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No materia id');
      await deleteDeckCascade(id);
    },
    onSuccess: () => {
      invalidateDeckRelatedQueries(queryClient);
      toast({ title: 'Baralho excluído' });
      navigate(-1);
    },
    onError: () => { toast({ title: 'Erro ao excluir', variant: 'destructive' }); },
  });

  // DeckRow helpers
  const getSubDecks = useCallback((deckId: string) => childrenIndex.get(deckId) ?? [] as DeckWithStats[], [childrenIndex]);
  const getAggregateStats = useCallback((deck: DeckWithStats) => ({
    new_count: deck.new_count ?? 0,
    learning_count: deck.learning_count ?? 0,
    review_count: deck.review_count ?? 0,
    reviewed_today: deck.reviewed_today ?? 0,
  }), []);
  const getCommunityLinkId = useCallback(() => null, []);
  const noop = useCallback(() => {}, []);

  // Study stats scoped to this pasta — using daily limits like SalaHero
  const studyStats = useMemo(() => {
    const collectHierarchyNew = (parentId: string): { newCount: number; newReviewed: number } => {
      let nc = 0, nr = 0;
      for (const c of (childrenIndex.get(parentId) ?? [])) {
        if (c.is_archived) continue;
        nc += c.new_count ?? 0;
        nr += c.new_reviewed_today ?? 0;
        const sub = collectHierarchyNew(c.id);
        nc += sub.newCount;
        nr += sub.newReviewed;
      }
      return { newCount: nc, newReviewed: nr };
    };

    let rawNewCount = 0;
    let newCountTodayByDeckLimits = 0;
    let learningCount = 0;
    let reviewCount = 0;
    let totalDailyReviewLimit = 0;
    let totalReviewReviewedToday = 0;

    const collectStudyStats = (deckId: string, isRoot: boolean) => {
      const dk = deckMap.get(deckId);
      if (!dk || dk.is_archived) return;

      learningCount += dk.learning_count ?? 0;
      reviewCount += dk.review_count ?? 0;
      const deckNewGraduatedToday = dk.new_graduated_today ?? 0;
      totalReviewReviewedToday += Math.max(0, (dk.reviewed_today ?? 0) - deckNewGraduatedToday);

      if (isRoot) {
        totalDailyReviewLimit += dk.daily_review_limit ?? 100;
        let hierarchyNewCount = dk.new_count ?? 0;
        let hierarchyNewReviewed = dk.new_reviewed_today ?? 0;
        const childNew = collectHierarchyNew(deckId);
        hierarchyNewCount += childNew.newCount;
        hierarchyNewReviewed += childNew.newReviewed;
        rawNewCount += hierarchyNewCount;
        const remaining = Math.max(0, (dk.daily_new_limit ?? 20) - hierarchyNewReviewed);
        newCountTodayByDeckLimits += Math.min(hierarchyNewCount, remaining);
      }

      for (const c of (childrenIndex.get(deckId) ?? [])) {
        if (!c.is_archived) collectStudyStats(c.id, false);
      }
    };

    for (const deck of subDecks) {
      collectStudyStats(deck.id, true);
    }

    const cappedReviewCount = Math.max(0, Math.min(reviewCount, totalDailyReviewLimit - totalReviewReviewedToday));
    const totalDue = newCountTodayByDeckLimits + learningCount + cappedReviewCount;

    const remainingSeconds = calculateRealStudyTime(newCountTodayByDeckLimits, learningCount, cappedReviewCount, realStudyMetrics, calibrationFactor);
    const remainingMin = Math.ceil(remainingSeconds / 60);
    const timeLabel = remainingMin >= 60
      ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
      : `${remainingMin}min`;

    // Total to finish ALL (no limits)
    const totalAllSeconds = calculateRealStudyTime(rawNewCount, learningCount, reviewCount, realStudyMetrics, calibrationFactor);
    const totalAllMin = Math.ceil(totalAllSeconds / 60);
    const totalAllLabel = totalAllMin >= 60
      ? `${Math.floor(totalAllMin / 60)}h${totalAllMin % 60 > 0 ? `${totalAllMin % 60}min` : ''}`
      : `${totalAllMin}min`;
    const totalAllCards = rawNewCount + learningCount + reviewCount;

    return { totalDue, timeLabel, totalAllCards, totalAllLabel };
  }, [subDecks, childrenIndex, deckMap, realStudyMetrics, calibrationFactor]);

  // Deck actions — using service layer (Law 2A)
  const handleRename = useCallback((deck: DeckWithStats) => {
    const newName = window.prompt('Renomear baralho', deck.name);
    if (newName && newName.trim() !== deck.name) {
      renameDeck(deck.id, newName.trim())
        .then(() => { invalidateDeckRelatedQueries(queryClient); toast({ title: 'Baralho renomeado' }); })
        .catch(() => { toast({ title: 'Erro ao renomear', variant: 'destructive' }); });
    }
  }, [queryClient]);

  const handleArchive = useCallback((deckId: string) => {
    archiveDeck(deckId)
      .then(() => { invalidateDeckRelatedQueries(queryClient); toast({ title: 'Baralho arquivado' }); })
      .catch(() => { toast({ title: 'Erro ao arquivar', variant: 'destructive' }); });
  }, [queryClient]);

  const handleDelete = useCallback((deck: DeckWithStats) => {
    if (!window.confirm(`Excluir "${deck.name}"? Esta ação não pode ser desfeita.`)) return;
    deleteDeckCascade(deck.id)
      .then(() => { invalidateDeckRelatedQueries(queryClient); toast({ title: 'Baralho excluído' }); })
      .catch(() => { toast({ title: 'Erro ao excluir', variant: 'destructive' }); });
  }, [queryClient]);

  const handleMove = useCallback((deck: DeckWithStats) => {
    navigate(`/dashboard?action=move&deckId=${deck.id}`);
  }, [navigate]);

  if (!materia) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Hero banner — matches SalaHero layout */}
      <div className="relative bg-muted/50 overflow-hidden">
        <div className="absolute inset-0">
          <img src={salaImage || defaultSalaIcon} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
        </div>

        <div className="relative px-4 pt-3 pb-4">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{backLabel}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setOrganizeMode(!organizeMode)}>
                  <GripVertical className="h-4 w-4 mr-2" /> {organizeMode ? 'Concluir organização' : 'Organizar baralhos'}
                </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
                   <IconArchive className="h-4 w-4 mr-2" /> Arquivar baralho
                 </DropdownMenuItem>
                 <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteMutation.mutate()}>
                   <IconTrash className="h-4 w-4 mr-2" /> Excluir baralho
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Pasta name + author — LEFT-ALIGNED like SalaHero */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-display font-bold text-foreground truncate">{materia.name}</h1>
                <button onClick={openEdit} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                  <IconEdit className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">Por</span>
                <span className="text-xs font-medium text-foreground">{displayName}</span>
                {avatarUrl && (
                  <div className="h-5 w-5 rounded-full overflow-hidden bg-muted shrink-0">
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Study bar — same as SalaHero */}
      <div className="max-w-md mx-auto md:max-w-lg px-4 py-3 space-y-2">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setStudySettingsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            aria-label="Configurar estudo"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <Button
            onClick={() => navigate(`/study/${id}`)}
            className="h-11 rounded-full text-sm font-bold gap-2 px-8"
            disabled={studyStats.totalDue === 0}
          >
            ESTUDAR
            <Play className="h-4 w-4 fill-current" />
          </Button>
        </div>

        {studyStats.totalDue > 0 && (
          <div className="flex items-center justify-center gap-1.5 w-full py-1 text-xs text-muted-foreground">
            <IconDeck className="h-3 w-3" />
            <span>{studyStats.totalDue}</span>
            <span>em</span>
            <span>{studyStats.timeLabel}</span>
            <Popover open={infoOpen} onOpenChange={setInfoOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="ml-0.5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" aria-label="Info">
                  <IconInfo className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="center" sideOffset={8} className="w-auto max-w-[18rem] rounded-2xl border border-border bg-background px-3 py-2 text-xs text-foreground shadow-md">
                <div className="space-y-1.5 leading-relaxed">
                  <p>
                    <span className="font-semibold">Hoje:</span>{' '}
                    <span className="inline-flex items-center gap-0.5 font-semibold"><IconDeck className="inline h-3 w-3" /> {studyStats.totalDue} cartões</span>{' '}
                    em ~<span className="font-semibold">{studyStats.timeLabel}</span>
                  </p>
                  {studyStats.totalAllCards > studyStats.totalDue && (
                    <p>
                      <span className="font-semibold">Dominar tudo:</span>{' '}
                      <span className="inline-flex items-center gap-0.5 font-semibold"><IconDeck className="inline h-3 w-3" /> {studyStats.totalAllCards} cartões</span>{' '}
                      em ~<span className="font-semibold">{studyStats.totalAllLabel}</span>
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Sub-decks list using DeckRow */}
      <div className="divide-y divide-border/30">
        {subDecks.map(sub => (
          <DeckRow
            key={sub.id}
            deck={sub}
            deckSelectionMode={false}
            selectedDeckIds={EMPTY_SET}
            expandedDecks={EMPTY_SET}
            toggleExpand={noop}
            toggleDeckSelection={noop}
            getSubDecks={getSubDecks}
            getAggregateStats={getAggregateStats}
            getCommunityLinkId={getCommunityLinkId}
            navigateToCommunity={noop}
            onCreateSubDeck={noop}
            onRename={handleRename}
            onMove={handleMove}
            onArchive={handleArchive}
            onDelete={handleDelete}
            organizeMode={organizeMode}
          />
        ))}
      </div>

      {/* Empty state */}
      {subDecks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <IconDeck className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum subbaralho neste baralho</p>
        </div>
      )}

      {/* Add menu modals (reuse DashboardModals) */}
      <DashboardModals
        addMenuInfoType={addMenuInfoType}
        setAddMenuInfoType={setAddMenuInfoType}
        detachTarget={null}
        setDetachTarget={noop}
        detaching={false}
        handleDetachDeck={noop}
        salaImageOpen={false}
        setSalaImageOpen={noop}
        onSalaImageCropped={noop}
        leaveSalaConfirm={null}
        setLeaveSalaConfirm={noop}
        handleLeaveSala={noop}
         salaAddMenuOpen={salaAddMenuOpen}
         setSalaAddMenuOpen={setSalaAddMenuOpen}
         isSubDeckContext
         onCreateDeckManual={() => {
           createDeck.mutate({ name: 'Novo sub-baralho', parentDeckId: id }, {
             onSuccess: (newDeck) => {
               toast({ title: 'Sub-baralho criado' });
               if (newDeck?.id) navigate(`/decks/${newDeck.id}`);
             },
           });
         }}
          onCreateDeckAI={() => {
            setAiDeckOpen(true);
          }}
          onImportCards={() => {
            navigate(`/dashboard?action=import&parentDeckId=${id}`);
          }}
      />

      {/* Edit modal */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Editar Baralho</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome do baralho"
              autoFocus
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Cor do ícone</p>
              <div className="flex flex-wrap gap-2">
                {MATERIA_COLORS.map((color) => (
                  <button
                    key={color ?? 'default'}
                    onClick={() => setEditColor(editColor === color ? null : color)}
                    className={`h-8 w-8 rounded-full transition-all ${
                      color === null
                        ? `border-2 ${editColor === null ? 'border-primary scale-110' : 'border-muted-foreground/40'}`
                        : `border-2 ${editColor === color ? 'border-foreground scale-110' : 'border-transparent'}`
                    }`}
                    style={color ? { backgroundColor: color } : undefined}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!editName.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate({ name: editName.trim(), color: editColor })}
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Study settings — matéria mode: show subdecks with toggle-only */}
      <Suspense fallback={null}>
        {studySettingsOpen && (
          <StudySettingsSheet
            open={studySettingsOpen}
            onOpenChange={setStudySettingsOpen}
            decks={decks}
            getSubDecks={getSubDecks}
            getAggregateStats={getAggregateStats}
            currentFolderId={materia.folder_id ?? null}
            parentDeckId={id}
          />
        )}
      </Suspense>

      {/* AI Deck Dialog — opens in-place instead of navigating away */}
      <Suspense fallback={null}>
        {aiDeckOpen && (
          <AICreateDeckDialog
            open={aiDeckOpen}
            onOpenChange={(open) => {
              setAiDeckOpen(open);
              if (!open) invalidateDeckRelatedQueries(queryClient);
            }}
            folderId={materia?.folder_id ?? null}
            parentDeckId={id}
          />
        )}
      </Suspense>
    </div>
  );
};

const EMPTY_SET = new Set<string>();

export default MateriaDetail;
