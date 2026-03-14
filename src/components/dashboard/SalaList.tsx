/**
 * SalaList — renders the list of Salas (folders) at the dashboard root level.
 * Includes a virtual "Meus Estudos" sala for orphan decks.
 */

import { GraduationCap } from 'lucide-react';
import SalaCard from './SalaCard';
import type { Folder } from '@/types/folder';
import type { DeckWithStats } from '@/types/deck';

interface SalaInfo {
  id: string;
  name: string;
  isVirtual?: boolean;
  imageUrl?: string | null;
  subjectCount: number;
  totalCards: number;
  masteredCards: number;
  dueCount: number;
}

interface SalaListProps {
  folders: Folder[];
  decks: DeckWithStats[];
  isLoading: boolean;
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  onSalaClick: (folderId: string, isVirtual?: boolean) => void;
}

const VIRTUAL_SALA_ID = '__meus_estudos__';

const SalaList = ({ folders, decks, isLoading, getAggregateStats, onSalaClick }: SalaListProps) => {
  const rootDecks = decks.filter(d => !d.parent_deck_id && !d.is_archived);

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
        // Aggregate sub-deck cards too
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
      return {
        id: f.id,
        name: f.name,
        imageUrl: f.image_url,
        subjectCount: folderDecks.length,
        totalCards,
        masteredCards,
        dueCount,
      };
    });

  // Orphan decks (no folder_id) → virtual "Meus Estudos"
  const orphanDecks = rootDecks.filter(d => !d.folder_id);
  let virtualSala: SalaInfo | null = null;
  if (orphanDecks.length > 0) {
    let totalCards = 0, masteredCards = 0, dueCount = 0;
    for (const d of orphanDecks) {
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
    virtualSala = {
      id: VIRTUAL_SALA_ID,
      name: 'Meus Estudos',
      isVirtual: true,
      subjectCount: orphanDecks.length,
      totalCards,
      masteredCards,
      dueCount,
    };
  }

  const allSalas = [...realSalas, ...(virtualSala ? [virtualSala] : [])];

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

  if (allSalas.length === 0) {
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
      {allSalas.map(sala => (
        <SalaCard
          key={sala.id}
          name={sala.name}
          subjectCount={sala.subjectCount}
          totalCards={sala.totalCards}
          masteredCards={sala.masteredCards}
          dueCount={sala.dueCount}
          isVirtual={sala.isVirtual}
          imageUrl={sala.imageUrl}
          onClick={() => onSalaClick(sala.id, sala.isVirtual)}
        />
      ))}
    </div>
  );
};

export { VIRTUAL_SALA_ID };
export default SalaList;
