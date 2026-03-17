/**
 * SalaList — renders the list of Classes (folders) at the dashboard root level.
 * Orphan decks (without folder) are shown directly at root, not in a virtual classe.
 */

import { useMemo } from 'react';
import { GraduationCap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchCommunityFolderMeta } from '@/services/dashboardService';
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
  dueCount: number;
  ownerName?: string;
  lastUpdated?: string;
}

interface SalaListProps {
  folders: Folder[];
  decks: DeckWithStats[];
  isLoading: boolean;
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  onSalaClick: (folderId: string) => void;
}

const SalaList = ({ folders, decks, isLoading, getAggregateStats, onSalaClick }: SalaListProps) => {

  // Build O(1) lookup indexes once
  const { childrenIndex, decksByFolder } = useMemo(() => {
    const ci = new Map<string, DeckWithStats[]>();
    const df = new Map<string, DeckWithStats[]>();
    for (const d of decks) {
      if (d.is_archived) continue;
      if (d.parent_deck_id) {
        const arr = ci.get(d.parent_deck_id) ?? [];
        arr.push(d);
        ci.set(d.parent_deck_id, arr);
      }
      if (d.folder_id && !d.parent_deck_id) {
        const arr = df.get(d.folder_id) ?? [];
        arr.push(d);
        df.set(d.folder_id, arr);
      }
    }
    return { childrenIndex: ci, decksByFolder: df };
  }, [decks]);

  /** Count all decks recursively using childrenIndex O(1) lookups */
  const countAllDecksRecursive = (rootDecks: DeckWithStats[]): number => {
    let count = rootDecks.length;
    const collectSubs = (parents: DeckWithStats[]) => {
      for (const p of parents) {
        const subs = childrenIndex.get(p.id) ?? [];
        count += subs.length;
        if (subs.length > 0) collectSubs(subs);
      }
    };
    collectSubs(rootDecks);
    return count;
  };

  /** Collect all deck IDs recursively using childrenIndex */
  const collectAllDeckIds = (rootDecks: DeckWithStats[]): string[] => {
    const ids: string[] = [];
    const collect = (parents: DeckWithStats[]) => {
      for (const p of parents) {
        ids.push(p.id);
        const subs = childrenIndex.get(p.id) ?? [];
        if (subs.length > 0) collect(subs);
      }
    };
    collect(rootDecks);
    return ids;
  };

  // Fetch question counts removed

  // Identify community-followed folders
  const communityFolderIds = useMemo(() =>
    folders
      .filter(f => !f.parent_id && !f.is_archived && f.source_turma_id)
      .map(f => ({ folderId: f.id, turmaId: f.source_turma_id! })),
    [folders]
  );

  // Fetch owner names and last updated for community folders
  const turmaIds = useMemo(() => communityFolderIds.map(c => c.turmaId), [communityFolderIds]);
  const { data: communityMeta } = useQuery({
    queryKey: ['sala-list-community-meta', turmaIds.join(',')],
    queryFn: () => fetchCommunityFolderMeta(turmaIds),
    enabled: turmaIds.length > 0,
    staleTime: 60_000,
  });

  // Build sala info for each real folder
  const realSalas: SalaInfo[] = useMemo(() =>
    folders
      .filter(f => !f.parent_id && !f.is_archived)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(f => {
        const isCommunity = !!f.source_turma_id;
        const meta = isCommunity && communityMeta ? communityMeta.get(f.source_turma_id!) : undefined;

        const folderDecks = decksByFolder.get(f.id) ?? [];
        let totalCards = 0, masteredCards = 0, dueCount = 0;

        const collectStats = (deckList: DeckWithStats[]) => {
          for (const d of deckList) {
            totalCards += d.total_cards;
            masteredCards += Math.max(0, (d.total_cards ?? 0) - (d.class_novo ?? 0));
            const subs = childrenIndex.get(d.id) ?? [];
            if (subs.length > 0) collectStats(subs);
          }
        };
        collectStats(folderDecks);

        for (const d of folderDecks) {
          const stats = getAggregateStats(d);
          dueCount += stats.new_count + stats.learning_count + stats.review_count;
        }

        const allIds = collectAllDeckIds(folderDecks);

        return {
          id: f.id,
          name: f.name,
          imageUrl: isCommunity && meta?.coverUrl ? meta.coverUrl : f.image_url,
          deckCount: countAllDecksRecursive(folderDecks),
          totalCards,
          masteredCards,
          dueCount,
          ownerName: meta?.ownerName,
          lastUpdated: meta?.lastUpdated,
        };
      }),
    [folders, decksByFolder, childrenIndex, communityMeta, getAggregateStats]
  );

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
          ownerName={sala.ownerName}
          lastUpdated={sala.lastUpdated}
          onClick={() => onSalaClick(sala.id)}
        />
      ))}
    </div>
  );
};

export default SalaList;
