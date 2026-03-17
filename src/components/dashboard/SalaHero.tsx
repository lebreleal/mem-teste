/**
 * SalaHero — The sala banner, study bar and circular progress.
 * Extracted from Dashboard.tsx (copy-paste integral).
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, Compass, EyeOff, LogOut, MoreVertical, Play, RefreshCw, Share2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import { calculateRealStudyTime } from '@/lib/studyUtils';
import { IconTrash, IconImage, IconInfo, IconDeck, IconArchive, IconEdit } from '@/components/icons';
interface SalaHeroProps {
  state: any;
  user: any;
  isCommunityFolder: boolean;
  sourceTurmaId: string | null;
  communityTurmaInfo: any;
  userTurma: any;
  publishing: boolean;
  handleTogglePublish: () => void;
  openShareModal: () => void;
  setSalaImageOpen: (v: boolean) => void;
  setLeaveSalaConfirm: (v: { folderId: string; turmaId: string } | null) => void;
  setStudySettingsOpen: (v: boolean) => void;
  realStudyMetrics: any;
  salaDifficultyStats: { novo: number; facil: number; bom: number; dificil: number; errei: number };
}

const SalaHero = ({
  state, user, isCommunityFolder, sourceTurmaId, communityTurmaInfo,
  userTurma, publishing, handleTogglePublish, openShareModal,
  setSalaImageOpen, setLeaveSalaConfirm, setStudySettingsOpen,
  realStudyMetrics, salaDifficultyStats,
}: SalaHeroProps) => {
  const navigate = useNavigate();
  const [infoOpen, setInfoOpen] = useState(false);

  const cf = state.folders.find((f: any) => f.id === state.currentFolderId);
  const folderName = cf?.name ?? 'Sala';
  const folderImage = cf?.image_url;
  const isComm = isCommunityFolder;
  const displayName = isComm ? (communityTurmaInfo?.ownerName ?? 'Criador') : (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Você');
  const avatarUrl = isComm ? undefined : (user?.user_metadata?.avatar_url as string | undefined);
  const heroImage = isComm ? (communityTurmaInfo?.coverUrl || folderImage) : folderImage;

  // Sala-scoped study stats for the compact study card
  const salaStudyStats = useMemo(() => {
    if (!state.isInsideSala) return null;
    const deckMap = state.deckMap;
    const childrenIndex = state.childrenIndex;

    let rawNewCount = 0;
    let newCountTodayByDeckLimits = 0;
    let learningCount = 0;
    let reviewCount = 0;
    let reviewedToday = 0;
    let totalCards = 0;

    const collectTotalCards = (deckId: string): number => {
      const dk = deckMap.get(deckId);
      if (!dk) return 0;
      let t = dk.total_cards;
      for (const c of (childrenIndex.get(deckId) ?? [])) { if (!c.is_archived) t += collectTotalCards(c.id); }
      return t;
    };

    let totalDailyReviewLimit = 0;
    let totalReviewReviewedToday = 0;

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

    const collectStudyStats = (deckId: string, isRoot: boolean) => {
      const dk = deckMap.get(deckId);
      if (!dk || dk.is_archived) return;

      learningCount += dk.learning_count ?? 0;
      reviewCount += dk.review_count ?? 0;
      reviewedToday += dk.reviewed_today ?? 0;
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

      for (const c of (childrenIndex.get(deckId) ?? [])) { if (!c.is_archived) collectStudyStats(c.id, false); }
    };

    for (const deck of state.currentDecks) {
      collectStudyStats(deck.id, true);
      totalCards += collectTotalCards(deck.id);
    }

    const newCountToday = newCountTodayByDeckLimits;
    const cappedReviewCount = Math.max(0, Math.min(reviewCount, totalDailyReviewLimit - totalReviewReviewedToday));
    const totalDue = newCountToday + learningCount + cappedReviewCount;
    const totalSession = totalDue + reviewedToday;
    const progressPct = totalSession > 0 ? Math.round((reviewedToday / totalSession) * 100) : 0;

    const remainingSeconds = calculateRealStudyTime(newCountToday, learningCount, cappedReviewCount, realStudyMetrics);
    const remainingMin = Math.ceil(remainingSeconds / 60);
    const timeLabel = remainingMin >= 60
      ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
      : `${remainingMin}min`;

    const ds = salaDifficultyStats ?? { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
    const classifiedTotal = ds.novo + ds.facil + ds.bom + ds.dificil + ds.errei;
    const effectiveTotal = classifiedTotal > 0 ? classifiedTotal : totalCards;
    const masteredCount = effectiveTotal - ds.novo;

    return {
      newCount: rawNewCount, newCountToday, learningCount, reviewCount, reviewedToday,
      totalDue, progressPct, timeLabel, totalCards: effectiveTotal, masteredCount, ...ds,
    };
  }, [state.isInsideSala, state.currentDecks, state.deckMap, state.childrenIndex, salaDifficultyStats, realStudyMetrics]);

  return (
    <>
      {/* Hero banner */}
      <div className="relative bg-muted/50 overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage || defaultSalaIcon} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
        </div>

        <div className="relative px-4 pt-3 pb-4">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => state.setCurrentFolderId(null)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
            <div className="flex items-center gap-1.5">
              {!isComm && (
                <>
                  {/* Share button — only for own salas */}
                  <button
                    onClick={openShareModal}
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Compartilhar link da sala"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => {
                        if (cf) { state.setRenameTarget({ type: 'folder', id: cf.id, name: cf.name }); state.setRenameName(cf.name); }
                      }}>
                        <IconEdit className="h-4 w-4 mr-2" /> Renomear sala
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSalaImageOpen(true)}>
                        <IconImage className="h-4 w-4 mr-2" /> Mudar imagem
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleTogglePublish} disabled={publishing}>
                        {userTurma?.is_private === false ? (
                          <><EyeOff className="h-4 w-4 mr-2" /> Despublicar</>
                        ) : (
                          <><Compass className="h-4 w-4 mr-2" /> Publicar no Explorar</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        await state.archiveFolder.mutateAsync(state.currentFolderId!);
                        state.setCurrentFolderId(null);
                      }}>
                        <IconArchive className="h-4 w-4 mr-2" /> Arquivar sala
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (cf) state.setDeleteTarget({ type: 'folder', id: cf.id, name: cf.name });
                        }}
                      >
                        <IconTrash className="h-4 w-4 mr-2" /> Excluir sala
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {isComm && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setLeaveSalaConfirm({ folderId: state.currentFolderId!, turmaId: sourceTurmaId! })}
                    >
                      <LogOut className="h-4 w-4 mr-2" /> Sair da sala
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Sala image + name */}
          <div className="flex items-center gap-3 mb-2">
            <div className="relative shrink-0">
              <img src={heroImage || defaultSalaIcon} alt={folderName} className="h-14 w-14 rounded-xl object-cover border border-border/30 shadow-sm" />
              {!isComm && (
                <button
                  onClick={() => setSalaImageOpen(true)}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Trocar imagem da sala"
                >
                  <IconImage className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-display font-bold text-foreground truncate">{folderName}</h1>
                {!isComm && (
                  <button
                    onClick={() => {
                      if (cf) { state.setRenameTarget({ type: 'folder', id: cf.id, name: cf.name }); state.setRenameName(cf.name); }
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">Por</span>
                <span className="text-xs font-medium text-foreground">{displayName}</span>
                {!isComm && avatarUrl && (
                  <div className="h-5 w-5 rounded-full overflow-hidden bg-muted shrink-0">
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
              {isComm && communityTurmaInfo?.lastUpdated && (
                <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                  <RefreshCw className="h-2.5 w-2.5" />
                  {(() => { try { return formatDistanceToNow(new Date(communityTurmaInfo.lastUpdated), { addSuffix: true, locale: ptBR }); } catch { return ''; } })()}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Study bar — centered buttons + time below */}
      {salaStudyStats && (
        <div className="max-w-md mx-auto md:max-w-lg px-4 py-3 space-y-2">
          {/* Centered: config + ESTUDAR */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setStudySettingsOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
              aria-label="Configurar estudo"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            <Button
              onClick={() => navigate(`/study/folder/${state.currentFolderId}`)}
              className="h-11 rounded-full text-sm font-bold gap-2 px-8"
              disabled={salaStudyStats.totalDue === 0}
            >
              ESTUDAR
              <Play className="h-4 w-4 fill-current" />
            </Button>
          </div>

          {/* Summary line: icon card + count + ? */}
          {salaStudyStats.totalDue > 0 && (
            <div className="flex items-center justify-center gap-1.5 w-full py-1 text-xs text-muted-foreground">
              <IconDeck className="h-3 w-3" />
              <span>{salaStudyStats.totalDue}</span>
              <span>·</span>
              <span>{salaStudyStats.timeLabel}</span>

              <Popover open={infoOpen} onOpenChange={setInfoOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="ml-0.5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Explicar tempo e cartões de hoje"
                  >
                    <IconInfo className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="center"
                  sideOffset={8}
                  className="w-auto max-w-[18rem] rounded-2xl border border-border bg-background px-3 py-2 text-xs text-foreground shadow-md"
                >
                  <p className="leading-relaxed">
                    Você é rápido! Em <span className="font-semibold">{salaStudyStats.timeLabel}</span> você termina esses <IconDeck className="inline h-3 w-3 align-text-bottom" /> <span className="font-semibold">{salaStudyStats.totalDue} cartões</span>.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default SalaHero;
