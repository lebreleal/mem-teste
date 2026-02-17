import { useState, useCallback } from 'react';

export type AIModel = 'flash' | 'pro';

const STORAGE_KEY = 'memo-ai-model';

const MODEL_CONFIG = {
  flash: {
    label: 'Flash',
    description: 'Rápido e eficiente',
    costMultiplier: 1,
    backendModel: 'gpt-4o-mini',
  },
  pro: {
    label: 'Pro',
    description: 'Raciocínio avançado',
    costMultiplier: 5,
    backendModel: 'gpt-4o',
  },
} as const;

export const useAIModel = () => {
  const [model, setModelState] = useState<AIModel>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'pro' ? 'pro' : 'flash';
    } catch {
      return 'flash';
    }
  });

  const setModel = useCallback((m: AIModel) => {
    setModelState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  }, []);

  const config = MODEL_CONFIG[model];

  /** Calculate real cost given a base cost */
  const getCost = useCallback((baseCost: number) => baseCost * MODEL_CONFIG[model].costMultiplier, [model]);

  return { model, setModel, config, getCost, MODEL_CONFIG };
};

export { MODEL_CONFIG };
