import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Flame } from 'lucide-react';
import { startOfDay, subDays, getDay, format } from 'date-fns';

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const WeekStrip = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: stats, isLoading } = useStudyStats();

  const { data: studiedDays } = useQuery({
    queryKey: ['week-studied-days', user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const today = startOfDay(new Date());
      const todayDow = getDay(today);
      const sunday = subDays(today, todayDow);

      const { data: logs } = await supabase
        .from('review_logs')
        .select('reviewed_at')
        .eq('user_id', user.id)
        .gte('reviewed_at', sunday.toISOString())
        .order('reviewed_at', { ascending: false });

      const set = new Set<string>();
      logs?.forEach(l => set.add(format(startOfDay(new Date(l.reviewed_at)), 'yyyy-MM-dd')));
      return set;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const todayDow = getDay(today);
    const sunday = subDays(today, todayDow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const key = format(d, 'yyyy-MM-dd');
      return {
        label: WEEKDAY_LABELS[i],
        date: d.getDate(),
        key,
        isToday: d.getTime() === today.getTime(),
        isFuture: d > today,
        studied: studiedDays?.has(key) ?? false,
      };
    });
  }, [studiedDays]);

  if (isLoading || !stats) {
    return <div className="h-[56px] animate-pulse rounded-2xl bg-muted" />;
  }

  const streak = stats.streak;
  const hasStreak = streak > 0;
  // Fire intensity: bigger flame at streak >= 7
  const isIntense = streak >= 7;
  const flameSize = isIntense ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-5 w-5 sm:h-6 sm:w-6';

  return (
    <button
      onClick={() => navigate('/activity?tab=streak')}
      className="w-full flex items-center gap-3 rounded-2xl border border-border/40 bg-card px-3 py-2.5 sm:px-5 sm:py-3 shadow-sm hover:bg-muted/30 transition-colors cursor-pointer"
      style={{ borderRadius: 'var(--radius)' }}
    >
      {/* Days grid */}
      <div className="flex-1 grid grid-cols-7 gap-0">
        {days.map((day, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide ${
              day.isToday ? 'text-primary' : day.studied ? 'text-success' : 'text-muted-foreground'
            }`}>
              {day.label}
            </span>
            <span className={`text-sm sm:text-base font-bold tabular-nums ${
              day.isToday
                ? 'text-foreground'
                : day.studied
                  ? 'text-success'
                  : day.isFuture
                    ? 'text-muted-foreground/40'
                    : 'text-muted-foreground'
            }`}>
              {day.date}
            </span>
            {day.studied && !day.isToday && (
              <span className="h-1 w-1 rounded-full bg-success" />
            )}
          </div>
        ))}
      </div>

      {/* Streak fire icon */}
      <div className="flex-shrink-0 relative flex items-center justify-center">
        <div className="relative flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11">
          {hasStreak && (
            <div className="absolute inset-0 rounded-full bg-warning/15 blur-sm" />
          )}
          <Flame
            className={`${flameSize} transition-all duration-300 relative z-10 ${
              hasStreak ? 'text-warning' : 'text-muted-foreground/30'
            }`}
            strokeWidth={isIntense ? 2.5 : 2}
            style={hasStreak ? {
              filter: isIntense
                ? 'drop-shadow(0 0 6px hsl(var(--warning) / 0.5))'
                : 'drop-shadow(0 0 3px hsl(var(--warning) / 0.3))',
              animation: isIntense
                ? 'streak-flame 1.5s ease-in-out infinite'
                : 'streak-pulse 2.5s ease-in-out infinite',
            } : undefined}
          />
        </div>

        {/* Streak badge — top right */}
        {hasStreak && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-warning text-[10px] font-extrabold text-warning-foreground text-center leading-[18px] shadow-md ring-2 ring-card">
            {streak}
          </span>
        )}
      </div>

      <style>{`
        @keyframes streak-flame {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            filter: drop-shadow(0 0 6px hsl(var(--warning) / 0.5));
          }
          25% { transform: scale(1.1) rotate(-2deg); }
          50% {
            transform: scale(1.15) rotate(0deg);
            filter: drop-shadow(0 0 12px hsl(var(--warning) / 0.7));
          }
          75% { transform: scale(1.1) rotate(2deg); }
        }
        @keyframes streak-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 3px hsl(var(--warning) / 0.3)); }
          50% { transform: scale(1.06); filter: drop-shadow(0 0 6px hsl(var(--warning) / 0.5)); }
        }
      `}</style>
    </button>
  );
};

export default WeekStrip;
