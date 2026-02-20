import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, BookOpen, Clock, Target, AlertTriangle, Pencil, Trash2, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import BottomNav from '@/components/BottomNav';

type WizardStep = 1 | 2 | 3;

const SLIDER_MARKS = [15, 30, 45, 60, 90, 120, 180, 240];

function formatMinutes(m: number) {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { plan, isLoading, metrics, avgSecondsPerCard, createPlan, updatePlan, deletePlan } = useStudyPlan();
  const { decks, isLoading: decksLoading } = useDecks();
  const activeDecks = useMemo(() => (decks ?? []).filter(d => !d.is_archived), [decks]);

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState<Date | undefined>();
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [isEditing, setIsEditing] = useState(false);

  // Deck card counts (from deck stats or cards count)
  const deckCardCounts = useMemo(() => {
    const map: Record<string, number> = {};
    // We'll estimate from the decks data - each deck should have cards counted
    return map;
  }, []);

  const totalSelectedCards = useMemo(() => {
    // Simple estimation - we don't have card counts inline, will show after step 2 calculation
    return selectedDeckIds.length;
  }, [selectedDeckIds]);

  // Step 2 calculations
  const step2Metrics = useMemo(() => {
    if (selectedDeckIds.length === 0) return null;
    const avg = avgSecondsPerCard;
    const cardsPerDay = Math.floor((dailyMinutes * 60) / avg);
    const cardsPerWeek = cardsPerDay * 7;

    let requiredPerDay: number | null = null;
    let daysLeft: number | null = null;
    let coverage: number | null = null;

    if (targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
      // We'll use a rough estimate until actual metrics load
      requiredPerDay = null; // calculated server-side after plan creation
    }

    return { cardsPerDay, cardsPerWeek, requiredPerDay, daysLeft, coverage, avgSeconds: avg };
  }, [selectedDeckIds, dailyMinutes, targetDate, avgSecondsPerCard]);

  const handleConfirmPlan = async () => {
    try {
      const input = {
        daily_minutes: dailyMinutes,
        deck_ids: selectedDeckIds,
        target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null,
      };
      if (isEditing) {
        await updatePlan.mutateAsync(input);
        toast({ title: 'Plano atualizado!' });
      } else {
        await createPlan.mutateAsync(input);
        toast({ title: 'Plano criado com sucesso! 🎯' });
      }
      setIsEditing(false);
    } catch {
      toast({ title: 'Erro ao salvar plano', variant: 'destructive' });
    }
  };

  const handleDeletePlan = async () => {
    try {
      await deletePlan.mutateAsync();
      toast({ title: 'Plano excluído' });
      setIsEditing(false);
      setStep(1);
      setSelectedDeckIds([]);
      setTargetDate(undefined);
      setDailyMinutes(60);
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const startEdit = () => {
    if (!plan) return;
    setSelectedDeckIds(plan.deck_ids ?? []);
    setTargetDate(plan.target_date ? new Date(plan.target_date) : undefined);
    setDailyMinutes(plan.daily_minutes);
    setStep(1);
    setIsEditing(true);
  };

  if (isLoading || decksLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If plan exists and not editing → show dashboard
  if (plan && !isEditing) {
    return <PlanDashboard plan={plan} metrics={metrics} onEdit={startEdit} onDelete={handleDeletePlan} />;
  }

  // Wizard
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => {
          if (isEditing) { setIsEditing(false); return; }
          if (step > 1) { setStep((step - 1) as WizardStep); return; }
          navigate(-1);
        }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-bold flex-1">
          {isEditing ? 'Editar Plano' : 'Meu Plano de Estudo'}
        </h1>
        <div className="flex gap-1">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Step 1: Decks + target date */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">O que você precisa estudar?</h2>
              <p className="text-sm text-muted-foreground">Selecione os baralhos que deseja incluir no plano.</p>
            </div>

            {activeDecks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center space-y-3">
                  <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p>
                  <Button onClick={() => navigate('/dashboard')}>Criar baralho</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {activeDecks.map(deck => (
                  <label
                    key={deck.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                      selectedDeckIds.includes(deck.id)
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={selectedDeckIds.includes(deck.id)}
                      onCheckedChange={(checked) => {
                        setSelectedDeckIds(prev =>
                          checked ? [...prev, deck.id] : prev.filter(id => id !== deck.id)
                        );
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{deck.name}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Target date */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Tem uma data limite? <span className="text-muted-foreground font-normal">(ex: prova)</span>
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data (opcional)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={targetDate}
                    onSelect={setTargetDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {targetDate && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setTargetDate(undefined)}>
                  Remover data
                </Button>
              )}
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={selectedDeckIds.length === 0}
              onClick={() => setStep(2)}
            >
              Continuar
            </Button>
          </div>
        )}

        {/* Step 2: Analysis */}
        {step === 2 && step2Metrics && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">Aqui está o que calculamos</h2>
              <p className="text-sm text-muted-foreground">Com base nos seus baralhos e tempo médio por card.</p>
            </div>

            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tempo médio por card</p>
                    <p className="font-bold">{Math.round(step2Metrics.avgSeconds)}s</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{step2Metrics.cardsPerDay}</p>
                    <p className="text-xs text-muted-foreground">cards/dia</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{step2Metrics.cardsPerWeek}</p>
                    <p className="text-xs text-muted-foreground">cards/semana</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Com <strong>{formatMinutes(dailyMinutes)}</strong> de estudo por dia, você consegue revisar aproximadamente <strong>{step2Metrics.cardsPerDay} cards</strong> diariamente.
                </p>

                {targetDate && step2Metrics.daysLeft && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm">
                      📅 <strong>{step2Metrics.daysLeft} dias</strong> até {format(targetDate, "dd/MM/yyyy")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              {selectedDeckIds.length} baralho(s) selecionado(s)
            </p>

            <Button className="w-full" size="lg" onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        )}

        {/* Step 3: Adjustment + confirm */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">Quanto tempo você tem por dia?</h2>
              <p className="text-sm text-muted-foreground">Ajuste o slider para definir sua disponibilidade diária.</p>
            </div>

            <Card>
              <CardContent className="p-5 space-y-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-primary">{formatMinutes(dailyMinutes)}</p>
                  <p className="text-sm text-muted-foreground mt-1">por dia</p>
                </div>

                <Slider
                  value={[dailyMinutes]}
                  onValueChange={([v]) => setDailyMinutes(v)}
                  min={15}
                  max={240}
                  step={15}
                  className="py-4"
                />

                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  {SLIDER_MARKS.map(m => (
                    <span key={m} className={cn(dailyMinutes === m && 'text-primary font-bold')}>
                      {formatMinutes(m)}
                    </span>
                  ))}
                </div>

                {/* Real-time feedback */}
                {step2Metrics && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xl font-bold text-primary">
                          {Math.floor((dailyMinutes * 60) / avgSecondsPerCard)}
                        </p>
                        <p className="text-xs text-muted-foreground">cards/dia</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xl font-bold text-primary">
                          {Math.floor((dailyMinutes * 60) / avgSecondsPerCard) * 7}
                        </p>
                        <p className="text-xs text-muted-foreground">cards/semana</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              className="w-full"
              size="lg"
              onClick={handleConfirmPlan}
              disabled={createPlan.isPending || updatePlan.isPending}
            >
              {createPlan.isPending || updatePlan.isPending ? 'Salvando...' : 'Confirmar meu plano ✨'}
            </Button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

// ─── Plan Dashboard ───────────────────────────────

interface PlanDashboardProps {
  plan: any;
  metrics: any;
  onEdit: () => void;
  onDelete: () => void;
}

function PlanDashboard({ plan, metrics, onEdit, onDelete }: PlanDashboardProps) {
  const navigate = useNavigate();

  const healthColor = metrics?.healthStatus === 'green' ? 'bg-emerald-500' : metrics?.healthStatus === 'yellow' ? 'bg-amber-500' : 'bg-red-500';
  const healthLabel = metrics?.healthStatus === 'green' ? 'No Trilho' : metrics?.healthStatus === 'yellow' ? 'Atenção' : 'Meta em Risco';

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CalendarCheck className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold flex-1">Meu Plano</h1>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-1" /> Editar
        </Button>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">
        {/* Health indicator */}
        {plan.target_date && metrics && (
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className={cn('h-3 w-3 rounded-full', healthColor)} />
            <span className="text-sm font-medium">{healthLabel}</span>
            {metrics.daysRemaining != null && (
              <span className="text-xs text-muted-foreground ml-auto">
                {metrics.daysRemaining} dias restantes
              </span>
            )}
          </div>
        )}

        {/* Daily metrics */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">{formatMinutes(plan.daily_minutes)} / dia</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-2xl font-bold text-primary">{metrics?.cardsPerDay ?? '—'}</p>
                <p className="text-xs text-muted-foreground">cards/dia</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-2xl font-bold text-primary">{metrics?.cardsPerWeek ?? '—'}</p>
                <p className="text-xs text-muted-foreground">cards/semana</p>
              </div>
            </div>

            {metrics && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold">{metrics.totalNew}</p>
                  <p className="text-[10px] text-muted-foreground">Novos</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{metrics.totalLearning}</p>
                  <p className="text-[10px] text-muted-foreground">Aprendendo</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{metrics.totalReview}</p>
                  <p className="text-[10px] text-muted-foreground">Revisão</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target date progress */}
        {plan.target_date && metrics && metrics.coveragePercent != null && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Meta até {format(new Date(plan.target_date), "dd/MM/yyyy")}</span>
              </div>
              <Progress value={metrics.coveragePercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cobertura: {metrics.coveragePercent}%</span>
                {metrics.requiredCardsPerDay != null && (
                  <span>Necessário: {metrics.requiredCardsPerDay} cards/dia</span>
                )}
              </div>
              {metrics.coveragePercent < 70 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    Seu ritmo atual pode não ser suficiente para atingir a meta. Considere aumentar o tempo diário ou focar em menos baralhos.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Decks in plan */}
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold mb-2">Baralhos no plano</p>
            <p className="text-xs text-muted-foreground">{plan.deck_ids?.length ?? 0} baralho(s) selecionado(s)</p>
          </CardContent>
        </Card>

        {/* Delete */}
        <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" /> Excluir plano
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}

export default StudyPlan;
