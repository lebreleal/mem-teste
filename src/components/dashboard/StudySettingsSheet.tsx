/**
 * StudySettingsSheet — configure daily new card limits per deck/matéria.
 * Settings are persistent (saved to the decks table).
 */

import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, ChevronDown, Minus, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { updateDeckDailyLimits } from '@/services/uiQueryService';
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
  isSubDeck: boolean;
  isErrorNotebook: boolean;
  subCount: number;
  totalCards: number;
}

const ERROR_NOTEBOOK_PREFIX = '📕';

const StudySettingsSheet = ({ open, onOpenChange, decks, getSubDecks, getAggregateStats, currentFolderId }: StudySettingsSheetProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const salaDecks = useMemo(() => {
    if (!currentFolderId) return [];
    return decks.filter(d => d.folder_id === currentFolderId && !d.parent_deck_id && !d.is_archived)
      .sort((a, b) => (a as any).sort_order - (b as any).sort_order || a.name.localeCompare(b.name));
  }, [currentFolderId, decks]);

  const initialSettings = useMemo(() => {
    const map: Record<string, DeckSetting> = {};
    const order: string[] = [];

    for (const d of salaDecks) {
      const subs = getSubDecks(d.id).filter(s => s.folder_id === currentFolderId);
      const isMateria = subs.length > 0;
      const isErrorNotebook = d.name.startsWith(ERROR_NOTEBOOK_PREFIX);

      map[d.id] = {
        id: d.id,
        name: d.name,
        dailyNewLimit: d.daily_new_limit ?? 20,
        isEnabled: (d.daily_new_limit ?? 20) > 0,
        isMateria,
        isSubDeck: false,
        isErrorNotebook,
        subCount: subs.length,
        totalCards: d.total_cards,
      };
      order.push(d.id);

      if (isMateria) {
        const sortedSubs = [...subs].sort((a, b) => (a as any).sort_order - (b as any).sort_order || a.name.localeCompare(b.name));
        for (const sub of sortedSubs) {
          map[sub.id] = {
            id: sub.id,
            name: sub.name,
            dailyNewLimit: sub.daily_new_limit ?? 20,
            isEnabled: (sub.daily_new_limit ?? 20) > 0,
            isMateria: false,
            isSubDeck: true,
            isErrorNotebook: false,
            subCount: 0,
            totalCards: sub.total_cards,
          };
          order.push(sub.id);
        }
      }
    }
    return { map, order };
  }, [salaDecks, getSubDecks, decks]);

  const [settings, setSettings] = useState<Record<string, DeckSetting>>(initialSettings.map);

  useMemo(() => {
    if (open) setSettings(initialSettings.map);
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
      const updates = Object.values(settings).map(s => ({ id: s.id, daily_new_limit: s.dailyNewLimit }));
      await updateDeckDailyLimits(updates);
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
      const init = initialSettings.map[id];
      const curr = settings[id];
      return init && curr && init.dailyNewLimit !== curr.dailyNewLimit;
    });
  }, [settings, initialSettings]);

  const rootItems = initialSettings.order
    .map(id => settings[id])
    .filter(Boolean)
    .filter(item => !item.isSubDeck);

  const subDecksByParent = useMemo(() => {
    const map: Record<string, DeckSetting[]> = {};
    for (const id of initialSettings.order) {
      const item = settings[id];
      if (!item?.isSubDeck) continue;
      const idx = initialSettings.order.indexOf(id);
      let parentId: string | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        const prev = settings[initialSettings.order[i]];
        if (prev && prev.isMateria) { parentId = prev.id; break; }
      }
      if (parentId) {
        if (!map[parentId]) map[parentId] = [];
        map[parentId].push(item);
      }
    }
    return map;
  }, [initialSettings.order, settings]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const renderStepper = (item: DeckSetting) => (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => updateLimit(item.id, -5)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors active:scale-95"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="text-base font-bold text-foreground tabular-nums w-10 text-center">
        {item.dailyNewLimit}
      </span>
      <button
        onClick={() => updateLimit(item.id, 5)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors active:scale-95"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  const renderDeckCard = (item: DeckSetting, indented = false) => (
    <div
      key={item.id}
      className={`rounded-xl border border-border/60 bg-card p-3 transition-opacity ${item.isEnabled ? '' : 'opacity-40'} ${indented ? 'ml-4' : ''}`}
    >
      {/* Row 1: name + toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-foreground truncate ${indented ? 'text-xs' : 'text-sm'}`}>
            {item.name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {item.isMateria ? `${item.subCount} decks` : `${item.totalCards} cards`}
          </p>
        </div>
        <Switch checked={item.isEnabled} onCheckedChange={() => toggleEnabled(item.id)} />
      </div>

      {/* Row 2: stepper (only when enabled) */}
      {item.isEnabled && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
          <span className="text-xs text-muted-foreground">Novos por dia</span>
          {renderStepper(item)}
        </div>
      )}
    </div>
  );

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
              <p className="text-xs text-muted-foreground mt-0.5">Quantos cards novos ver por dia em cada deck</p>
            </div>
            <div className="w-5" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {rootItems.map(item => {
            const subs = subDecksByParent[item.id];
            const isExpanded = expanded[item.id] ?? false;

            if (item.isMateria && subs?.length) {
              return (
                <div key={item.id} className="space-y-2">
                  {renderDeckCard(item)}

                  {item.isEnabled && (
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="flex items-center gap-1 ml-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      {isExpanded ? 'Ocultar decks' : `Ver ${subs.length} decks`}
                    </button>
                  )}

                  {isExpanded && subs.map(sub => renderDeckCard(sub, true))}
                </div>
              );
            }

            return renderDeckCard(item);
          })}

          {rootItems.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum deck nesta sala
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/50">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-full h-11 rounded-full text-base font-bold"
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
