/**
 * Extracted from Study.tsx — undo/redo logic for study session.
 * Supports review, bury, and freeze undo.
 */
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { StudyCard } from '@/types/study';

export interface UndoSnapshot {
  queue: StudyCard[];
  reviewCount: number;
  cardKey: number;
  cardId: string;
  actionType: 'review' | 'bury' | 'freeze';
  prevCardState: {
    stability: number;
    difficulty: number;
    state: number;
    scheduled_date: string;
    last_reviewed_at: string | null;
  };
  /** Sibling IDs also buried (for cloze bury undo) */
  buriedSiblingIds?: string[];
  /** Original scheduled_dates for buried siblings */
  buriedSiblingDates?: Record<string, string>;
}

export function useStudyUndo(
  setLocalQueue: React.Dispatch<React.SetStateAction<StudyCard[]>>,
  setReviewCount: React.Dispatch<React.SetStateAction<number>>,
  setCardKey: React.Dispatch<React.SetStateAction<number>>,
  reviewedCardIdsRef: React.MutableRefObject<Set<string>>,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);

  const saveSnapshot = useCallback((snapshot: UndoSnapshot) => {
    setUndoSnapshot(snapshot);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoSnapshot) return;
    setLocalQueue(undoSnapshot.queue);
    setReviewCount(undoSnapshot.reviewCount);
    setCardKey(undoSnapshot.cardKey);
    setUndoSnapshot(null);

    const { actionType, cardId, prevCardState } = undoSnapshot;

    try {
      if (actionType === 'review') {
        reviewedCardIdsRef.current.delete(cardId);
        await supabase
          .from('cards')
          .update({
            stability: prevCardState.stability,
            difficulty: prevCardState.difficulty,
            state: prevCardState.state,
            scheduled_date: prevCardState.scheduled_date,
            last_reviewed_at: prevCardState.last_reviewed_at,
          })
          .eq('id', cardId);

        const { data: logs } = await supabase
          .from('review_logs')
          .select('id')
          .eq('card_id', cardId)
          .order('reviewed_at', { ascending: false })
          .limit(1);
        if (logs && logs.length > 0) {
          await supabase.from('review_logs').delete().eq('id', logs[0].id);
        }
      } else if (actionType === 'bury') {
        // Restore card's original scheduled_date
        await supabase
          .from('cards')
          .update({ scheduled_date: prevCardState.scheduled_date })
          .eq('id', cardId);

        // Restore buried siblings
        if (undoSnapshot.buriedSiblingIds?.length) {
          const siblingDates = undoSnapshot.buriedSiblingDates ?? {};
          await Promise.all(
            undoSnapshot.buriedSiblingIds.map(sibId =>
              supabase
                .from('cards')
                .update({ scheduled_date: siblingDates[sibId] ?? prevCardState.scheduled_date })
                .eq('id', sibId)
            )
          );
        }
        toast({ title: 'Enterramento desfeito' });
      } else if (actionType === 'freeze') {
        // Restore card to its previous state
        await supabase
          .from('cards')
          .update({
            state: prevCardState.state,
            stability: prevCardState.stability,
            difficulty: prevCardState.difficulty,
            scheduled_date: prevCardState.scheduled_date,
          })
          .eq('id', cardId);
        toast({ title: 'Suspensão desfeita' });
      }

      // Defer heavy invalidations
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['decks'] });
        queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
        queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
        queryClient.invalidateQueries({ queryKey: ['study-stats'] });
        queryClient.invalidateQueries({ queryKey: ['activity-full'] });
      }, 10_000);
    } catch {
      toast({ title: 'Erro ao desfazer', variant: 'destructive' });
    }
  }, [undoSnapshot, queryClient, toast, setLocalQueue, setReviewCount, setCardKey, reviewedCardIdsRef]);

  return {
    undoSnapshot,
    saveSnapshot,
    canUndo: !!undoSnapshot,
    handleUndo,
  };
}
