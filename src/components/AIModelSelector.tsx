import { Zap, Crown, Sparkles } from 'lucide-react';
import { type AIModel, MODEL_CONFIG } from '@/hooks/useAIModel';

interface AIModelSelectorProps {
  model: AIModel;
  onChange: (model: AIModel) => void;
  baseCost?: number;
  compact?: boolean;
  isPremium?: boolean;
}

const MODEL_STATS: Record<AIModel, { speed: number; intelligence: number; tagline: string }> = {
  flash: {
    speed: 5,
    intelligence: 2,
    tagline: 'Modelo rápido e econômico para tarefas simples.',
  },
  pro: {
    speed: 3,
    intelligence: 5,
    tagline: 'Raciocínio avançado que gera cartões superiores.',
  },
};

const StatBar = ({ value, max = 5, color }: { value: number; max?: number; color: string }) => (
  <div className="flex gap-[3px]">
    {Array.from({ length: max }).map((_, i) => (
      <div
        key={i}
        className="h-[6px] w-4 rounded-full transition-colors"
        style={{
          backgroundColor: i < value ? color : 'hsl(var(--muted))',
        }}
      />
    ))}
  </div>
);

const AIModelSelector = ({ model, onChange, baseCost, compact = false, isPremium = false }: AIModelSelectorProps) => {
  const getDisplayCost = (m: AIModel) => {
    if (baseCost === undefined) return undefined;
    const multiplier = m === 'flash' && isPremium ? 0.5 : MODEL_CONFIG[m].costMultiplier;
    return Math.ceil(baseCost * multiplier);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onChange(model === 'flash' ? 'pro' : 'flash')}
        className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold transition-colors hover:bg-muted/50"
        title={`Modelo: ${MODEL_CONFIG[model].label} — clique para alternar`}
      >
        {model === 'flash' ? (
          <Zap className="h-3 w-3 text-warning" />
        ) : (
          <Sparkles className="h-3 w-3 text-primary" />
        )}
        <span className="text-foreground hidden sm:inline">{MODEL_CONFIG[model].label}</span>
        {baseCost !== undefined && (
          <span className="text-muted-foreground">
            {getDisplayCost(model)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {(['flash', 'pro'] as const).map((m) => {
        const stats = MODEL_STATS[m];
        const isSelected = model === m;
        const isPro = m === 'pro';
        const accentColor = isPro ? 'hsl(var(--primary))' : 'hsl(var(--warning))';

        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-xl border-2 p-3 text-left transition-all relative overflow-hidden min-w-0 ${
              isSelected
                ? isPro
                  ? 'border-primary bg-primary/5 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.3)]'
                  : 'border-warning bg-warning/5'
                : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            {/* Pro badge */}
            {isPro && (
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                Premium
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-1">
              {isPro ? (
                <Sparkles className="h-4 w-4 text-primary" />
              ) : (
                <Zap className="h-4 w-4 text-warning" />
              )}
              <span className="text-sm font-bold text-foreground">{MODEL_CONFIG[m].label}</span>
              {isPro && <Crown className="h-3.5 w-3.5 text-warning" />}
            </div>

            <p className="text-[10px] text-muted-foreground mb-2.5 leading-tight">{stats.tagline}</p>

            {/* Stats */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium w-[70px]">Velocidade</span>
                <StatBar value={stats.speed} color={accentColor} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium w-[70px]">Inteligência</span>
                <StatBar value={stats.intelligence} color={accentColor} />
              </div>
            </div>

            {isPro && !isSelected && (
              <p className="text-[9px] text-primary font-semibold mt-2 animate-pulse">
                Uso maior de créditos para resultados superiores.
              </p>
            )}

            {baseCost !== undefined && (
              <p className="text-[10px] font-semibold mt-2" style={{ color: 'hsl(var(--energy-purple))' }}>
                {getDisplayCost(m)} créditos
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default AIModelSelector;
