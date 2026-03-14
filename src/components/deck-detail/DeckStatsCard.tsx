/**
 * DeckStatsCard – compact study action bar with mastery gauge (domínio).
 * Uses same circular gauge layout as the sala view.
 * Colors match the study rating buttons: info(Fácil), success(Bom), warning(Difícil), destructive(Errei).
 */

import { useMemo } from 'react';
import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { Play, Info, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { deriveAvgSecondsPerCard, DEFAULT_STUDY_METRICS } from '@/lib/studyUtils';

const DeckStatsCard = () => {
  const {
    studyPending, isQuickReview, totalCards, deckId, navigate,
    allCards,
  } = useDeckDetail();

  // Classification by difficulty (last rating proxy)
  const counts = useMemo(() => {
    let novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0;
    for (const c of allCards) {
      if (c.state === 0) { novo++; continue; }
      const d = c.difficulty ?? 5;
      if (d <= 3) facil++;
      else if (d <= 5) bom++;
      else if (d <= 7) dificil++;
      else errei++;
    }
    return { novo, facil, bom, dificil, errei };
  }, [allCards]);

  // Mastery % = cards classified as Fácil or Bom (well-known cards)
  const total = allCards.length;
  const masteredCount = counts.facil + counts.bom;
  const masteryPct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
  const toDominate = total - masteredCount;

  // Time estimate for this deck
  const totalDue = studyPending;
  const avgSec = deriveAvgSecondsPerCard(DEFAULT_STUDY_METRICS);
  const remainingMin = Math.ceil((totalDue * avgSec) / 60);
  const timeLabel = remainingMin >= 60
    ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
    : `${remainingMin}min`;

  const R = 22;
  const C = 2 * Math.PI * R;

  const segments = total > 0 ? [
    { pct: counts.facil / total, color: 'hsl(var(--info))', key: 'facil' },
    { pct: counts.bom / total, color: 'hsl(var(--success))', key: 'bom' },
    { pct: counts.dificil / total, color: 'hsl(var(--warning))', key: 'dificil' },
    { pct: counts.errei / total, color: 'hsl(var(--destructive))', key: 'errei' },
    { pct: counts.novo / total, color: 'hsl(var(--muted))', key: 'novo' },
  ] : [];

  let offset = 0;

  return (
    <div className="space-y-1">
      {/* Time estimate */}
      {totalDue > 0 && (
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
              Tempo estimado para revisar todos os cartões pendentes deste baralho, com base na sua velocidade média de estudo.
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Study bar */}
      <div className="flex items-center gap-4 py-2">
      {/* Circular 5-segment classification gauge */}
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
          {masteryPct}%
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Classificação dos cards"
            >
              <Info className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" side="bottom" align="start">
            <p className="text-xs font-semibold text-foreground mb-2">Classificação dos cards</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-info" />
                  <span className="text-xs text-muted-foreground">Fácil</span>
                </div>
                <span className="text-xs font-semibold text-foreground">{counts.facil}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-success" />
                  <span className="text-xs text-muted-foreground">Bom</span>
                </div>
                <span className="text-xs font-semibold text-foreground">{counts.bom}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-warning" />
                  <span className="text-xs text-muted-foreground">Difícil</span>
                </div>
                <span className="text-xs font-semibold text-foreground">{counts.dificil}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                  <span className="text-xs text-muted-foreground">Errei</span>
                </div>
                <span className="text-xs font-semibold text-foreground">{counts.errei}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                  <span className="text-xs text-muted-foreground">Novo</span>
                </div>
                <span className="text-xs font-semibold text-foreground">{counts.novo}</span>
              </div>
              <div className="border-t border-border/50 pt-2 mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cards a dominar</span>
                <span className="text-xs font-semibold text-foreground">{toDominate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total de cards</span>
                <span className="text-xs font-semibold text-foreground">{total}</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Study button */}
      <Button
        onClick={() => navigate(`/study/${deckId}`, { replace: true })}
        className="flex-1 h-11 rounded-full text-base font-bold gap-2"
        disabled={isQuickReview ? totalCards === 0 : studyPending === 0}
      >
        ESTUDAR
        <Play className="h-4 w-4 fill-current" />
      </Button>
      </div>
    </div>
  );
};

export default DeckStatsCard;
