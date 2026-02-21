export const SLIDER_MARKS = [15, 30, 45, 60, 90, 120, 180, 240];

export function formatMinutes(m: number) {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

export const HEALTH_CONFIG = {
  green: { ring: 'stroke-emerald-500', label: 'Em dia', description: 'Você está seguindo seu plano de estudos no ritmo ideal. Continue assim!', emoji: '🟢', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: '✓' },
  yellow: { ring: 'stroke-amber-500', label: 'Ficando apertado', description: 'Algumas revisões estão se acumulando. Dedique um pouco mais de tempo para não atrasar.', emoji: '🟡', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: '!' },
  orange: { ring: 'stroke-orange-500', label: 'Atrasado', description: 'O atraso está crescendo. Considere aumentar seu tempo diário ou redistribuir as revisões.', emoji: '🟠', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: '!!' },
  red: { ring: 'stroke-red-500', label: 'Em risco', description: 'Muitas revisões acumuladas. Seu progresso pode ser comprometido se não agir agora.', emoji: '🔴', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: '⚠' },
} as const;

export const HERO_GRADIENT = {
  green: 'bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-200/60 dark:border-emerald-800/40',
  yellow: 'bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-background border-amber-200/60 dark:border-amber-800/40',
  orange: 'bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/20 dark:to-background border-orange-200/60 dark:border-orange-800/40',
  red: 'bg-gradient-to-br from-red-50/50 to-white dark:from-red-950/20 dark:to-background border-red-200/60 dark:border-red-800/40',
} as const;
