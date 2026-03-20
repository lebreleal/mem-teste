/**
 * StatsShared — Shared tiny components used across stats sub-components.
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { useState } from 'react';
import { HelpCircle, Settings2, CalendarIcon, Trophy, Medal, Clock, Flame, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PERIOD_OPTIONS, type PeriodKey } from '@/hooks/useStatsData';
import type { usePeriodFilter } from '@/hooks/useStatsData';

export function SectionTitle({ title, info }: { title: string; info?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-sm font-semibold truncate">{title}</h2>
        {info && (
          <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {info && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="text-base">{title}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{info}</p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function PeriodFilterIcon({ filter }: { filter: ReturnType<typeof usePeriodFilter> }) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo } = filter;
  const activeLabel = PERIOD_OPTIONS.find(o => o.key === period)?.label ?? '';

  return (
    <div className="flex items-center gap-1.5">
      {period !== 'all' && (
        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">{activeLabel}</span>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0 relative">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 space-y-2" align="end" side="bottom">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Período</p>
          <div className="flex gap-1 flex-wrap">
            {PERIOD_OPTIONS.filter(o => o.key !== 'custom').map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  period === opt.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="border-t border-border/40 pt-2 space-y-1.5">
            <p className="text-[10px] text-muted-foreground">Personalizado:</p>
            <div className="flex items-center gap-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px] px-2">
                    <CalendarIcon className="h-3 w-3" />
                    {customFrom ? format(customFrom, 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={customFrom}
                    onSelect={(d) => { setCustomFrom(d); setPeriod('custom'); }}
                    locale={ptBR}
                    className="p-3 pointer-events-auto"
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-[10px] text-muted-foreground">–</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px] px-2">
                    <CalendarIcon className="h-3 w-3" />
                    {customTo ? format(customTo, 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={customTo}
                    onSelect={(d) => { setCustomTo(d); setPeriod('custom'); }}
                    locale={ptBR}
                    className="p-3 pointer-events-auto"
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-muted px-2 py-0.5 rounded-full">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

export function MiniBarChart({ data, color, height = 130 }: { data: { label: string; count: number }[]; color: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} />
          <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }} />
          <Bar dataKey="count" name="Cartões" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RankMedal({ position }: { position: number }) {
  if (position === 1) return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-md shadow-amber-400/30">
      <Trophy className="h-4 w-4 text-white drop-shadow" />
    </div>
  );
  if (position === 2) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-400 shadow-sm">
      <Medal className="h-3.5 w-3.5 text-white drop-shadow" />
    </div>
  );
  if (position === 3) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-500 shadow-sm">
      <Medal className="h-3.5 w-3.5 text-white drop-shadow" />
    </div>
  );
  return (
    <div className="flex h-7 w-7 items-center justify-center">
      <span className="text-xs font-bold tabular-nums text-muted-foreground">{position}º</span>
    </div>
  );
}

export const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const rankingSortOptions = [
  { key: 'cards' as const, label: 'Cards', icon: Zap },
  { key: 'hours' as const, label: 'Horas', icon: Clock },
  { key: 'streak' as const, label: 'Dias Ativos', icon: Flame },
];
