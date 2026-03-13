/**
 * MiniStatsStrip — Compact stats row: streak, cards today, study time.
 */
import { useNavigate } from 'react-router-dom';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useProfile } from '@/hooks/useProfile';
import { Flame, BookOpen, Clock } from 'lucide-react';

const MiniStatsStrip = () => {
  const navigate = useNavigate();
  const { data: stats } = useStudyStats();
  const { data: profile } = useProfile();

  const streak = stats?.streak ?? 0;
  const cardsToday = profile?.daily_cards_studied ?? 0;
  const minutesToday = profile?.daily_study_minutes ?? 0;

  return (
    <button
      onClick={() => navigate('/desempenho')}
      className="w-full flex items-center justify-around rounded-xl border border-border/50 bg-card px-4 py-2.5 shadow-sm hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <Flame className={`h-4 w-4 ${streak > 0 ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} />
        <span className="text-sm font-bold tabular-nums text-foreground">{streak}</span>
        <span className="text-[10px] text-muted-foreground">dias</span>
      </div>
      <div className="h-4 w-px bg-border/50" />
      <div className="flex items-center gap-1.5">
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold tabular-nums text-foreground">{cardsToday}</span>
        <span className="text-[10px] text-muted-foreground">cards</span>
      </div>
      <div className="h-4 w-px bg-border/50" />
      <div className="flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-bold tabular-nums text-foreground">{minutesToday}</span>
        <span className="text-[10px] text-muted-foreground">min</span>
      </div>
    </button>
  );
};

export default MiniStatsStrip;
