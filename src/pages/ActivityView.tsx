import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Flame, Trophy, CheckCircle, ChevronLeft, ChevronRight, Calendar, Snowflake, Info, Clock, BookOpen, GraduationCap, RotateCcw, Sparkles } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { calculateStreakWithFreezes } from '@/lib/streakUtils';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface DayData {
  date: string;
  cards: number;
  minutes: number;
  newCards: number;
  learning: number;
  review: number;
  relearning: number;
}

const ActivityView = () => {
  const [freezeInfoOpen, setFreezeInfoOpen] = useState(false);
  const [bestStreakInfoOpen, setBestStreakInfoOpen] = useState(false);
  const [activeDaysInfoOpen, setActiveDaysInfoOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(format(new Date(), 'yyyy-MM-dd'));

  const { data: studyData, isLoading } = useQuery({
    queryKey: ['activity-full', user?.id],
    queryFn: async () => {
      if (!user) return { dayMap: {} as Record<string, DayData>, streak: 0, bestStreak: 0, totalActiveDays: 0, freezesAvailable: 0, freezesUsed: 0, frozenDays: new Set<string>() };

      const { data: logs } = await supabase
        .from('review_logs')
        .select('reviewed_at, elapsed_ms, state')
        .eq('user_id', user.id)
        .order('reviewed_at', { ascending: true });

      if (!logs?.length) return { dayMap: {} as Record<string, DayData>, streak: 0, bestStreak: 0, totalActiveDays: 0, freezesAvailable: 0, freezesUsed: 0, frozenDays: new Set<string>() };

      const dayMap: Record<string, DayData> = {};
      const MIN_MS = 1500;
      const MAX_MS = 120000;

      logs.forEach((log, i) => {
        const d = new Date(log.reviewed_at);
        const key = format(startOfDay(d), 'yyyy-MM-dd');
        if (!dayMap[key]) dayMap[key] = { date: key, cards: 0, minutes: 0, newCards: 0, learning: 0, review: 0, relearning: 0 };
        dayMap[key].cards += 1;

        // Count by state
        const state = log.state ?? null;
        if (state === 0) dayMap[key].newCards += 1;
        else if (state === 1) dayMap[key].learning += 1;
        else if (state === 2) dayMap[key].review += 1;
        else if (state === 3) dayMap[key].relearning += 1;
        else dayMap[key].review += 1; // fallback

        // Accumulate real time per card
        let ms = 0;
        if (log.elapsed_ms && log.elapsed_ms >= MIN_MS && log.elapsed_ms <= MAX_MS) {
          ms = log.elapsed_ms;
        } else if (i > 0) {
          const gap = d.getTime() - new Date(logs[i - 1].reviewed_at).getTime();
          if (gap >= MIN_MS && gap <= MAX_MS) {
            ms = gap;
          } else if (gap > MAX_MS) {
            ms = 15000; // session break bonus
          }
        } else {
          ms = 15000; // first card estimate
        }
        dayMap[key].minutes += ms;
      });

      // Convert accumulated ms to minutes
      for (const key of Object.keys(dayMap)) {
        dayMap[key].minutes = Math.round(dayMap[key].minutes / 60000);
      }

      const totalActiveDays = Object.keys(dayMap).length;

      // Streak with freezes
      const { streak, freezesAvailable, freezesUsed, frozenDays } = calculateStreakWithFreezes(logs.map(l => l.reviewed_at));

      // Best streak (simple, no freezes)
      const allSorted = Object.keys(dayMap).sort();
      let bestStreak = allSorted.length > 0 ? 1 : 0;
      let currentRun = 1;
      for (let i = 1; i < allSorted.length; i++) {
        const diff = (new Date(allSorted[i]).getTime() - new Date(allSorted[i - 1]).getTime()) / 86400000;
        if (diff === 1) { currentRun++; } else { bestStreak = Math.max(bestStreak, currentRun); currentRun = 1; }
      }
      bestStreak = Math.max(bestStreak, currentRun);

      return { dayMap, streak, bestStreak, totalActiveDays, freezesAvailable, freezesUsed, frozenDays };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { dayMap = {}, streak = 0, bestStreak = 0, totalActiveDays = 0, freezesAvailable = 0, freezesUsed = 0, frozenDays = new Set<string>() } = studyData ?? {};

  const selectedDayData = selectedDate ? dayMap[selectedDate] : null;
  const isFrozenDay = selectedDate ? frozenDays.has(selectedDate) : false;

  // Calendar
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth]);

  const today = startOfDay(new Date());
  const isIntense = streak >= 7;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-display font-bold text-foreground">Atividade</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-lg space-y-4">
        {/* Streak hero card */}
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Flame
              className={cn(
                "h-8 w-8 transition-all flex-shrink-0",
                streak > 0 ? "text-warning fill-warning" : "text-muted-foreground/30"
              )}
              strokeWidth={isIntense ? 2.5 : 2}
              style={streak > 0 ? {
                filter: isIntense
                  ? 'drop-shadow(0 0 8px hsl(var(--warning) / 0.6))'
                  : 'drop-shadow(0 0 4px hsl(var(--warning) / 0.3))',
              } : undefined}
            />
            <p className="text-3xl font-extrabold text-foreground tabular-nums leading-none">{streak}</p>
            <p className="text-sm text-muted-foreground">dias seguidos</p>
          </div>

          {/* Stats row - all inline */}
          <div className="flex items-center gap-4 mt-4 justify-between">
            <button
              onClick={() => setBestStreakInfoOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-base font-bold text-foreground tabular-nums">{bestStreak}</span>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setActiveDaysInfoOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-base font-bold text-foreground tabular-nums">{totalActiveDays}</span>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setFreezeInfoOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Snowflake className="h-4 w-4 text-blue-400" />
              <span className="text-base font-bold text-foreground tabular-nums">{freezesAvailable}</span>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Info dialogs */}
        <Dialog open={bestStreakInfoOpen} onOpenChange={setBestStreakInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Melhor sequência
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              O maior número de dias consecutivos que você estudou. Continue estudando todos os dias para bater seu recorde!
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
              <Trophy className="h-5 w-5 text-primary" />
              <span className="text-foreground font-bold text-lg tabular-nums">{bestStreak}</span>
              <span className="text-muted-foreground">dias</span>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={activeDaysInfoOpen} onOpenChange={setActiveDaysInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Dias ativos
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Total de dias em que você revisou pelo menos um card. Cada dia de estudo conta, mesmo que não sejam consecutivos.
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <span className="text-foreground font-bold text-lg tabular-nums">{totalActiveDays}</span>
              <span className="text-muted-foreground">dias</span>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={freezeInfoOpen} onOpenChange={setFreezeInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Snowflake className="h-5 w-5 text-blue-400" />
                Congelamentos
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>A cada <strong className="text-foreground">7 dias seguidos</strong> estudando, você ganha <strong className="text-foreground">1 congelamento</strong>.</p>
              <p>Se você esquecer de estudar em um dia, um congelamento é usado automaticamente para manter sua sequência de dias seguidos.</p>
              <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
                <Snowflake className="h-5 w-5 text-blue-400" />
                <span className="text-foreground font-bold text-lg tabular-nums">{freezesAvailable}</span>
                <span className="text-muted-foreground">disponíveis</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Calendar */}
        <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarDays.startPadding }).map((_, i) => <div key={`pad-${i}`} />)}
            {calendarDays.days.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const studied = !!dayMap[key];
              const frozen = frozenDays.has(key);
              const isToday = isSameDay(day, today);
              const isFuture = day > today;
              const isSelected = selectedDate === key;

              return (
                <div key={key} className="flex items-center justify-center">
                  <button
                    onClick={() => !isFuture && setSelectedDate(key)}
                    disabled={isFuture}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all",
                      isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      studied && isToday && "bg-primary text-primary-foreground font-bold",
                      studied && !isToday && "bg-success/20 text-success font-semibold",
                      frozen && !studied && "bg-blue-500/15 text-blue-400 font-semibold",
                      !studied && !frozen && isToday && "bg-warning/20 text-foreground font-bold border-2 border-warning/50",
                      !studied && !frozen && !isToday && !isFuture && "text-muted-foreground hover:bg-muted/50",
                      isFuture && "text-muted-foreground/30 cursor-default",
                    )}
                  >
                    {day.getDate()}
                    {frozen && !studied && (
                      <Snowflake className="absolute -top-0.5 -right-0.5 h-3 w-3 text-blue-400" />
                    )}
                    {studied && !isToday && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-success" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
              <span className="text-[10px] text-muted-foreground">Estudou</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Snowflake className="h-2.5 w-2.5 text-blue-400" />
              <span className="text-[10px] text-muted-foreground">Congelado</span>
            </div>
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDate && (
          <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm space-y-2">
            <p className="text-sm font-semibold text-foreground capitalize">
              <Calendar className="inline h-4 w-4 mr-1.5 text-muted-foreground" />
              {format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
            {isFrozenDay && !selectedDayData && (
              <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 p-3">
                <Snowflake className="h-5 w-5 text-blue-400" />
                <span className="text-sm text-blue-400 font-medium">Congelamento usado</span>
              </div>
            )}
            {selectedDayData ? (
              <div className="space-y-3 pt-1">
                {/* Time */}
                <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
                  <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground">{selectedDayData.minutes}min de estudo</span>
                </div>
                {/* Card breakdown */}
                <div className="grid grid-cols-2 gap-2">
                  {selectedDayData.newCards > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5">
                      <Sparkles className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.newCards}</p>
                        <p className="text-[10px] text-muted-foreground">Novos</p>
                      </div>
                    </div>
                  )}
                  {selectedDayData.learning > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5">
                      <BookOpen className="h-4 w-4 text-warning flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.learning}</p>
                        <p className="text-[10px] text-muted-foreground">Aprendendo</p>
                      </div>
                    </div>
                  )}
                  {selectedDayData.review > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5">
                      <GraduationCap className="h-4 w-4 text-success flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.review}</p>
                        <p className="text-[10px] text-muted-foreground">Revisão</p>
                      </div>
                    </div>
                  )}
                  {selectedDayData.relearning > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5">
                      <RotateCcw className="h-4 w-4 text-destructive flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.relearning}</p>
                        <p className="text-[10px] text-muted-foreground">Reaprendendo</p>
                      </div>
                    </div>
                  )}
                </div>
                {/* Total */}
                <p className="text-xs text-muted-foreground text-center">{selectedDayData.cards} cards no total</p>
              </div>
            ) : !isFrozenDay ? (
              <p className="text-sm text-muted-foreground pt-1">Nenhum estudo registrado neste dia.</p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
};

export default ActivityView;
