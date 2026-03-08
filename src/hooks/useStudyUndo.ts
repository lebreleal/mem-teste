/**
 * Extracted from Study.tsx — undo/redo logic for study session.
 */
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface UndoSnapshot {
  queue: any[];
  reviewCount: number;
  cardKey: number;
  cardId: string;
  prevCardState: {
    stability: number;
    difficulty: number;
    state: number;
    scheduled_date: string;
    last_reviewed_at: string | null;
  };
}

export function useStudyUndo(
  setLocalQueue: React.Dispatch<React.SetStateAction<any[]>>,
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
    reviewedCardIdsRef.current.delete(undoSnapshot.cardId);
    setUndoSnapshot(null);

    try {
      await supabase
        .from('cards')
        .update({
          stability: undoSnapshot.prevCardState.stability,
          difficulty: undoSnapshot.prevCardState.difficulty,
          state: undoSnapshot.prevCardState.state,
          scheduled_date: undoSnapshot.prevCardState.scheduled_date,
          last_reviewed_at: undoSnapshot.prevCardState.last_reviewed_at,
        } as any)
        .eq('id', undoSnapshot.cardId);

      const { data: logs } = await supabase
        .from('review_logs')
        .select('id')
        .eq('card_id', undoSnapshot.cardId)
        .order('reviewed_at', { ascending: false })
        .limit(1);
      if (logs && logs.length > 0) {
        await supabase.from('review_logs').delete().eq('id', logs[0].id);
      }

      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
    } catch {
      toast({ title: 'Erro ao desfazer no banco', variant: 'destructive' });
    }
  }, [undoSnapshot, queryClient, toast, setLocalQueue, setReviewCount, setCardKey, reviewedCardIdsRef]);

  return {
    undoSnapshot,
    saveSnapshot,
    canUndo: !!undoSnapshot,
    handleUndo,
  };
}
