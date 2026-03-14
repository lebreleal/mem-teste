/**
 * SalaList — renders the list of Classes (folders) at the dashboard root level.
 * Orphan decks (without folder) are shown directly at root, not in a virtual classe.
 */

import { GraduationCap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import SalaCard from './SalaCard';
import type { Folder } from '@/types/folder';
import type { DeckWithStats } from '@/types/deck';

interface SalaInfo {
  id: string;
  name: string;
  imageUrl?: string | null;
  deckCount: number;
  totalCards: number;
  masteredCards: number;
  questionCount: number;
  dueCount: number;
}

interface SalaListProps {
  folders: Folder[];
  decks: DeckWithStats[];
  isLoading: boolean;
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  onSalaClick: (folderId: string) => void;
}

/** Count all decks recursively (root + sub-decks) */
const countAllDecks = (rootDecks: DeckWithStats[], allDecks: DeckWithStats[]): number => {
  let count = rootDecks.length;
  const collectSubs = (parentIds: string[]) => {
    const subs = allDecks.filter(s => s.parent_deck_id && parentIds.includes(s.parent_deck_id) && !s.is_archived);
    count += subs.length;
    if (subs.length > 0) collectSubs(subs.map(s => s.id));
  };
  collectSubs(rootDecks.map(d => d.id));
  return count;
};

/** Collect all deck IDs recursively */
const collectAllDeckIds = (rootDecks: DeckWithStats[], allDecks: DeckWithStats[]): string[] => {
  const ids = rootDecks.map(d => d.id);
  const collectSubs = (parentIds: string[]) => {
    const subs = allDecks.filter(s => s.parent_deck_id && parentIds.includes(s.parent_deck_id) && !s.is_archived);
    subs.forEach(s => ids.push(s.id));
    if (subs.length > 0) collectSubs(subs.map(s => s.id));
  };
  collectSubs(rootDecks.map(d => d.id));
  return ids;
};

const SalaList = ({ folders, decks, isLoading, getAggregateStats, onSalaClick }: SalaListProps) => {
  const { user } = useAuth();
  const rootDecks = decks.filter(d => !d.parent_deck_id && !d.is_archived);

  // Fetch question counts per deck (batch query)
  const allDeckIds = decks.filter(d => !d.is_archived).map(d => d.id);
  const { data: questionCounts } = useQuery({
    queryKey: ['deck-question-counts', user?.id],
    queryFn: async () => {
      if (allDeckIds.length === 0) return new Map<string, number>();
      const { data } = await supabase
        .from('deck_questions')
        .select('deck_id')
        .in('deck_id', allDeckIds);
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + 1);
      }
      return counts;
    },
    enabled: !!user && allDeckIds.length > 0,
    staleTime: 60_000,
  });

  const getQuestionCount = (deckIds: string[]): number => {
    if (!questionCounts) return 0;
    return deckIds.reduce((sum, id) => sum + (questionCounts.get(id) ?? 0), 0);
  };

  // Build sala info for each real folder
  const realSalas: SalaInfo[] = folders
    .filter(f => !f.parent_id && !f.is_archived)
    .sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(f => {
      const folderDecks = rootDecks.filter(d => d.folder_id === f.id);
      let totalCards = 0, masteredCards = 0, dueCount = 0;
      for (const d of folderDecks) {
        totalCards += d.total_cards;
        masteredCards += d.mastered_cards;
        const collectSubs = (parentId: string) => {
          const subs = decks.filter(s => s.parent_deck_id === parentId && !s.is_archived);
          for (const sub of subs) {
            totalCards += sub.total_cards;
            masteredCards += sub.mastered_cards;
            collectSubs(sub.id);
          }
        };
        collectSubs(d.id);
        const stats = getAggregateStats(d);
        dueCount += stats.new_count + stats.learning_count + stats.review_count;
      }
      const allIds = collectAllDeckIds(folderDecks, decks);
      return {
        id: f.id,
        name: f.name,
        imageUrl: f.image_url,
        deckCount: countAllDecks(folderDecks, decks),
        totalCards,
        masteredCards,
        questionCount: getQuestionCount(allIds),
        dueCount,
      };
    });

  if (isLoading) {
    return (
      <div className="divide-y divide-border/50">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 px-4 py-4 animate-pulse">
            <div className="h-10 w-10 rounded-xl bg-muted" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (realSalas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold text-foreground">Nenhuma sala ainda</h3>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">Crie sua primeira sala para organizar seus estudos.</p>
        <p className="mt-3 text-xs text-muted-foreground">Use o botão <strong>+</strong> para criar uma sala</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {realSalas.map(sala => (
        <SalaCard
          key={sala.id}
          name={sala.name}
          deckCount={sala.deckCount}
          totalCards={sala.totalCards}
          masteredCards={sala.masteredCards}
          questionCount={sala.questionCount}
          dueCount={sala.dueCount}
          imageUrl={sala.imageUrl}
          onClick={() => onSalaClick(sala.id)}
        />
      ))}
    </div>
  );
};

export default SalaList;
