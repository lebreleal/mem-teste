import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useEnergy } from '@/hooks/useEnergy';
import { usePerformance } from '@/hooks/usePerformance';
import { Flame, Clock, TrendingUp, Brain, BarChart3, X } from 'lucide-react';
import CreditsDialog from '@/components/CreditsDialog';

const explanations: Record<string, { title: string; body: string }> = {
  dias: {
    title: '🔥 Ofensiva',
    body: 'Quantidade de dias consecutivos que você estudou. Mantenha sua sequência para criar o hábito!',
  },
  hoje: {
    title: '⏱️ Tempo Hoje',
    body: 'Minutos que você já estudou hoje. Cada sessão de revisão conta para o seu total diário.',
  },
  'últ. 7d': {
    title: '📈 Média 7 dias',
    body: 'Sua média diária de estudo nos últimos 7 dias. Ótimo para acompanhar sua consistência.',
  },
};

const StatusBar = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useStudyStats();
  const { energy } = useEnergy();
  const { data: perfData } = usePerformance();
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [energyBump, setEnergyBump] = useState(false);
  const [prevEnergy, setPrevEnergy] = useState<number | null>(null);

  const totalTodayCards = perfData
    ? (perfData.totalPendingReviews + perfData.totalNewCards)
    : 0;

  useEffect(() => {
    if (prevEnergy !== null && energy > prevEnergy) {
      setEnergyBump(true);
      const t = setTimeout(() => setEnergyBump(false), 1800);
      return () => clearTimeout(t);
    }
    setPrevEnergy(energy);
  }, [energy, prevEnergy]);

  if (isLoading || !stats) {
    return (
      <div className="h-[64px] animate-pulse rounded-2xl bg-muted" />
    );
  }

  const items = [
    {
      icon: Flame,
      value: stats.streak,
      label: 'dias',
      color: 'hsl(var(--warning))',
      bgColor: 'hsl(var(--warning) / 0.12)',
    },
    {
      icon: Clock,
      value: `${stats.todayMinutes}m`,
      label: 'hoje',
      color: 'hsl(var(--primary))',
      bgColor: 'hsl(var(--primary) / 0.12)',
    },
    {
      icon: TrendingUp,
      value: `${stats.avgMinutesPerDay7d}m`,
      label: 'últ. 7d',
      color: 'hsl(var(--success))',
      bgColor: 'hsl(var(--success) / 0.12)',
    },
    {
      icon: BarChart3,
      value: totalTodayCards,
      label: 'cards',
      color: 'hsl(var(--info))',
      bgColor: 'hsl(var(--info) / 0.12)',
      isPlanning: true,
    },
    {
      icon: Brain,
      value: energy,
      label: 'créditos',
      color: 'hsl(var(--energy-purple))',
      bgColor: 'hsl(var(--energy-purple) / 0.12)',
    },
  ];

  const info = selectedStat ? explanations[selectedStat] : null;

  return (
    <>
      <div
        className="card-premium grid grid-cols-5 gap-1 sm:flex sm:items-center sm:justify-around sm:gap-5 md:gap-8 border border-border/40 bg-card px-2 py-2.5 sm:px-6 sm:py-4 md:px-8 md:py-5"
        style={{ borderRadius: 'var(--radius)' }}
      >
        {items.map((item) => {
          const { icon: Icon, value, label, color, bgColor } = item;
          const isCredits = label === 'créditos';
          const isPlanning = (item as any).isPlanning;
          return (
            <button
              key={label}
              onClick={() => isPlanning ? navigate('/planejamento') : isCredits ? setCreditsOpen(true) : navigate(`/activity?tab=${label === 'dias' ? 'streak' : label === 'hoje' ? 'today' : 'week'}`)}
              className="relative flex flex-col items-center gap-1 sm:flex-row sm:gap-2.5 md:gap-3 cursor-pointer rounded-lg transition-colors hover:bg-muted/50 p-1 sm:p-2 -m-1"
            >
              <div
                className="flex h-7 w-7 sm:h-9 sm:w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl"
                style={{ background: bgColor }}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" style={{ color }} />
              </div>
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-xs sm:text-base md:text-lg font-bold text-foreground leading-tight tabular-nums">
                  {value}
                </span>
                <span className="text-[8px] sm:text-[10px] md:text-xs text-muted-foreground leading-tight uppercase tracking-wider">
                  {label}
                </span>
              </div>

              {isCredits && energyBump && (
                <span
                  className="absolute -top-2 -right-1 text-[11px] font-bold pointer-events-none"
                  style={{
                    color: 'hsl(var(--energy-purple))',
                    animation: 'energy-float 1.8s ease-out forwards',
                  }}
                >
                  +1
                </span>
              )}
            </button>
          );
        })}
      </div>

      {info && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedStat(null)}
        >
          <div
            className="relative mx-4 w-full max-w-sm rounded-2xl border border-border/40 bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedStat(null)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-bold text-foreground mb-2">{info.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{info.body}</p>
          </div>
        </div>
      )}

      <CreditsDialog open={creditsOpen} onOpenChange={setCreditsOpen} />
    </>
  );
};

export default StatusBar;
