/**
 * DeckStatsCard – compact study action bar with classification gauge.
 * Switches between card classification and question stats based on `mode` prop.
 */

import { useMemo } from 'react';
import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { Play, Info, Clock, HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { deriveAvgSecondsPerCard, DEFAULT_STUDY_METRICS } from '@/lib/studyUtils';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface DeckStatsCardProps {
  mode?: 'cards' | 'questions';
}

const DeckStatsCard = ({ mode = 'cards' }: DeckStatsCardProps) => {
  const {
    studyPending, isQuickReview, totalCards, deckId, navigate,
    cardCounts: serverCardCounts,
  } = useDeckDetail();
  const { user } = useAuth();

  // === Card classification from server-side RPC (handles any deck size) ===
  const diffCounts = useMemo(() => {
    if (!serverCardCounts) return { novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
    return {
      novo: serverCardCounts.diff_novo ?? 0,
      facil: serverCardCounts.diff_facil ?? 0,
      bom: serverCardCounts.diff_bom ?? 0,
      dificil: serverCardCounts.diff_dificil ?? 0,
      errei: serverCardCounts.diff_errei ?? 0,
    };
  }, [serverCardCounts]);

  // === Question stats (always fetch so hooks are stable) ===
  const { data: questionData } = useQuery({
    queryKey: ['deck-stats-questions', deckId],
    queryFn: async () => {
      // Get all descendant deck IDs
      const allIds: string[] = [deckId!];
      let frontier = [deckId!];
      while (frontier.length > 0) {
        const { data: children } = await supabase
          .from('decks').select('id').in('parent_deck_id', frontier);
        if (!children || children.length === 0) break;
        const childIds = children.map((d: any) => d.id);
        allIds.push(...childIds);
        frontier = childIds;
      }
      // Get questions
      const { data: questions } = await supabase
        .from('deck_questions' as any).select('id').in('deck_id', allIds);
      const qIds = (questions ?? []).map((q: any) => q.id);
      if (qIds.length === 0) return { total: 0, correct: 0, wrong: 0, unanswered: 0 };
      // Get latest attempts
      const { data: attempts } = await supabase
        .from('deck_question_attempts' as any)
        .select('question_id, is_correct, answered_at')
        .eq('user_id', user!.id)
        .in('question_id', qIds);
      const latestMap = new Map<string, { is_correct: boolean; answered_at: string }>();
      for (const a of (attempts ?? []) as any[]) {
        const prev = latestMap.get(a.question_id);
        if (!prev || a.answered_at > prev.answered_at) latestMap.set(a.question_id, a);
      }
      let correct = 0, wrong = 0;
      for (const [, a] of latestMap) {
        if (a.is_correct) correct++; else wrong++;
      }
      const unanswered = qIds.length - latestMap.size;
      return { total: qIds.length, correct, wrong, unanswered };
    },
    enabled: !!deckId && !!user,
    staleTime: 30_000,
  });

  const isQMode = mode === 'questions';
  const qd = questionData ?? { total: 0, correct: 0, wrong: 0, unanswered: 0 };

  // Progress — use server total, not paginated allCards.length
  const serverTotal = serverCardCounts?.total ?? 0;
  const total = isQMode ? qd.total : serverTotal;
  const progressPct = isQMode
    ? (qd.total > 0 ? Math.round((qd.correct / qd.total) * 100) : 0)
    : (serverTotal > 0 ? Math.round(((serverTotal - diffCounts.novo) / serverTotal) * 100) : 0);

  // Time estimate — based on ALL cards in the collection (not just today's due)
  const avgSec = deriveAvgSecondsPerCard(DEFAULT_STUDY_METRICS);
  const pendingForTime = isQMode ? qd.unanswered + qd.wrong : serverTotal;
  const remainingMin = Math.ceil((pendingForTime * avgSec) / 60);
  const timeLabel = remainingMin >= 60
    ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
    : `${remainingMin}min`;

  // Gauge segments
  const R = 22;
  const C = 2 * Math.PI * R;

  const segments = isQMode
    ? (qd.total > 0 ? [
        { pct: qd.correct / qd.total, color: 'hsl(var(--success))', key: 'correct' },
        { pct: qd.wrong / qd.total, color: 'hsl(var(--destructive))', key: 'wrong' },
        { pct: qd.unanswered / qd.total, color: 'hsl(var(--muted))', key: 'unanswered' },
      ] : [])
    : (serverTotal > 0 ? [
        { pct: diffCounts.facil / serverTotal, color: 'hsl(var(--info))', key: 'facil' },
        { pct: diffCounts.bom / serverTotal, color: 'hsl(var(--success))', key: 'bom' },
        { pct: diffCounts.dificil / serverTotal, color: 'hsl(var(--warning))', key: 'dificil' },
        { pct: diffCounts.errei / serverTotal, color: 'hsl(var(--destructive))', key: 'errei' },
        { pct: diffCounts.novo / serverTotal, color: 'hsl(var(--muted))', key: 'novo' },
      ] : []);

  let offset = 0;

  // Study action
  const handleStudy = () => {
    if (isQMode) {
      // Navigate to question practice (the tab handles it via autoStart)
      // We need a way to trigger practice - use a custom event or state
      window.dispatchEvent(new CustomEvent('start-question-practice'));
    } else {
      navigate(`/study/${deckId}`, { replace: true });
    }
  };

  const canStudy = isQMode
    ? qd.total > 0
    : (isQuickReview ? totalCards > 0 : studyPending > 0);

  return (
    <div className="space-y-1">
      {/* Time estimate */}
      {pendingForTime > 0 && (
        <div className="flex items-center gap-1.5 px-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Estimativa: ~{timeLabel}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Info className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="text-xs w-56 p-2">
              {isQMode
                ? 'Tempo estimado para praticar todas as questões pendentes.'
                : 'Tempo estimado para revisar todos os cartões pendentes deste baralho, com base na sua velocidade média de estudo.'}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Study bar */}
      <div className="flex items-center gap-4 py-2">
        {/* Circular gauge */}
        <div className="relative shrink-0">
          <svg width="52" height="52" viewBox="0 0 52 52" className="transform -rotate-90">
            <circle cx="26" cy="26" r={R} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth="4" />
            {segments.map(seg => {
              const len = C * seg.pct;
              if (len <= 0) return null;
              const el = (
                <circle
                  key={seg.key}
                  cx="26" cy="26" r={R} fill="none"
                  stroke={seg.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={`${-offset}`}
                  className="transition-all duration-700"
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground tabular-nums">
            {progressPct}%
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={isQMode ? 'Desempenho nas questões' : 'Classificação dos cards'}
              >
                <Info className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" side="bottom" align="start">
              {isQMode ? (
                <>
                  <p className="text-xs font-semibold text-foreground mb-2">Desempenho nas questões</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-success" />
                        <span className="text-xs text-muted-foreground">Corretas</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{qd.correct}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                        <span className="text-xs text-muted-foreground">Erradas</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{qd.wrong}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                        <span className="text-xs text-muted-foreground">A responder</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{qd.unanswered}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2 mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <span className="text-xs font-semibold text-foreground">{qd.total}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-foreground mb-2">Classificação dos cards</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-info" />
                        <span className="text-xs text-muted-foreground">Fácil</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{cardCounts.facil}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-success" />
                        <span className="text-xs text-muted-foreground">Bom</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{cardCounts.bom}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-warning" />
                        <span className="text-xs text-muted-foreground">Difícil</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{cardCounts.dificil}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                        <span className="text-xs text-muted-foreground">Errei</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{cardCounts.errei}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                        <span className="text-xs text-muted-foreground">Novo</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{cardCounts.novo}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2 mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total de cards</span>
                      <span className="text-xs font-semibold text-foreground">{allCards.length}</span>
                    </div>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Study button */}
        <Button
          onClick={handleStudy}
          className="flex-1 h-11 rounded-full text-base font-bold gap-2"
          disabled={!canStudy}
        >
          ESTUDAR
          <Play className="h-4 w-4 fill-current" />
        </Button>
      </div>
    </div>
  );
};

export default DeckStatsCard;
