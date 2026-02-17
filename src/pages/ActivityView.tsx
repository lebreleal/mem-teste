import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Flame, Trophy, CheckCircle, ChevronLeft, ChevronRight, Clock, TrendingUp, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type TabKey = 'streak' | 'today' | 'week';

const TAB_CONFIG: Record<TabKey, { label: string; icon: typeof Flame; color: string }> = {
  streak: { label: 'Ofensiva', icon: Flame, color: 'hsl(var(--warning))' },
  today: { label: 'Hoje', icon: Clock, color: 'hsl(var(--primary))' },
  week: { label: '7 dias', icon: TrendingUp, color: 'hsl(var(--success))' },
};

interface DayData {
  date: string;
  cards: number;
  minutes: number;
}

const ActivityView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'streak';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(format(new Date(), 'yyyy-MM-dd'));

  const { data: studyData } = useQuery({
    queryKey: ['activity-full', user?.id],
    queryFn: async () => {
      if (!user) return { dayMap: {} as Record<string, DayData>, streak: 0, bestStreak: 0, totalActiveDays: 0 };

      const { data: logs } = await supabase
        .from('review_logs')
        .select('reviewed_at')
        .eq('user_id', user.id)
        .order('reviewed_at', { ascending: true });

      if (!logs?.length) return { dayMap: {} as Record<string, DayData>, streak: 0, bestStreak: 0, totalActiveDays: 0 };

      const dayMap: Record<string, DayData> = {};
      logs.forEach(log => {
        const key = format(startOfDay(new Date(log.reviewed_at)), 'yyyy-MM-dd');
        if (!dayMap[key]) dayMap[key] = { date: key, cards: 0, minutes: 0 };
        dayMap[key].cards += 1;
        dayMap[key].minutes = Math.round((dayMap[key].cards * 8) / 60);
      });

      const totalActiveDays = Object.keys(dayMap).length;

      // Current streak
      const today = format(startOfDay(new Date()), 'yyyy-MM-dd');
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      let streak = 0;
      let checkDate = new Date();
      if (!dayMap[today] && !dayMap[yesterday]) {
        streak = 0;
      } else {
        if (!dayMap[today]) checkDate = subDays(new Date(), 1);
        while (dayMap[format(startOfDay(checkDate), 'yyyy-MM-dd')]) {
          streak++;
          checkDate = subDays(checkDate, 1);
        }
      }

      // Best streak
      const allSorted = Object.keys(dayMap).sort();
      let bestStreak = allSorted.length > 0 ? 1 : 0;
      let currentRun = 1;
      for (let i = 1; i < allSorted.length; i++) {
        const diff = (new Date(allSorted[i]).getTime() - new Date(allSorted[i - 1]).getTime()) / 86400000;
        if (diff === 1) { currentRun++; } else { bestStreak = Math.max(bestStreak, currentRun); currentRun = 1; }
      }
      bestStreak = Math.max(bestStreak, currentRun);

      return { dayMap, streak, bestStreak, totalActiveDays };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { dayMap = {}, streak = 0, bestStreak = 0, totalActiveDays = 0 } = studyData ?? {};

  // Derived stats
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayData = dayMap[todayKey];
  const last7Days = useMemo(() => {
    let cards = 0, minutes = 0;
    for (let i = 0; i < 7; i++) {
      const k = format(subDays(new Date(), i), 'yyyy-MM-dd');
      if (dayMap[k]) { cards += dayMap[k].cards; minutes += dayMap[k].minutes; }
    }
    return { cards, minutes, avgMinutes: Math.round(minutes / 7) };
  }, [dayMap]);

  const selectedDayData = selectedDate ? dayMap[selectedDate] : null;

  // Calendar
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth]);

  const today = startOfDay(new Date());

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

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">
        {/* Tab selector */}
        <div className="flex gap-2 rounded-xl border border-border/50 bg-card p-1">
          {(Object.entries(TAB_CONFIG) as [TabKey, typeof TAB_CONFIG[TabKey]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Summary card based on active tab */}
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          {activeTab === 'streak' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--warning) / 0.12)' }}>
                    <Flame className="h-6 w-6" style={{ color: 'hsl(var(--warning))' }} />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-foreground tabular-nums">{streak}</p>
                    <p className="text-xs text-muted-foreground">dias seguidos</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <Trophy className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{bestStreak}</p>
                  <p className="text-[10px] text-muted-foreground">Maior sequência</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <CheckCircle className="h-5 w-5 text-success mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{totalActiveDays}</p>
                  <p className="text-[10px] text-muted-foreground">Dias ativos</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'today' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--primary) / 0.12)' }}>
                  <Clock className="h-6 w-6" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground tabular-nums">{todayData?.minutes ?? 0}m</p>
                  <p className="text-xs text-muted-foreground">estudados hoje</p>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cards revisados</span>
                <span className="text-lg font-bold text-foreground tabular-nums">{todayData?.cards ?? 0}</span>
              </div>
            </div>
          )}

          {activeTab === 'week' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--success) / 0.12)' }}>
                  <TrendingUp className="h-6 w-6" style={{ color: 'hsl(var(--success))' }} />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground tabular-nums">{last7Days.avgMinutes}m</p>
                  <p className="text-xs text-muted-foreground">média diária (7 dias)</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{last7Days.cards}</p>
                  <p className="text-[10px] text-muted-foreground">Cards na semana</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{last7Days.minutes}m</p>
                  <p className="text-[10px] text-muted-foreground">Tempo total</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
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
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarDays.startPadding }).map((_, i) => <div key={`pad-${i}`} />)}
            {calendarDays.days.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const studied = !!dayMap[key];
              const isToday = isSameDay(day, today);
              const isFuture = day > today;
              const isSelected = selectedDate === key;

              return (
                <div key={key} className="flex items-center justify-center">
                  <button
                    onClick={() => !isFuture && setSelectedDate(key)}
                    disabled={isFuture}
                    className={cn(
                      "flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full text-sm transition-all",
                      isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      studied && !isToday && "border-2 border-primary text-foreground",
                      studied && isToday && "bg-primary text-primary-foreground font-bold",
                      !studied && isToday && "bg-warning/20 text-foreground font-bold border-2 border-warning",
                      !studied && !isToday && !isFuture && "text-muted-foreground hover:bg-muted/50",
                      isFuture && "text-muted-foreground/40 cursor-default",
                    )}
                  >
                    {day.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDate && (
          <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm space-y-2">
            <p className="text-sm font-semibold text-foreground capitalize">
              <Calendar className="inline h-4 w-4 mr-1.5 text-muted-foreground" />
              {format(new Date(selectedDate + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
            {selectedDayData ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-lg font-bold text-foreground tabular-nums">{selectedDayData.cards}</p>
                  <p className="text-[10px] text-muted-foreground">Cards revisados</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-lg font-bold text-foreground tabular-nums">{selectedDayData.minutes}m</p>
                  <p className="text-[10px] text-muted-foreground">Tempo de estudo</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground pt-1">Nenhum estudo registrado neste dia.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ActivityView;
