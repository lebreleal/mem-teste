import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Flame, Trophy, CheckCircle, ChevronLeft, ChevronRight, Calendar, Snowflake, Info, Clock, SquarePlus, RotateCcw, Layers } from 'lucide-react';
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
  const [newCardsInfoOpen, setNewCardsInfoOpen] = useState(false);
  const [learningInfoOpen, setLearningInfoOpen] = useState(false);
  const [reviewInfoOpen, setReviewInfoOpen] = useState(false);
  const [relearningInfoOpen, setRelearningInfoOpen] = useState(false);
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
        .order('reviewed_at', { ascending: true })
        .limit(50000);

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
        dayMap[key].minutes = dayMap[key].minutes > 0 ? Math.max(1, Math.round(dayMap[key].minutes / 60000)) : 0;
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
        <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            {/* Streak */}
            <div className="flex items-center gap-2">
              <Flame
                className={cn(
                  "h-6 w-6 transition-all flex-shrink-0",
                  streak > 0 ? "text-warning fill-warning" : "text-muted-foreground/30"
                )}
                strokeWidth={isIntense ? 2.5 : 2}
                style={streak > 0 ? {
                  filter: isIntense
                    ? 'drop-shadow(0 0 8px hsl(var(--warning) / 0.6))'
                    : 'drop-shadow(0 0 4px hsl(var(--warning) / 0.3))',
                } : undefined}
              />
              <span className="text-2xl font-extrabold text-foreground tabular-nums leading-none">{streak}</span>
              <span className="text-xs text-muted-foreground">dias<br/>seguidos</span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBestStreakInfoOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground tabular-nums">{bestStreak}</span>
                <Info className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                onClick={() => setActiveDaysInfoOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-bold text-foreground tabular-nums">{totalActiveDays}</span>
                <Info className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                onClick={() => setFreezeInfoOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Snowflake className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-bold text-foreground tabular-nums">{freezesAvailable}</span>
                <Info className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
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
                {/* Card breakdown - single row, always show all */}
                <div className="grid grid-cols-4 gap-2">
                  <button onClick={() => setNewCardsInfoOpen(true)} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-2.5 hover:bg-muted transition-colors">
                    <SquarePlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.newCards}</span>
                    <span className="text-[10px] text-muted-foreground">Novos</span>
                  </button>
                  <button onClick={() => setLearningInfoOpen(true)} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-2.5 hover:bg-muted transition-colors">
                    <RotateCcw className="h-4 w-4 text-warning" />
                    <span className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.learning}</span>
                    <span className="text-[10px] text-muted-foreground">Aprendendo</span>
                  </button>
                  <button onClick={() => setReviewInfoOpen(true)} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-2.5 hover:bg-muted transition-colors">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.review}</span>
                    <span className="text-[10px] text-muted-foreground">Dominados</span>
                  </button>
                  <button onClick={() => setRelearningInfoOpen(true)} className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-2.5 hover:bg-muted transition-colors">
                    <RotateCcw className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-bold text-foreground tabular-nums">{selectedDayData.relearning}</span>
                    <span className="text-[10px] text-muted-foreground">Reaprendendo</span>
                  </button>
                </div>
                {/* Total */}
                <p className="text-xs text-muted-foreground text-center">{selectedDayData.cards} cards no total</p>
              </div>
            ) : !isFrozenDay ? (
              <p className="text-sm text-muted-foreground pt-1">Nenhum estudo registrado neste dia.</p>
            ) : null}
          </div>
        )}

        {/* Card type info dialogs */}
        <Dialog open={newCardsInfoOpen} onOpenChange={setNewCardsInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SquarePlus className="h-5 w-5 text-muted-foreground" />
                Novos
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Cards que você viu pela primeira vez neste dia. São cartões que nunca foram estudados antes.
            </p>
          </DialogContent>
        </Dialog>

        <Dialog open={learningInfoOpen} onOpenChange={setLearningInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-warning" />
                Aprendendo
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Cards na fase inicial de aprendizado. Eles aparecem várias vezes na mesma sessão até que você os memorize o suficiente para entrar na repetição espaçada.
            </p>
          </DialogContent>
        </Dialog>

        <Dialog open={reviewInfoOpen} onOpenChange={setReviewInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Dominados
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Cards que já foram graduados e estão em repetição espaçada. Eles aparecem em intervalos cada vez maiores conforme você os domina.
            </p>
          </DialogContent>
        </Dialog>

        <Dialog open={relearningInfoOpen} onOpenChange={setRelearningInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-destructive" />
                Reaprendendo
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Cards dominados que você errou durante a revisão. Eles voltam para a fase de aprendizado até serem memorizados novamente.
            </p>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ActivityView;
