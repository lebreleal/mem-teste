/**
 * StudySalaSheet — lets user pick which Sala (folder) to study from.
 * Shows each sala with its due count, clicking navigates to study.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { Folder } from '@/types/folder';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

interface StudySalaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  decks: DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
}

const StudySalaSheet = ({ open, onOpenChange, folders, decks, getAggregateStats }: StudySalaSheetProps) => {
  const navigate = useNavigate();

  const rootFolders = useMemo(
    () => folders.filter(f => !f.parent_id && !f.is_archived)
      .sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0) || a.name.localeCompare(b.name)),
    [folders]
  );

  const folderStats = useMemo(() => {
    const map = new Map<string, { totalDue: number; totalCards: number; masteredCards: number }>();
    for (const f of rootFolders) {
      const folderDecks = decks.filter(d => d.folder_id === f.id && !d.parent_deck_id && !d.is_archived);
      let totalDue = 0, totalCards = 0, masteredCards = 0;
      const collectAll = (deckList: DeckWithStats[]) => {
        for (const d of deckList) {
          const s = getAggregateStats(d);
          totalDue += s.new_count + s.learning_count + s.review_count;
          totalCards += d.total_cards;
          masteredCards += d.mastered_cards;
          const subs = decks.filter(x => x.parent_deck_id === d.id && !x.is_archived);
          collectAll(subs);
        }
      };
      collectAll(folderDecks);
      map.set(f.id, { totalDue, totalCards, masteredCards });
    }
    return map;
  }, [rootFolders, decks, getAggregateStats]);

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
    folderStats.forEach(s => { sum += s.totalDue; });
    return sum;
  }, [folderStats]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 text-center">
              <SheetTitle className="font-display text-base font-bold">Escolha a Sala</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Selecione qual sala deseja estudar</p>
            </div>
            <div className="w-5" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {rootFolders.map(folder => {
            const stats = folderStats.get(folder.id);
            const due = stats?.totalDue ?? 0;
            const masteryPct = (stats?.totalCards ?? 0) > 0
              ? Math.round(((stats?.masteredCards ?? 0) / stats!.totalCards) * 1000) / 10
              : 0;

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
  );
};

export default StudySalaSheet;
