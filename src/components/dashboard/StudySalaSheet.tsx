/**
 * StudySalaSheet — lets user pick which Sala (folder) to study from.
 * Shows each sala with its daily-limited due count, time estimate, and mastery %.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Clock, Info } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { Folder } from '@/types/folder';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

interface StudySalaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  decks: DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  globalNewRemaining: number;
  avgSecondsPerCard: number;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.ceil(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}min` : `${h}h`;
}

const StudySalaSheet = ({ open, onOpenChange, folders, decks, getAggregateStats, globalNewRemaining, avgSecondsPerCard }: StudySalaSheetProps) => {
  const navigate = useNavigate();

  const rootFolders = useMemo(
    () => folders.filter(f => !f.parent_id && !f.is_archived)
      .sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0) || a.name.localeCompare(b.name)),
    [folders]
  );

  const folderStats = useMemo(() => {
    const map = new Map<string, { totalNew: number; totalLearning: number; totalReview: number; totalCards: number; masteredCards: number }>();
    for (const f of rootFolders) {
      const folderDecks = decks.filter(d => d.folder_id === f.id && !d.parent_deck_id && !d.is_archived);
      let totalNew = 0, totalLearning = 0, totalReview = 0, totalCards = 0, masteredCards = 0;
      const collectAll = (deckList: DeckWithStats[]) => {
        for (const d of deckList) {
          const s = getAggregateStats(d);
          totalNew += s.new_count;
          totalLearning += s.learning_count;
          totalReview += s.review_count;
          totalCards += d.total_cards;
          masteredCards += d.mastered_cards;
          const subs = decks.filter(x => x.parent_deck_id === d.id && !x.is_archived);
          collectAll(subs);
        }
      };
      collectAll(folderDecks);
      map.set(f.id, { totalNew, totalLearning, totalReview, totalCards, masteredCards });
    }
    return map;
  }, [rootFolders, decks, getAggregateStats]);

  // Distribute globalNewRemaining proportionally across folders
  const folderDailyDue = useMemo(() => {
    const result = new Map<string, number>();
    const entries: { id: string; newCount: number; learningReview: number }[] = [];
    let totalRawNew = 0;

    for (const f of rootFolders) {
      const stats = folderStats.get(f.id);
      const rawNew = stats?.totalNew ?? 0;
      const lr = (stats?.totalLearning ?? 0) + (stats?.totalReview ?? 0);
      entries.push({ id: f.id, newCount: rawNew, learningReview: lr });
      totalRawNew += rawNew;
    }

    for (const e of entries) {
      // Cap new cards proportionally from global budget
      const cappedNew = totalRawNew > 0
        ? Math.round((e.newCount / totalRawNew) * globalNewRemaining)
        : 0;
      const finalNew = Math.min(cappedNew, e.newCount);
      result.set(e.id, finalNew + e.learningReview);
    }

    return result;
  }, [rootFolders, folderStats, globalNewRemaining]);

  const handleStudySala = (folderId: string) => {
    onOpenChange(false);
    navigate(`/study/folder/${folderId}`);
  };

  const handleStudyAll = () => {
    onOpenChange(false);
    navigate('/study');
  };

  const totalDue = useMemo(() => {
    let sum = 0;
    folderDailyDue.forEach(v => { sum += v; });
    return sum;
  }, [folderDailyDue]);

  const totalTimeSeconds = totalDue * avgSecondsPerCard;

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[70vh] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/50">
            <div className="flex items-center gap-3">
              <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex-1 text-center">
                <SheetTitle className="font-display text-base font-bold">Escolha a Sala</SheetTitle>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {totalDue > 0 ? `~${formatTime(totalTimeSeconds)} restantes hoje` : 'Nenhum cartão para hoje'}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[250px] text-xs">
                      Tempo estimado para completar os cartões novos e revisões configurados nos ajustes para hoje.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="w-5" />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {rootFolders.map(folder => {
              const stats = folderStats.get(folder.id);
              const due = folderDailyDue.get(folder.id) ?? 0;
              const masteryPct = (stats?.totalCards ?? 0) > 0
                ? Math.round(((stats?.masteredCards ?? 0) / stats!.totalCards) * 1000) / 10
                : 0;
              const folderTime = due * avgSecondsPerCard;

              return (
                <button
                  key={folder.id}
                  onClick={() => handleStudySala(folder.id)}
                  disabled={due === 0}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all hover:bg-muted/50 active:bg-muted/70 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <img
                    src={folder.image_url || defaultSalaIcon}
                    alt={folder.name}
                    className="h-10 w-10 rounded-xl object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-foreground truncate">{folder.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {due > 0 ? `${due} para hoje` : 'Nenhum cartão pendente'}
                      </span>
                      {due > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {formatTime(folderTime)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{masteryPct}%</span>
                    </div>
                    <Progress value={masteryPct} className="h-1 mt-1" />
                  </div>
                  {due > 0 && (
                    <Play className="h-4 w-4 text-primary shrink-0 fill-primary" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-border/50">
            <Button
              onClick={handleStudyAll}
              disabled={totalDue === 0}
              className="w-full h-12 rounded-full text-base font-bold gap-2"
              size="lg"
            >
              ESTUDAR TUDO
              <Play className="h-5 w-5 fill-current" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
};

export default StudySalaSheet;
