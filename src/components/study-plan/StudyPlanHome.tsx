import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Plus, GripVertical, ChevronDown, ChevronUp, Pencil, RotateCcw, Crown,
  Sparkles, CalendarIcon, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  getWeeklyAvgNewCardsGlobal, DAY_LABELS,
  type StudyPlan as StudyPlanType, type DayKey, type WeeklyMinutes, type WeeklyNewCards,
} from '@/hooks/useStudyPlan';
import type { DeckWithStats } from '@/types/deck';
import { useDragReorder } from '@/hooks/useDragReorder';
import { StudyLoadBar } from '@/components/study-plan/PlanComponents';
import { formatMinutes, HEALTH_CONFIG, HERO_GRADIENT } from '@/components/study-plan/constants';
import { CatchUpDialog } from '@/components/study-plan/StudyPlanDialogs';
import { ObjectiveDecksExpanded } from '@/components/study-plan/DeckHierarchySelector';
import { ForecastSimulatorSection } from '@/components/study-plan/ForecastSimulatorSection';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface StudyPlanHomeProps {
  plans: StudyPlanType[];
  activeDecks: DeckWithStats[];
  globalCapacity: any;
  expandedDeckIds: string[];
  allDeckIds: string[];
  metrics: any;
  avgSecondsPerCard: number;
  isPremium: boolean;
  updateCapacity: any;
  updateNewCardsLimit: any;
  reorderObjectives: any;
  updatePlan: any;
  onNavigateBack: () => void;
  onStartNewPlan: () => void;
  onStartEdit: (plan: StudyPlanType) => void;
}

export const StudyPlanHome = ({
  plans, activeDecks, globalCapacity, expandedDeckIds, allDeckIds, metrics,
  avgSecondsPerCard, isPremium, updateCapacity, updateNewCardsLimit,
  reorderObjectives, updatePlan,
  onNavigateBack, onStartNewPlan, onStartEdit,
}: StudyPlanHomeProps) => {
  const { toast } = useToast();
  const [expandedObjective, setExpandedObjective] = useState<string | null>(null);
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [tempNewCards, setTempNewCards] = useState(globalCapacity.dailyNewCardsLimit);
  const [tempWeeklyNewCards, setTempWeeklyNewCards] = useState<WeeklyNewCards | null>(globalCapacity.weeklyNewCards);
  const [editingWeeklyNewCards, setEditingWeeklyNewCards] = useState(!!globalCapacity.weeklyNewCards);
  const [showNewCardsConfirm, setShowNewCardsConfirm] = useState(false);

  useEffect(() => {
    setTempNewCards(globalCapacity.dailyNewCardsLimit);
    setTempWeeklyNewCards(globalCapacity.weeklyNewCards);
    setEditingWeeklyNewCards(!!globalCapacity.weeklyNewCards);
  }, [globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards]);

  const healthStatus = (metrics?.healthStatus ?? 'green') as keyof typeof HEALTH_CONFIG;
  const todayCapacity = metrics?.todayCapacityMinutes ?? globalCapacity.dailyMinutes;

  const { getHandlers: getObjHandlers, displayItems: orderedPlans } = useDragReorder({
    items: plans,
    getId: (p: StudyPlanType) => p.id,
    onReorder: async (reordered) => {
      try { await reorderObjectives.mutateAsync(reordered.map(p => p.id)); }
      catch { toast({ title: 'Erro ao reordenar', variant: 'destructive' }); }
    },
  });

  const noPlansCTA = plans.length === 0 ? (
    <Card className="border-dashed border-primary/30">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Target className="h-5 w-5 text-primary" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Crie um objetivo</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">Defina metas com prazo para que o sistema distribua seus cards automaticamente.</p>
        </div>
        <Button size="sm" onClick={onStartNewPlan} className="shrink-0"><Plus className="h-3.5 w-3.5 mr-1" /> Criar</Button>
      </CardContent>
    </Card>
  ) : null;

  return (
    <>
      <main className="container mx-auto px-4 py-3 max-w-2xl space-y-4">
        {noPlansCTA}

        {/* STATUS + CARGA DE HOJE */}
        {plans.length > 0 && metrics && (
          <Card className={cn('border', HERO_GRADIENT[healthStatus])}>
            <CardContent className="p-4 md:p-5 space-y-3">
              <div className="flex flex-col justify-center">
                <StudyLoadBar estimatedMinutes={metrics.estimatedMinutesToday} capacityMinutes={todayCapacity} reviewMin={metrics.reviewMinutes} newMin={metrics.newMinutes} />
              </div>
              {metrics.totalReview > 0 && (
                <Button className="w-full md:w-auto" size="sm" variant={healthStatus === 'red' || healthStatus === 'orange' ? 'destructive' : 'outline'} onClick={() => setShowCatchUp(true)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> {metrics.totalReview} revisões atrasadas
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* MEUS OBJETIVOS */}
        {plans.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Meus Objetivos ({plans.length})</h3>
            {orderedPlans.map((p: StudyPlanType) => {
              const deckCount = p.deck_ids?.length ?? 0;
              const hasTarget = !!p.target_date;
              const isExpanded = expandedObjective === p.id;
              const objHandlers = getObjHandlers(p);
              return (
                <Card key={p.id} {...objHandlers} className={cn('transition-all', objHandlers.className)}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.name || 'Meu Objetivo'}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{deckCount} {deckCount === 1 ? 'baralho' : 'baralhos'}</span>
                          {hasTarget && (<><span>·</span><span>{format(new Date(p.target_date!), "dd/MM/yy")}</span></>)}
                        </div>
                      </div>
                      {hasTarget && (() => {
                        const pNewCards = (p.deck_ids ?? []).reduce((sum, id) => { const deck = activeDecks.find(d => d.id === id); return sum + (deck?.new_count ?? 0); }, 0);
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const dLeft = Math.max(1, Math.ceil((new Date(p.target_date!).getTime() - today.getTime()) / 86400000));
                        const needed = Math.ceil(pNewCards / dLeft);
                        const budget = getWeeklyAvgNewCardsGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
                        if (needed > budget) return <Badge variant="destructive" className="text-[9px] h-4 px-1.5 shrink-0">Meta inviável</Badge>;
                        return null;
                      })()}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onStartEdit(p); }}><Pencil className="h-3 w-3 text-muted-foreground" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExpandedObjective(isExpanded ? null : p.id); }}>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="pt-1 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                        <ObjectiveDecksExpanded plan={p} activeDecks={activeDecks} avgSecondsPerCard={avgSecondsPerCard} updatePlan={updatePlan} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {!isPremium && plans.length >= 1 ? (
              <Card className="border-dashed border-primary/30"><CardContent className="p-3"><div className="flex items-center gap-3"><div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0"><Crown className="h-3.5 w-3.5 text-amber-500" /></div><div className="flex-1"><p className="text-xs font-medium">Mais objetivos?</p><p className="text-[10px] text-muted-foreground">Assine Premium para objetivos ilimitados.</p></div></div></CardContent></Card>
            ) : (
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={onStartNewPlan}><Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar Objetivo</Button>
            )}
          </div>
        )}

        {/* CONFIGURAÇÕES */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Configurações</h3>
          {metrics && (
            <Card>
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" />Novos cards por dia</span>
                  {!(editingWeeklyNewCards || globalCapacity.weeklyNewCards) && <span className="text-base font-bold tabular-nums text-primary">{tempNewCards}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Cards que você nunca estudou. {plans.length > 0 ? 'O sistema distribui entre seus objetivos proporcionalmente.' : 'Crie um objetivo para que este limite global seja aplicado na fila de estudo.'}
                </p>
                <Slider value={[tempNewCards]} min={0} max={100} step={5} onValueChange={(v) => {
                  setTempNewCards(v[0]);
                  if (tempWeeklyNewCards) {
                    const oldGlobal = globalCapacity.dailyNewCardsLimit || 1;
                    const ratio = v[0] / oldGlobal;
                    const updated: WeeklyNewCards = {} as WeeklyNewCards;
                    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]) { updated[day] = Math.round((tempWeeklyNewCards[day] ?? globalCapacity.dailyNewCardsLimit) * ratio); }
                    setTempWeeklyNewCards(updated);
                  }
                }} />
                <button className="text-[10px] text-primary hover:underline flex items-center gap-1" onClick={() => {
                  if (editingWeeklyNewCards) { setEditingWeeklyNewCards(false); setTempWeeklyNewCards(null); }
                  else { setEditingWeeklyNewCards(true); setTempWeeklyNewCards(tempWeeklyNewCards ?? { mon: tempNewCards, tue: tempNewCards, wed: tempNewCards, thu: tempNewCards, fri: tempNewCards, sat: tempNewCards, sun: tempNewCards }); }
                }}>
                  <CalendarIcon className="h-3 w-3" />
                  {editingWeeklyNewCards ? 'Usar mesmo limite todos os dias' : 'Personalizar por dia da semana'}
                </button>
                {editingWeeklyNewCards && tempWeeklyNewCards && (
                  <div className="space-y-1.5 pt-1">
                    {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(day => (
                      <div key={day} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium w-6 text-muted-foreground">{DAY_LABELS[day]}</span>
                        <Slider value={[tempWeeklyNewCards[day] ?? tempNewCards]} onValueChange={([v]) => setTempWeeklyNewCards(prev => prev ? { ...prev, [day]: v } : prev)} min={0} max={100} step={5} className="flex-1" />
                        <span className={cn("text-[10px] font-semibold w-6 text-right tabular-nums", (tempWeeklyNewCards[day] ?? tempNewCards) === 0 && "text-muted-foreground")}>{tempWeeklyNewCards[day] ?? tempNewCards}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-center text-muted-foreground">Média: <span className="font-semibold text-foreground">{getWeeklyAvgNewCardsGlobal(tempNewCards, tempWeeklyNewCards)} cards/dia</span></p>
                  </div>
                )}
                {(tempNewCards !== globalCapacity.dailyNewCardsLimit || JSON.stringify(tempWeeklyNewCards) !== JSON.stringify(globalCapacity.weeklyNewCards)) && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={() => setShowNewCardsConfirm(true)}>
                      Confirmar ({editingWeeklyNewCards ? `média ${getWeeklyAvgNewCardsGlobal(tempNewCards, tempWeeklyNewCards)}` : tempNewCards} cards/dia)
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setTempNewCards(globalCapacity.dailyNewCardsLimit); setTempWeeklyNewCards(globalCapacity.weeklyNewCards); setEditingWeeklyNewCards(!!globalCapacity.weeklyNewCards); }}>Cancelar</Button>
                  </div>
                )}
                {metrics.deckNewAllocation && Object.keys(metrics.deckNewAllocation).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {plans.map(p => { const alloc = metrics.newCardsAllocation[p.id] ?? 0; if (alloc === 0) return null; return <Badge key={p.id} variant="outline" className="text-[9px] h-4 px-1.5 font-normal">{p.name}: {alloc}/dia</Badge>; })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* PREVISÃO DE CARGA */}
        <ForecastSimulatorSection
          allDeckIds={expandedDeckIds} dailyMinutes={globalCapacity.dailyMinutes}
          weeklyMinutes={globalCapacity.weeklyMinutes} weeklyNewCards={globalCapacity.weeklyNewCards}
          plans={plans} updateCapacity={updateCapacity} metricsTotalNew={metrics?.totalNew}
        />

        {/* MODAL: Confirmar alteração de novos cards */}
        <AlertDialog open={showNewCardsConfirm} onOpenChange={setShowNewCardsConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar limite de novos cards?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">Você está alterando de <strong>{globalCapacity.dailyNewCardsLimit}</strong> para <strong>{tempNewCards}</strong> novos cards por dia.</span>
                {plans.length > 0 ? (
                  <span className="block text-amber-600 dark:text-amber-400">⚠️ As cotas serão recalculadas e redistribuídas entre seus objetivos.</span>
                ) : (
                  <span className="block text-muted-foreground">Este valor será usado como referência na simulação.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setTempNewCards(globalCapacity.dailyNewCardsLimit); setTempWeeklyNewCards(globalCapacity.weeklyNewCards); }}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { updateNewCardsLimit.mutateAsync({ limit: tempNewCards, weeklyNewCards: tempWeeklyNewCards }); setShowNewCardsConfirm(false); }}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CatchUpDialog open={showCatchUp} onOpenChange={setShowCatchUp} totalReview={metrics?.totalReview ?? 0} avgSecondsPerCard={avgSecondsPerCard} allDeckIds={allDeckIds} />
      </main>
    </>
  );
};
