/**
 * StudySettingsSheet — configure daily new card limits per deck/matéria.
 * Settings are persistent (saved to the decks table).
 *
 * Two modes:
 * 1. Sala mode (currentFolderId set): shows root decks in the folder
 * 2. Matéria mode (parentDeckId set): shows subdecks of that parent deck
 *
 * Subdecks are always toggle-only (parent controls the limit).
 * Toggling off a subdeck sets its daily_new_limit to 0 (skips new cards today).
 * Reviews (spaced repetition) still continue regardless.
 */

import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, ChevronDown, Minus, Plus, Settings2, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateDeckDailyLimits, updateGlobalDeckSettings } from '@/services/uiQueryService';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { DeckWithStats } from '@/hooks/useDecks';

interface StudySettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckWithStats[];
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  currentFolderId: string | null;
  /** When set, shows subdecks of this parent instead of folder root decks (Matéria mode). */
  parentDeckId?: string | null;
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

const StudySettingsSheet = ({ open, onOpenChange, decks, getSubDecks, getAggregateStats, currentFolderId, parentDeckId }: StudySettingsSheetProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isMateriaMode = !!parentDeckId;

  // In Sala mode: root decks in the folder
  // In Matéria mode: subdecks of the parent
  const salaDecks = useMemo(() => {
    if (isMateriaMode) {
      return decks
        .filter(d => d.parent_deck_id === parentDeckId && !d.is_archived)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
    }
    if (!currentFolderId) return [];
    return decks.filter(d => d.folder_id === currentFolderId && !d.parent_deck_id && !d.is_archived)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  }, [currentFolderId, parentDeckId, isMateriaMode, decks]);

  const initialSettings = useMemo(() => {
    const map: Record<string, DeckSetting> = {};
    const order: string[] = [];

    for (const d of salaDecks) {
      const subs = isMateriaMode ? [] : getSubDecks(d.id);
      const isMateria = !isMateriaMode && subs.length > 0;
      const isErrorNotebook = d.name.startsWith(ERROR_NOTEBOOK_PREFIX);

      map[d.id] = {
        id: d.id,
        name: d.name,
        dailyNewLimit: d.daily_new_limit ?? 20,
        isEnabled: (d.daily_new_limit ?? 20) > 0,
        isMateria,
        isSubDeck: isMateriaMode, // In matéria mode, ALL items are subdecks
        isErrorNotebook,
        subCount: subs.length,
        totalCards: d.total_cards,
      };
      order.push(d.id);

      if (isMateria) {
        const sortedSubs = [...subs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
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
  }, [salaDecks, getSubDecks, decks, isMateriaMode]);

  const [settings, setSettings] = useState<Record<string, DeckSetting>>(initialSettings.map);

  // ─── Advanced global settings ───
  // Pick defaults from the first deck in the list (they should all be the same globally)
  const firstDeck = salaDecks[0];
  const initialLearningSteps = useMemo(() => {
    // Try to find existing learning_steps from any deck — they're all the same globally
    // DeckWithStats doesn't carry learning_steps, so we use defaults
    return '1m, 10m';
  }, []);
  const initialEasyGradInterval = 15;

  const [learningStepsStr, setLearningStepsStr] = useState(initialLearningSteps);
  const [easyGradInterval, setEasyGradInterval] = useState(initialEasyGradInterval);

  useMemo(() => {
    if (open) {
      setSettings(initialSettings.map);
      setShowAdvanced(false);
    }
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

      // Save advanced global settings if changed
      if (user && advancedChanged) {
        const parsedSteps = learningStepsStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        if (parsedSteps.length > 0) {
          await updateGlobalDeckSettings(user.id, {
            learning_steps: parsedSteps,
            easy_graduating_interval: easyGradInterval,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['study-queue'] });
      toast({ title: 'Configurações salvas!' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [settings, user, learningStepsStr, easyGradInterval, queryClient, toast, onOpenChange]);

  const advancedChanged = learningStepsStr !== initialLearningSteps || easyGradInterval !== initialEasyGradInterval;


  const hasChanges = useMemo(() => {
    const deckChanged = Object.keys(settings).some(id => {
      const init = initialSettings.map[id];
      const curr = settings[id];
      return init && curr && init.dailyNewLimit !== curr.dailyNewLimit;
    });
    return deckChanged || advancedChanged;
  }, [settings, initialSettings, advancedChanged]);

  const rootItems = initialSettings.order
    .map(id => settings[id])
    .filter(Boolean)
    .filter(item => !item.isSubDeck);

  // In Matéria mode, all items are subdecks — show them directly
  const allItems = isMateriaMode
    ? initialSettings.order.map(id => settings[id]).filter(Boolean)
    : rootItems;

  const subDecksByParent = useMemo(() => {
    if (isMateriaMode) return {}; // No nesting in matéria mode
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
  }, [initialSettings.order, settings, isMateriaMode]);

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
          <p className={`font-semibold text-foreground truncate ${indented || item.isSubDeck ? 'text-xs' : 'text-sm'}`}>
            {item.name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {item.isMateria ? `${item.subCount} decks` : `${item.totalCards} cards`}
          </p>
        </div>
        <Switch checked={item.isEnabled} onCheckedChange={() => toggleEnabled(item.id)} />
      </div>

      {/* Row 2: stepper — only for root/parent decks, NOT for subdecks */}
      {item.isEnabled && !item.isSubDeck && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
          <span className="text-xs text-muted-foreground">Novos por dia</span>
          {renderStepper(item)}
        </div>
      )}

      {/* Subdeck info label when toggled on */}
      {item.isEnabled && item.isSubDeck && (
        <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
          Cartões novos incluídos na sessão de hoje
        </p>
      )}
    </div>
  );

  // Get the parent deck info for matéria mode header
  const parentDeck = isMateriaMode ? decks.find(d => d.id === parentDeckId) : null;

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
              <p className="text-xs text-muted-foreground mt-0.5">
                {isMateriaMode
                  ? 'Escolha quais decks estudar hoje'
                  : 'Quantos cards novos ver por dia em cada deck'}
              </p>
            </div>
            <div className="w-5" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* In matéria mode, show parent deck limit info */}
          {isMateriaMode && parentDeck && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-2">
              <p className="text-sm font-semibold text-foreground">{parentDeck.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Limite diário: <span className="font-bold text-foreground">{parentDeck.daily_new_limit ?? 20}</span> novos por dia
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Desative os subdecks que não quer estudar hoje. Revisões continuam normalmente.
              </p>
            </div>
          )}

          {isMateriaMode ? (
            // Matéria mode: flat list of subdecks (toggle-only)
            allItems.map(item => renderDeckCard(item))
          ) : (
            // Sala mode: root decks with expandable subdecks
            rootItems.map(item => {
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
            })
          )}

          {allItems.length === 0 && rootItems.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isMateriaMode ? 'Nenhum subdeck neste baralho' : 'Nenhum deck nesta sala'}
            </div>
          )}

          {/* ─── Advanced Global Settings ─── */}
          {!isMateriaMode && (
            <div className="mt-4">
              <button
                onClick={() => setShowAdvanced(prev => !prev)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-2"
              >
                <Settings2 className="h-4 w-4" />
                <span className="font-medium">Configurações Avançadas</span>
                <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="mt-2 space-y-4 rounded-xl border border-border/60 bg-card p-4">
                  {/* Learning Steps */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Etapas de aprendizagem
                    </label>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Intervalos entre revisões de cartões novos. Use sufixos: m (minutos), h (horas), d (dias).
                    </p>
                    <Input
                      value={learningStepsStr}
                      onChange={e => setLearningStepsStr(e.target.value)}
                      placeholder="1m, 10m"
                      className="h-9 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Ex: <code className="bg-muted px-1 rounded">1m, 10m</code> → revisa após 1 min e depois 10 min
                    </p>
                  </div>

                  {/* Easy Graduating Interval */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Intervalo de graduação fácil
                    </label>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Quando você marca "Fácil" em um cartão novo, ele aparece novamente após esse número de dias.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEasyGradInterval(prev => Math.max(1, prev - 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-base font-bold text-foreground tabular-nums w-12 text-center">
                        {easyGradInterval}d
                      </span>
                      <button
                        onClick={() => setEasyGradInterval(prev => Math.min(365, prev + 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    ⚠️ Estas configurações são aplicadas globalmente a todos os seus baralhos.
                  </p>
                </div>
              )}
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
