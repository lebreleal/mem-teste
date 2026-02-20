import { useState, useCallback } from 'react';

export type AIModel = 'flash' | 'pro';

const MODEL_CONFIG = {
  flash: {
    label: 'Flash',
    description: 'Rápido e eficiente',
    costMultiplier: 1,
    backendModel: 'gemini-2.5-flash-lite',
  },
  pro: {
    label: 'Pro',
    description: 'Raciocínio avançado',
    costMultiplier: 5,
    backendModel: 'gemini-2.5-pro',
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

  /** Calculate real cost given a base cost. Premium users get 50% off Flash. */
  const getCost = useCallback((baseCost: number, isPremium = false) => {
    const multiplier = model === 'flash' && isPremium
      ? 0.5  // Premium: 1 crédito/página
      : MODEL_CONFIG[model].costMultiplier;
    return Math.ceil(baseCost * multiplier);
  }, [model]);

  return { model, setModel: requestModelChange, config, getCost, MODEL_CONFIG, pendingPro, confirmPro, cancelPro };
};

export { MODEL_CONFIG };
