/**
 * StudyWeightsSheet — adjust study weight per Sala (folder) for today's session.
 * Weights are ephemeral (stored in state only, reset on next day/reload).
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, Play } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { Folder } from '@/types/folder';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

interface StudyWeightsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  decks: DeckWithStats[];
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
}

const StudyWeightsSheet = ({ open, onOpenChange, folders, decks, getSubDecks, getAggregateStats }: StudyWeightsSheetProps) => {
  const navigate = useNavigate();

  const rootFolders = useMemo(
    () => folders.filter(f => !f.parent_id && !f.is_archived)
      .sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0) || a.name.localeCompare(b.name)),
    [folders]
  );

  // Compute stats per folder
  const folderStats = useMemo(() => {
    const map = new Map<string, { deckCount: number; totalDue: number }>();
    for (const f of rootFolders) {
      const folderDecks = decks.filter(d => d.folder_id === f.id && !d.parent_deck_id && !d.is_archived);
      let totalDue = 0;
      for (const d of folderDecks) {
        const s = getAggregateStats(d);
        totalDue += s.new_count + s.learning_count + s.review_count;
      }
      map.set(f.id, { deckCount: folderDecks.length, totalDue });
    }
    return map;
  }, [rootFolders, decks, getAggregateStats]);

  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const f of rootFolders) initial[f.id] = 100;
    return initial;
  });

  const activeCount = useMemo(() => Object.values(weights).filter(w => w > 0).length, [weights]);

  const handleStudy = () => {
    if (activeCount === 0) return;
    onOpenChange(false);
    navigate('/study');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 text-center">
              <SheetTitle className="font-display text-base font-bold">Ajustar Carga de Estudo</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{activeCount} sala{activeCount !== 1 ? 's' : ''} ativa{activeCount !== 1 ? 's' : ''} no mix</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[200px] text-xs">
                Ajuste o peso de cada sala para a sessão de hoje. Amanhã os valores voltam ao padrão.
              </TooltipContent>
            </Tooltip>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {rootFolders.map(folder => {
            const weight = weights[folder.id] ?? 100;
            const isActive = weight > 0;
            const stats = folderStats.get(folder.id);

            return (
              <div key={folder.id} className={`px-4 py-4 transition-opacity ${isActive ? '' : 'opacity-40'}`}>
                <div className="flex items-center gap-3 mb-1">
                  <img
                    src={folder.image_url || defaultSalaIcon}
                    alt={folder.name}
                    className="h-8 w-8 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-foreground truncate">{folder.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {stats?.deckCount ?? 0} deck{(stats?.deckCount ?? 0) !== 1 ? 's' : ''}
                      {(stats?.totalDue ?? 0) > 0 && ` · ${stats!.totalDue} para hoje`}
                    </p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ml-3 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {weight}%
                  </span>
                </div>
                <Slider
                  value={[weight]}
                  onValueChange={([val]) => setWeights(prev => ({ ...prev, [folder.id]: val }))}
                  max={100}
                  step={5}
                  className="mt-2"
                />
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-border/50">
          <Button
            onClick={handleStudy}
            disabled={activeCount === 0}
            className="w-full h-12 rounded-full text-base font-bold gap-2"
            size="lg"
          >
            ESTUDAR
            <Play className="h-5 w-5 fill-current" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default StudyWeightsSheet;
