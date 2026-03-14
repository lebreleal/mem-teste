/**
 * StudyWeightsSheet — adjust study weight per root deck for today's session.
 * Weights are ephemeral (stored in state only, reset on next day/reload).
 * The system distributes study proportionally based on weights.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, Play } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DeckWithStats } from '@/hooks/useDecks';

interface StudyWeightsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckWithStats[];
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
}

/** Count sub-decks recursively */
function countAllSubDecks(deckId: string, getSubDecks: (id: string) => DeckWithStats[]): number {
  const subs = getSubDecks(deckId);
  let count = subs.length;
  for (const sub of subs) count += countAllSubDecks(sub.id, getSubDecks);
  return count;
}

const StudyWeightsSheet = ({ open, onOpenChange, decks, getSubDecks, getAggregateStats }: StudyWeightsSheetProps) => {
  const navigate = useNavigate();

  // Root decks only (no parent, not archived)
  const rootDecks = useMemo(() => decks.filter(d => !d.parent_deck_id && !d.is_archived), [decks]);

  // Ephemeral weights — 100 means full weight, 0 means skip
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const d of rootDecks) {
      initial[d.id] = 100;
    }
    return initial;
  });

  const activeCount = useMemo(() => Object.values(weights).filter(w => w > 0).length, [weights]);

  const handleStudy = () => {
    // Navigate to study with the active deck IDs and weights
    const activeDeckIds = rootDecks.filter(d => (weights[d.id] ?? 100) > 0).map(d => d.id);
    if (activeDeckIds.length === 0) return;
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
              <SheetTitle className="font-display text-base font-bold">Ajustar Pesos de Estudo</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{activeCount} matéria{activeCount !== 1 ? 's' : ''} ativa{activeCount !== 1 ? 's' : ''} no mix</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[200px] text-xs">
                Ajuste o peso de cada matéria para a sessão de hoje. Amanhã os valores voltam ao padrão.
              </TooltipContent>
            </Tooltip>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {rootDecks.map(deck => {
            const weight = weights[deck.id] ?? 100;
            const isActive = weight > 0;
            const subCount = countAllSubDecks(deck.id, getSubDecks);
            const stats = getAggregateStats(deck);
            const totalDue = stats.new_count + stats.learning_count + stats.review_count;

            return (
              <div key={deck.id} className={`px-4 py-4 transition-opacity ${isActive ? '' : 'opacity-40'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-foreground truncate">{deck.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {subCount > 0 ? `${subCount} deck${subCount !== 1 ? 's' : ''}` : `${deck.total_cards} cartões`}
                      {totalDue > 0 && ` · ${totalDue} para hoje`}
                    </p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ml-3 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {weight}%
                  </span>
                </div>
                <Slider
                  value={[weight]}
                  onValueChange={([val]) => setWeights(prev => ({ ...prev, [deck.id]: val }))}
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
