import { Zap, Crown } from 'lucide-react';
import { type AIModel, MODEL_CONFIG } from '@/hooks/useAIModel';

interface AIModelSelectorProps {
  model: AIModel;
  onChange: (model: AIModel) => void;
  baseCost?: number;
  compact?: boolean;
}

const AIModelSelector = ({ model, onChange, baseCost, compact = false }: AIModelSelectorProps) => {
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
          <Crown className="h-3 w-3 text-warning" />
        )}
        <span className="text-foreground hidden sm:inline">{MODEL_CONFIG[model].label}</span>
        {baseCost !== undefined && (
          <span className="text-muted-foreground">
            {baseCost * MODEL_CONFIG[model].costMultiplier}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      {(['flash', 'pro'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 rounded-xl border-2 p-2.5 text-left transition-colors ${
            model === m
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {m === 'flash' ? (
              <Zap className="h-3.5 w-3.5 text-warning" />
            ) : (
              <Crown className="h-3.5 w-3.5 text-warning" />
            )}
            <span className="text-sm font-bold text-foreground">{MODEL_CONFIG[m].label}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{MODEL_CONFIG[m].description}</p>
          {baseCost !== undefined && (
            <p className="text-[10px] font-semibold mt-1" style={{ color: 'hsl(var(--energy-purple))' }}>
              {baseCost * MODEL_CONFIG[m].costMultiplier} créditos
            </p>
          )}
        </button>
      ))}
    </div>
  );
};

export default AIModelSelector;
