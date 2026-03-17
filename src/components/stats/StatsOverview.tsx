/**
 * StatsOverview — Streak + today cards + today time + summary period.
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Flame, Clock, CheckCircle2, Info } from 'lucide-react';
import { SectionTitle, PeriodFilterIcon } from './StatsShared';
import type { usePeriodFilter } from '@/hooks/useStatsData';

interface StatsOverviewProps {
  currentStreak: number;
  todayCards: number;
  todayMinutes: number;
  streakInfoOpen: boolean;
  setStreakInfoOpen: (v: boolean) => void;
  todayCardsInfoOpen: boolean;
  setTodayCardsInfoOpen: (v: boolean) => void;
  todayTimeInfoOpen: boolean;
  setTodayTimeInfoOpen: (v: boolean) => void;
  summaryFilter: ReturnType<typeof usePeriodFilter>;
  summaryStats: { daysStudied: number; totalDays: number; totalCards: number; avgCards: number };
}

const StatsOverview = ({
  currentStreak, todayCards, todayMinutes,
  streakInfoOpen, setStreakInfoOpen,
  todayCardsInfoOpen, setTodayCardsInfoOpen,
  todayTimeInfoOpen, setTodayTimeInfoOpen,
  summaryFilter, summaryStats,
}: StatsOverviewProps) => {
  return (
    <>
      {/* 1. Streak + Revisões hoje + Tempo hoje */}
      <Card className="px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setStreakInfoOpen(true)} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-muted/50 transition-colors">
            <Flame className={cn("h-5 w-5", currentStreak > 0 ? "text-warning fill-warning" : "text-muted-foreground/30")}
              style={currentStreak >= 3 ? { filter: 'drop-shadow(0 0 4px hsl(var(--warning) / 0.5))' } : undefined} />
            <span className="text-base font-extrabold text-foreground tabular-nums">{currentStreak}</span>
            <Info className="h-3 w-3 text-muted-foreground/60" />
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => setTodayCardsInfoOpen(true)} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-muted/50 transition-colors">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-bold text-foreground tabular-nums">{todayCards}</span>
              <span className="text-[10px] text-muted-foreground">revisões</span>
            </button>
            <div className="w-px h-4 bg-border/60" />
            <button onClick={() => setTodayTimeInfoOpen(true)} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-muted/50 transition-colors">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground tabular-nums">{todayMinutes}</span>
              <span className="text-[10px] text-muted-foreground">min</span>
            </button>
          </div>
        </div>
      </Card>

      {/* 2. Resumo do Período */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle title="Resumo" info="Visão geral do período selecionado: dias estudados, total de revisões e média por dia." />
          <PeriodFilterIcon filter={summaryFilter} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Dias estudados', value: `${summaryStats.daysStudied}/${summaryStats.totalDays}` },
            { label: 'Total revisões', value: summaryStats.totalCards.toLocaleString() },
            { label: 'Média/dia', value: String(summaryStats.avgCards) },
          ].map(item => (
            <div key={item.label} className="rounded-xl bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{item.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Info dialogs */}
      <Dialog open={streakInfoOpen} onOpenChange={setStreakInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Flame className="h-5 w-5 text-warning" />Dias seguidos</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Número de dias consecutivos que você estudou. Continue todos os dias para aumentar sua sequência!</p>
        </DialogContent>
      </Dialog>
      <Dialog open={todayCardsInfoOpen} onOpenChange={setTodayCardsInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" />Revisões hoje</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Quantidade de cards que você revisou hoje. Inclui cards novos, de revisão e reaprendizado.</p>
        </DialogContent>
      </Dialog>
      <Dialog open={todayTimeInfoOpen} onOpenChange={setTodayTimeInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Tempo de estudo hoje</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tempo total que você dedicou aos estudos hoje, calculado a partir da duração real de cada revisão.</p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatsOverview;
