/**
 * Extracted from StudyPlan page:
 * ForecastSimulatorSection — wraps ForecastSimulator with local override state and hooks.
 */

import { useState, useMemo, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ForecastSimulator } from './PlanComponents';
import { useForecastSimulator, useForecastView } from '@/hooks/useForecastSimulator';
import { useFolders } from '@/hooks/useFolders';
import type { ForecastView } from '@/types/forecast';
import type { StudyPlan as StudyPlanType, WeeklyMinutes, WeeklyNewCards } from '@/hooks/useStudyPlan';
import type { DeckWithStats } from '@/types/deck';

interface FolderOption {
  id: string;
  name: string;
}

interface ForecastSimulatorSectionProps {
  allDeckIds: string[];
  dailyMinutes: number;
  weeklyMinutes: WeeklyMinutes | null;
  weeklyNewCards: WeeklyNewCards | null;
  plans: StudyPlanType[];
  updateCapacity: { mutateAsync: (input: { daily_study_minutes: number; weekly_study_minutes?: WeeklyMinutes | null }) => Promise<void> };
  metricsTotalNew?: number;
  activeDecks: DeckWithStats[];
}

export function ForecastSimulatorSection({
  allDeckIds, dailyMinutes, weeklyMinutes, weeklyNewCards, plans,
  updateCapacity, metricsTotalNew, activeDecks,
}: ForecastSimulatorSectionProps) {
  const { forecastView, setForecastView } = useForecastView();
  const { toast } = useToast();
  const { folders } = useFolders();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newCardsOverride, setNewCardsOverride] = useState<number | undefined>();
  const [weeklyNewCardsOverride, setWeeklyNewCardsOverride] = useState<WeeklyNewCards | undefined>();
  const [createdCardsOverride, setCreatedCardsOverride] = useState<number | undefined>();
  const [dailyMinutesOverride, setDailyMinutesOverride] = useState<number | undefined>();
  const [weeklyMinutesOverride, setWeeklyMinutesOverride] = useState<WeeklyMinutes | undefined>();
  const [customTargetDate, setCustomTargetDate] = useState<Date | null>(null);
  const hasTargetDate = plans.some(p => p.target_date);

  // Build folder options from folders that have at least 1 deck
  const folderOptions = useMemo<FolderOption[]>(() => {
    const folderIdsWithDecks = new Set(activeDecks.map(d => d.folder_id).filter(Boolean) as string[]);
    return (folders ?? [])
      .filter(f => !f.is_archived && folderIdsWithDecks.has(f.id))
      .map(f => ({ id: f.id, name: f.name }));
  }, [folders, activeDecks]);

  // Filter allDeckIds by selected folder
  const filteredDeckIds = useMemo(() => {
    if (!selectedFolderId) return allDeckIds;
    const deckIdsInFolder = new Set(
      activeDecks.filter(d => d.folder_id === selectedFolderId).map(d => d.id)
    );
    // Also include subdecks whose parent is in the folder
    const parentIdsInFolder = new Set(deckIdsInFolder);
    for (const d of activeDecks) {
      if (d.parent_deck_id && parentIdsInFolder.has(d.parent_deck_id)) {
        deckIdsInFolder.add(d.id);
      }
    }
    return allDeckIds.filter(id => deckIdsInFolder.has(id));
  }, [selectedFolderId, allDeckIds, activeDecks]);

  const latestTargetDate = useMemo(() => {
    const plansWithDate = plans.filter(p => p.target_date);
    if (plansWithDate.length === 0) return null;
    return plansWithDate.reduce((max, p) => {
      const d = p.target_date!;
      return d > max ? d : max;
    }, plansWithDate[0].target_date!);
  }, [plans]);

  const effectiveDailyMin = dailyMinutesOverride ?? dailyMinutes;
  const effectiveWeeklyMin = weeklyMinutesOverride ?? weeklyMinutes;

  const horizonDays = useMemo(() => {
    if (forecastView === '7d') return 7;
    if (forecastView === '30d') return 30;
    if (forecastView === '90d') return 90;
    if (forecastView === '365d') return 365;
    if (forecastView === 'target') {
      const targetDateToUse = customTargetDate
        ?? (hasTargetDate
          ? plans.filter(p => p.target_date).reduce((min, p) => {
              const d = new Date(p.target_date!);
              return d < min ? d : min;
            }, new Date(plans.filter(p => p.target_date)[0].target_date!))
          : null);
      if (targetDateToUse) {
        const today = new Date(); today.setHours(0,0,0,0);
        return Math.max(7, Math.ceil((targetDateToUse.getTime() - today.getTime()) / 86400000));
      }
    }
    return 7;
  }, [forecastView, hasTargetDate, plans, customTargetDate]);

  const { data, summary, isSimulating, progress, defaultNewCardsPerDay, defaultCreatedCardsPerDay, totalNewCards, isUsingDefaults } = useForecastSimulator({
    deckIds: filteredDeckIds,
    horizonDays,
    newCardsPerDayOverride: newCardsOverride,
    createdCardsPerDayOverride: createdCardsOverride,
    dailyMinutes: effectiveDailyMin,
    weeklyMinutes: effectiveWeeklyMin,
    weeklyNewCards: weeklyNewCardsOverride ?? weeklyNewCards,
    enabled: filteredDeckIds.length > 0,
    latestTargetDate,
  });

  const handleViewChange = useCallback((v: ForecastView) => {
    setForecastView(v);
  }, [setForecastView]);

  const hasAnyOverride = newCardsOverride !== undefined || weeklyNewCardsOverride !== undefined || createdCardsOverride !== undefined || dailyMinutesOverride !== undefined || weeklyMinutesOverride !== undefined;

  const handleApplyCapacity = useCallback(async () => {
    try {
      await updateCapacity.mutateAsync({
        daily_study_minutes: effectiveDailyMin,
        weekly_study_minutes: weeklyMinutesOverride ?? null,
      });
      setDailyMinutesOverride(undefined);
      setWeeklyMinutesOverride(undefined);
      toast({ title: 'Capacidade atualizada!', description: 'Os valores simulados foram aplicados ao seu plano.' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
  }, [effectiveDailyMin, weeklyMinutesOverride, updateCapacity, toast]);

  return (
    <ForecastSimulator
      data={data} summary={summary} isSimulating={isSimulating} progress={progress}
      defaultNewCardsPerDay={defaultNewCardsPerDay} forecastView={forecastView}
      onViewChange={handleViewChange} newCardsOverride={newCardsOverride}
      onNewCardsChange={setNewCardsOverride} hasTargetDate={hasTargetDate}
      plans={plans.map(p => ({ id: p.id, name: p.name, target_date: p.target_date }))}
      customTargetDate={customTargetDate}
      onCustomTargetDate={setCustomTargetDate}
      isUsingDefaults={isUsingDefaults}
      totalNewCards={metricsTotalNew ?? totalNewCards}
      defaultCreatedCardsPerDay={defaultCreatedCardsPerDay}
      createdCardsOverride={createdCardsOverride}
      onCreatedCardsChange={setCreatedCardsOverride}
      realDailyMinutes={dailyMinutes}
      realWeeklyMinutes={weeklyMinutes}
      dailyMinutesOverride={dailyMinutesOverride}
      weeklyMinutesOverride={weeklyMinutesOverride}
      onDailyMinutesChange={setDailyMinutesOverride}
      onWeeklyMinutesChange={setWeeklyMinutesOverride}
      onApplyCapacity={handleApplyCapacity}
      hasAnyOverride={hasAnyOverride}
      realWeeklyNewCards={weeklyNewCards}
      weeklyNewCardsOverride={weeklyNewCardsOverride}
      onWeeklyNewCardsChange={setWeeklyNewCardsOverride}
      folderOptions={folderOptions}
      selectedFolderId={selectedFolderId}
      onFolderChange={setSelectedFolderId}
    />
  );
}
