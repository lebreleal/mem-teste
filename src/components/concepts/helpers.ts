import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type StateFilter = 'all' | 'due' | 'new' | 'learning' | 'mastered';

export const stateInfo = (state: number) => {
  switch (state) {
    case 0: return { label: 'Novo', color: 'bg-muted-foreground/20 text-muted-foreground' };
    case 1: return { label: 'Aprendendo', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' };
    case 2: return { label: 'Dominado', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
    case 3: return { label: 'Reaprendendo', color: 'bg-destructive/15 text-destructive' };
    default: return { label: 'Novo', color: 'bg-muted-foreground/20 text-muted-foreground' };
  }
};

export const nextReviewLabel = (scheduledDate: string) => {
  const d = new Date(scheduledDate);
  if (d <= new Date()) return 'Revisão agora';
  return `Próx: ${formatDistanceToNow(d, { locale: ptBR, addSuffix: false })}`;
};

export const CATEGORY_COLORS = [
  'hsl(var(--primary))',
  'hsl(200, 70%, 50%)',
  'hsl(150, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 65%, 55%)',
];
