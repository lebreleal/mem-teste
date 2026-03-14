/**
 * StudySettingsSheet — configure daily new card limits per deck/matéria.
 * Settings are persistent (saved to the decks table).
 */

import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, GraduationCap, Layers, Minus, Plus, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { DeckWithStats } from '@/hooks/useDecks';

interface StudySettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckWithStats[];
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  currentFolderId: string | null;
}

interface DeckSetting {
  id: string;
  name: string;
  dailyNewLimit: number;
  isEnabled: boolean;
  isMateria: boolean;
  subCount: number;
  totalCards: number;
}

const StudySettingsSheet = ({ open, onOpenChange, decks, getSubDecks, getAggregateStats, currentFolderId }: StudySettingsSheetProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const salaDecks = useMemo(() => {
    if (!currentFolderId) return [];
    return decks.filter(d => d.folder_id === currentFolderId && !d.parent_deck_id && !d.is_archived)
      .sort((a, b) => (a as any).sort_order - (b as any).sort_order || a.name.localeCompare(b.name));
  }, [currentFolderId, decks]);

  const initialSettings = useMemo(() => {
    const map: Record<string, DeckSetting> = {};
    for (const d of salaDecks) {
      const subs = getSubDecks(d.id);
      const collectTotal = (deckId: string): number => {
        const dk = decks.find(x => x.id === deckId);
        if (!dk) return 0;
        let t = dk.total_cards;
        for (const c of decks.filter(x => x.parent_deck_id === deckId && !x.is_archived)) t += collectTotal(c.id);
        return t;
      };
      map[d.id] = {
        id: d.id,
        name: d.name,
        dailyNewLimit: d.daily_new_limit ?? 20,
        isEnabled: (d.daily_new_limit ?? 20) > 0,
        isMateria: subs.length > 0,
        subCount: subs.length,
        totalCards: collectTotal(d.id),
      };
    }
    return map;
  }, [salaDecks, getSubDecks, decks]);

  const [settings, setSettings] = useState<Record<string, DeckSetting>>(initialSettings);

  // Sync settings when sheet opens with new data
  useMemo(() => {
    if (open) setSettings(initialSettings);
  }, [open, initialSettings]);

  const updateLimit = useCallback((deckId: string, delta: number) => {
    setSettings(prev => {
      const curr = prev[deckId];
      if (!curr) return prev;
      const newLimit = Math.max(0, Math.min(9999, curr.dailyNewLimit + delta));
      return { ...prev, [deckId]: { ...curr, dailyNewLimit: newLimit, isEnabled: newLimit > 0 } };
    });
  }, []);

  const toggleEnabled = useCallback((deckId: string) => {
    setSettings(prev => {
      const curr = prev[deckId];
      if (!curr) return prev;
      const newEnabled = !curr.isEnabled;
      return { ...prev, [deckId]: { ...curr, isEnabled: newEnabled, dailyNewLimit: newEnabled ? 20 : 0 } };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates = Object.values(settings).map(s => 
        supabase.from('decks').update({ daily_new_limit: s.dailyNewLimit } as any).eq('id', s.id)
      );
      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Configurações salvas!' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [settings, queryClient, toast, onOpenChange]);

  const hasChanges = useMemo(() => {
    return Object.keys(settings).some(id => {
      const init = initialSettings[id];
      const curr = settings[id];
      return init && curr && init.dailyNewLimit !== curr.dailyNewLimit;
    });
  }, [settings, initialSettings]);

  const items = Object.values(settings);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 text-center">
              <SheetTitle className="font-display text-base font-bold">Configurar Estudo</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Limite de cards novos por dia</p>
            </div>
            <div className="w-5" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {items.map(item => (
            <div key={item.id} className={`px-4 py-4 transition-opacity ${item.isEnabled ? '' : 'opacity-40'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {item.isMateria ? <GraduationCap className="h-4 w-4 text-primary" /> : <Layers className="h-4 w-4 text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-semibold text-foreground truncate text-sm">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {item.isMateria ? `${item.subCount} decks · ` : ''}{item.totalCards} cards
                  </p>
                </div>
                <Switch checked={item.isEnabled} onCheckedChange={() => toggleEnabled(item.id)} />
              </div>

              {item.isEnabled && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground">Novos por dia</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateLimit(item.id, -5)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-sm font-bold text-foreground tabular-nums w-10 text-center">
                      {item.dailyNewLimit}
                    </span>
                    <button
                      onClick={() => updateLimit(item.id, 5)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum deck nesta sala
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/50 flex gap-2">
          <Button
            variant="outline"
            onClick={() => setSettings(initialSettings)}
            disabled={!hasChanges}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Resetar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex-1 h-11 rounded-full text-base font-bold"
            size="lg"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default StudySettingsSheet;
