import { useState, useCallback } from 'react';

export type AIModel = 'flash' | 'pro';

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
  // Always start as flash — never persist across sessions
  const [model, setModelState] = useState<AIModel>('flash');
  const [pendingPro, setPendingPro] = useState(false);

  const requestModelChange = useCallback((m: AIModel) => {
    if (m === 'pro') {
      // Don't switch immediately — request confirmation
      setPendingPro(true);
    } else {
      setModelState('flash');
      setPendingPro(false);
    }
  }, []);

  const confirmPro = useCallback(() => {
    setModelState('pro');
    setPendingPro(false);
  }, []);

  const cancelPro = useCallback(() => {
    setPendingPro(false);
  }, []);

  const config = MODEL_CONFIG[model];

  /** Calculate real cost given a base cost */
  const getCost = useCallback((baseCost: number) => baseCost * MODEL_CONFIG[model].costMultiplier, [model]);

  return { model, setModel: requestModelChange, config, getCost, MODEL_CONFIG, pendingPro, confirmPro, cancelPro };
};

export { MODEL_CONFIG };
