import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AISetting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export const useAISettings = () => {
  const [settings, setSettings] = useState<AISetting[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('ai_settings').select('*').order('key');
    if (error) {
      toast({ title: 'Erro', description: 'Falha ao carregar configurações.', variant: 'destructive' });
    } else {
      setSettings((data as any[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateSetting = async (key: string, value: string) => {
    const { error } = await supabase
      .from('ai_settings')
      .update({ value, updated_at: new Date().toISOString() } as any)
      .eq('key', key);
    if (error) {
      toast({ title: 'Erro', description: 'Falha ao salvar.', variant: 'destructive' });
      return false;
    }
    toast({ title: 'Configuração salva!' });
    await fetchSettings();
    return true;
  };

  const getSetting = (key: string) => settings.find(s => s.key === key)?.value || '';

  return { settings, loading, updateSetting, getSetting, refetch: fetchSettings };
};
