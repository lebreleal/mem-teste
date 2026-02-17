import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AIPrompt {
  id: string;
  feature_key: string;
  label: string;
  system_prompt: string;
  user_prompt_template: string;
  default_model: string;
  temperature: number;
  updated_at: string;
}

export const useAIPrompts = () => {
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('*')
      .order('feature_key');

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível carregar prompts.', variant: 'destructive' });
    } else {
      setPrompts((data as any[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const updatePrompt = async (id: string, updates: Partial<AIPrompt>) => {
    const { error } = await supabase
      .from('ai_prompts')
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('id', id);

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
      return false;
    }
    toast({ title: 'Prompt salvo!' });
    await fetchPrompts();
    return true;
  };

  return { prompts, loading, updatePrompt, refetch: fetchPrompts };
};
