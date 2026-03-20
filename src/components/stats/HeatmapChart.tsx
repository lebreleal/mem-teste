/**
 * HeatmapChart — Activity heatmap (GitHub-style).
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { SectionTitle } from './StatsShared';
import { WEEKDAYS } from './StatsShared';

interface HeatmapChartProps {
  heatmapData: {
    weeks: { date: Date; key: string; cards: number; dow: number }[][];
    months: { label: string; colStart: number }[];
  };
}

const HeatmapChart = ({ heatmapData }: HeatmapChartProps) => {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle title="Atividade" info="Mapa de calor dos últimos meses. Cada quadrado representa um dia — quanto mais escuro, mais cards você revisou." />
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex ml-5" style={{ gap: 0 }}>
          {heatmapData.months.map((m, i) => {
            const nextCol = heatmapData.months[i + 1]?.colStart ?? heatmapData.weeks.length;
            const span = nextCol - m.colStart;
            return (
              <span key={`${m.label}-${m.colStart}`} className="text-[9px] text-muted-foreground" style={{ width: span * 13, flexShrink: 0 }}>
                {m.label}
              </span>
            );
          })}
        </div>
        <div className="flex gap-0">
          <div className="flex flex-col gap-[2px] mr-1 justify-start">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-[8px] text-muted-foreground leading-none" style={{ height: 11, display: 'flex', alignItems: 'center' }}>{d}</span>
            ))}
          </div>
          <div className="flex gap-[2px]">
            {heatmapData.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {Array.from({ length: 7 }).map((_, dow) => {
                  const cell = week.find(c => c.dow === dow);
                  if (!cell) return <div key={dow} className="w-[11px] h-[11px]" />;
                  const cards = cell.cards;
                  const intensity = cards === 0 ? 0 : cards < 20 ? 1 : cards < 50 ? 2 : cards < 100 ? 3 : 4;
                  return (
                    <div
                      key={dow}
                      title={`${format(cell.date, 'dd/MM')}: ${cards} cards`}
                      className={cn(
                        'w-[11px] h-[11px] rounded-[2px] transition-colors',
                        intensity === 0 && 'bg-muted/60',
                        intensity === 1 && 'bg-primary/20',
                        intensity === 2 && 'bg-primary/40',
                        intensity === 3 && 'bg-primary/70',
                        intensity === 4 && 'bg-primary',
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[9px] text-muted-foreground mr-1">Menos</span>
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} className={cn('w-[11px] h-[11px] rounded-[2px]', level === 0 && 'bg-muted/60', level === 1 && 'bg-primary/20', level === 2 && 'bg-primary/40', level === 3 && 'bg-primary/70', level === 4 && 'bg-primary')} />
          ))}
          <span className="text-[9px] text-muted-foreground ml-1">Mais</span>
        </div>
      </div>
    </Card>
  );
};

export default HeatmapChart;
