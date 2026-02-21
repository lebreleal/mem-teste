import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock, Target, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { PlanDashboard } from '@/components/study-plan/PlanDashboard';
import { formatMinutes, SLIDER_MARKS } from '@/components/study-plan/constants';
import BottomNav from '@/components/BottomNav';

type WizardStep = 1 | 2 | 3;

const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { plans, plan, isLoading, metrics, avgSecondsPerCard, calcImpact, createPlan, updatePlan, deletePlan, selectPlan } = useStudyPlan();
  const { decks, isLoading: decksLoading } = useDecks();
  const { isPremium } = useSubscription();
  const activeDecks = useMemo(() => (decks ?? []).filter(d => !d.is_archived), [decks]);

  const [step, setStep] = useState<WizardStep>(1);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState<Date | undefined>();
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [planName, setPlanName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const step2Metrics = useMemo(() => {
    if (selectedDeckIds.length === 0) return null;
    const avg = avgSecondsPerCard;
    const cardsPerDay = Math.floor((dailyMinutes * 60) / avg);
    const cardsPerWeek = cardsPerDay * 7;
    let daysLeft: number | null = null;
    if (targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
    }
    return { cardsPerDay, cardsPerWeek, daysLeft, avgSeconds: avg };
  }, [selectedDeckIds, dailyMinutes, targetDate, avgSecondsPerCard]);

  const handleConfirmPlan = async () => {
    try {
      const name = planName.trim() || 'Meu Plano';
      if (isEditing && editingPlanId) {
        await updatePlan.mutateAsync({
          id: editingPlanId,
          name,
          daily_minutes: dailyMinutes,
          deck_ids: selectedDeckIds,
          target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null,
        });
        toast({ title: 'Plano atualizado!' });
      } else {
        if (!isPremium && plans.length >= 1) {
          toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais planos.', variant: 'destructive' });
          return;
        }
        await createPlan.mutateAsync({
          name,
          daily_minutes: dailyMinutes,
          deck_ids: selectedDeckIds,
          target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null,
        });
        toast({ title: 'Plano criado com sucesso! 🎯' });
      }
      setIsEditing(false);
      setEditingPlanId(null);
    } catch {
      toast({ title: 'Erro ao salvar plano', variant: 'destructive' });
    }
  };

  const handleDeletePlan = async (planId?: string) => {
    try {
      await deletePlan.mutateAsync(planId ?? plan?.id);
      toast({ title: 'Plano excluído' });
      setIsEditing(false);
      setEditingPlanId(null);
      setStep(1);
      setSelectedDeckIds([]);
      setTargetDate(undefined);
      setDailyMinutes(60);
      setPlanName('');
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const startEdit = (p?: any) => {
    const target = p ?? plan;
    if (!target) return;
    setEditingPlanId(target.id);
    setSelectedDeckIds(target.deck_ids ?? []);
    setTargetDate(target.target_date ? new Date(target.target_date) : undefined);
    setDailyMinutes(target.daily_minutes);
    setPlanName(target.name ?? '');
    setStep(1);
    setIsEditing(true);
  };

  const startNewPlan = () => {
    if (!isPremium && plans.length >= 1) {
      toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais planos.', variant: 'destructive' });
      return;
    }
    setEditingPlanId(null);
    setSelectedDeckIds([]);
    setTargetDate(undefined);
    setDailyMinutes(60);
    setPlanName('');
    setStep(1);
    setIsEditing(false);
  };

  if (isLoading || decksLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Show dashboard if we have a plan and not editing
  if (plan && !isEditing) {
    return (
      <PlanDashboard
        plan={plan}
        plans={plans}
        metrics={metrics}
        decks={activeDecks}
        avgSecondsPerCard={avgSecondsPerCard}
        calcImpact={calcImpact}
        isPremium={isPremium}
        onEdit={() => startEdit(plan)}
        onDelete={() => handleDeletePlan(plan.id)}
        onUpdatePlan={updatePlan.mutateAsync}
        onSelectPlan={(id) => selectPlan.mutateAsync(id)}
        onNewPlan={startNewPlan}
        onEditPlan={(p) => startEdit(p)}
      />
    );
  }

  // ─── Wizard ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => {
          if (isEditing) { setIsEditing(false); setEditingPlanId(null); return; }
          if (step > 1) { setStep((step - 1) as WizardStep); return; }
          if (plans.length > 0) { return; }
          navigate(-1);
        }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-bold flex-1">
          {isEditing ? 'Editar Plano' : 'Novo Plano de Estudo'}
        </h1>
        <div className="flex gap-1">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">Nome do plano</h2>
              <p className="text-sm text-muted-foreground">Dê um nome que identifique este plano (ex: ENAMED, Prova de Fisiologia).</p>
            </div>
            <Input
              placeholder="Ex: Plano ENAMED"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="text-base"
            />
            <div>
              <h2 className="text-xl font-bold mb-1">O que você precisa estudar?</h2>
              <p className="text-sm text-muted-foreground">Selecione baralhos ou sub-baralhos para incluir no plano.</p>
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
                        : 'border-border hover:bg-muted/50',
                      deck.parent_deck_id && 'ml-6'
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
                      {deck.parent_deck_id && (
                        <p className="text-[10px] text-muted-foreground">Sub-baralho</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
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
            <Button className="w-full" size="lg" disabled={selectedDeckIds.length === 0} onClick={() => setStep(2)}>
              Continuar
            </Button>
          </div>
        )}

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
                  Com <strong>{formatMinutes(dailyMinutes)}</strong> por dia, você revisa ~<strong>{step2Metrics.cardsPerDay} cards</strong>.
                </p>
                {targetDate && step2Metrics.daysLeft && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm">📅 <strong>{step2Metrics.daysLeft} dias</strong> até {format(targetDate, "dd/MM/yyyy")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Button className="w-full" size="lg" onClick={() => setStep(3)}>Continuar</Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">Quanto tempo você tem por dia?</h2>
              <p className="text-sm text-muted-foreground">Ajuste para definir sua disponibilidade.</p>
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
                  min={15} max={240} step={15}
                  className="py-4"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  {SLIDER_MARKS.map(m => (
                    <span key={m} className={cn(dailyMinutes === m && 'text-primary font-bold')}>{formatMinutes(m)}</span>
                  ))}
                </div>
                {step2Metrics && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xl font-bold text-primary">{Math.floor((dailyMinutes * 60) / avgSecondsPerCard)}</p>
                        <p className="text-xs text-muted-foreground">cards/dia</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xl font-bold text-primary">{Math.floor((dailyMinutes * 60) / avgSecondsPerCard) * 7}</p>
                        <p className="text-xs text-muted-foreground">cards/semana</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Button
              className="w-full" size="lg"
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

export default StudyPlan;
