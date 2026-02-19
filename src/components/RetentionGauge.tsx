import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RetentionGaugeProps {
  cards: Array<{
    state: number;
    stability: number;
    difficulty: number;
    scheduled_date: string;
    last_reviewed_at?: string;
  }>;
  algorithmMode: string;
  size?: number;
  compact?: boolean;
}

// FSRS constants (FSRS-4.5 power-law retrievability)
const FSRS_DECAY = -0.5;
const FSRS_FACTOR = 19 / 81;

/**
 * Unified recall probability based on FSRS-4.5 forgetting curve.
 *
 * R(t) = (1 + FACTOR * t / S)^DECAY
 *
 * Where:
 *   t = elapsed time since last review (days, fractional)
 *   S = stability (days for R to reach ~90%)
 *
 * This formula is applied identically to ALL card states and algorithms.
 * The only difference is how we determine S and t.
 */
export function calculateCardRecall(
  card: { state: number; stability: number; difficulty: number; scheduled_date: string; last_reviewed_at?: string },
  algorithmMode: string,
): { percent: number; label: string; state: 'new' | 'learning' | 'review' } {
  if (card.state === 0) return { percent: 0, label: 'Novo', state: 'new' };

  const now = Date.now();
  const scheduledMs = new Date(card.scheduled_date).getTime();
  const lastReviewedMs = card.last_reviewed_at ? new Date(card.last_reviewed_at).getTime() : null;

  // ── Learning cards (state=1) ──
  if (card.state === 1) {
    let stabilityDays: number;
    let elapsedDays: number;

    if (algorithmMode === 'fsrs') {
      // FSRS learning cards: stability is already set by the algorithm
      stabilityDays = Math.max(card.stability, 0.001);
    } else {
      // SM-2 learning cards: stability holds EFactor, not useful for decay.
      // The scheduled_date is the next learning step. Estimate the step duration
      // from the gap between last_reviewed_at and scheduled_date.
      if (lastReviewedMs) {
        const stepDays = Math.max(0.001, (scheduledMs - lastReviewedMs) / 86400000);
        stabilityDays = stepDays;
      } else {
        // Fallback: assume a 10-minute step
        stabilityDays = 10 / 1440; // ~0.007 days
      }
    }

    if (lastReviewedMs) {
      elapsedDays = Math.max(0, (now - lastReviewedMs) / 86400000);
    } else {
      // Fallback: estimate lastReview from scheduled_date - step
      const estimatedLastReview = scheduledMs - stabilityDays * 86400000;
      elapsedDays = Math.max(0, (now - estimatedLastReview) / 86400000);
    }

    const R = Math.pow(1 + FSRS_FACTOR * elapsedDays / stabilityDays, FSRS_DECAY);
    const pct = Math.max(0, Math.min(100, Math.round(R * 100)));
    return { percent: pct, label: 'Aprendendo', state: 'learning' };
  }

  // ── Review cards (state=2) ──
  let stabilityDays: number;
  let elapsedDays: number;

  if (algorithmMode === 'fsrs') {
    stabilityDays = Math.max(card.stability, 0.1);

    if (lastReviewedMs) {
      elapsedDays = Math.max(0, (now - lastReviewedMs) / 86400000);
    } else {
      // Fallback: estimate lastReview = scheduledDate - S
      const lastReviewMs = scheduledMs - stabilityDays * 86400000;
      elapsedDays = Math.max(0, (now - lastReviewMs) / 86400000);
    }
  } else {
    // SM-2: derive effective stability from EFactor (stability) and reps (difficulty)
    const ef = card.stability || 2.5;
    const reps = Math.round(card.difficulty);

    if (lastReviewedMs) {
      // Real interval = scheduled_date - last_reviewed_at = effective stability
      stabilityDays = Math.max(0.1, (scheduledMs - lastReviewedMs) / 86400000);
      elapsedDays = Math.max(0, (now - lastReviewedMs) / 86400000);
    } else {
      // Fallback: estimate stability from SM-2 parameters
      if (reps <= 1) stabilityDays = 1;
      else if (reps === 2) stabilityDays = 6;
      else stabilityDays = Math.min(365, 6 * Math.pow(ef, Math.max(0, reps - 2)));

      const lastReviewMs = scheduledMs - stabilityDays * 86400000;
      elapsedDays = Math.max(0, (now - lastReviewMs) / 86400000);
    }
  }

  const R = Math.pow(1 + FSRS_FACTOR * elapsedDays / stabilityDays, FSRS_DECAY);
  const pct = Math.max(0, Math.min(100, Math.round(R * 100)));
  return { percent: pct, label: 'Revisão', state: 'review' };
}

function calculateRetention(cards: RetentionGaugeProps['cards'], algorithmMode: string): number {
  if (cards.length === 0) return 0;
  const scores = cards.map(c => calculateCardRecall(c, algorithmMode).percent);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

const RetentionGauge = ({ cards, algorithmMode, size = 140, compact = false }: RetentionGaugeProps) => {
  const retention = useMemo(() => calculateRetention(cards, algorithmMode), [cards, algorithmMode]);
  const [infoOpen, setInfoOpen] = useState(false);

  const cx = size / 2;
  const cy = size * 0.65;
  const radius = size * 0.38;
  const startAngle = -180;
  const totalArc = 180;

  const needleAngle = startAngle + (retention / 100) * totalArc;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLen = radius * 0.75;
  const needleX = cx + Math.cos(needleRad) * needleLen;
  const needleY = cy + Math.sin(needleRad) * needleLen;

  const arcPath = (startDeg: number, endDeg: number) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + Math.cos(s) * radius;
    const y1 = cy + Math.sin(s) * radius;
    const x2 = cx + Math.cos(e) * radius;
    const y2 = cy + Math.sin(e) * radius;
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const getColor = (r: number) => {
    if (r >= 80) return 'hsl(var(--primary))';
    if (r >= 60) return 'hsl(var(--info))';
    if (r >= 40) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  const label = retention >= 80 ? 'Excelente' : retention >= 60 ? 'Bom' : retention >= 40 ? 'Regular' : retention >= 1 ? 'Fraco' : 'Novo';

  const algoExplanation = algorithmMode === 'fsrs'
    ? 'Calculado com FSRS: R = (1 + t/9S)^(-0.5), fórmula de lei de potência baseada na estabilidade (S) e tempo desde a última revisão (t).'
    : 'Calculado com SM-2: usa a mesma curva de esquecimento (lei de potência) com estabilidade estimada a partir do EFactor e repetições.';

  return (
    <>
      <div className="flex flex-col items-center">
        <div className="relative">
          <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
            <defs>
              <linearGradient id={`gaugeGrad-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--destructive))" />
                <stop offset="35%" stopColor="hsl(var(--warning))" />
                <stop offset="65%" stopColor="hsl(var(--info))" />
                <stop offset="100%" stopColor="hsl(var(--primary))" />
              </linearGradient>
            </defs>

            <path
              d={arcPath(-180, 0)}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={size * 0.07}
              strokeLinecap="round"
            />

            {retention > 0 && (
              <path
                d={arcPath(-180, -180 + (retention / 100) * 180)}
                fill="none"
                stroke={`url(#gaugeGrad-${size})`}
                strokeWidth={size * 0.07}
                strokeLinecap="round"
              />
            )}

            <line
              x1={cx}
              y1={cy}
              x2={needleX}
              y2={needleY}
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={size * 0.035} fill="hsl(var(--foreground))" />

            <text
              x={cx - radius - 2}
              y={cy + size * 0.1}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={size * 0.07}
              fontWeight="500"
            >
              0%
            </text>
            <text
              x={cx + radius + 2}
              y={cy + size * 0.1}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={size * 0.07}
              fontWeight="500"
            >
              100%
            </text>
          </svg>

          {/* Info icon - clickable to open modal */}
          <button
            onClick={() => setInfoOpen(true)}
            className="absolute top-0 right-0 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="text-center -mt-0.5">
          <span className={`${compact ? 'text-lg' : 'text-2xl'} font-bold font-display`} style={{ color: getColor(retention) }}>
            {retention}%
          </span>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground`}>{label}</p>
        </div>
      </div>

      {/* Info Modal */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              📊 Retenção do Baralho
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Indica a <span className="font-semibold text-foreground">probabilidade média</span> de você lembrar dos cards deste baralho agora.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Quanto mais você estuda e acerta, maior a retenção. O objetivo é manter acima de <span className="font-semibold text-foreground">80%</span>.
            </p>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Como é calculado?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {algoExplanation}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-destructive/10 p-2">
                <span className="text-xs font-bold text-destructive">0-39%</span>
                <p className="text-[10px] text-muted-foreground">Fraco</p>
              </div>
              <div className="rounded-lg bg-warning/10 p-2">
                <span className="text-xs font-bold text-warning">40-59%</span>
                <p className="text-[10px] text-muted-foreground">Regular</p>
              </div>
              <div className="rounded-lg bg-info/10 p-2">
                <span className="text-xs font-bold text-info">60-79%</span>
                <p className="text-[10px] text-muted-foreground">Bom</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2">
                <span className="text-xs font-bold text-primary">80-100%</span>
                <p className="text-[10px] text-muted-foreground">Excelente</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RetentionGauge;
