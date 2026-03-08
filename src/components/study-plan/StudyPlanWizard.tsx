import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Target, CalendarIcon, GraduationCap, HelpCircle, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getWeeklyAvgNewCardsGlobal, getWeeklyAvgMinutesGlobal, type StudyPlan as StudyPlanType } from '@/hooks/useStudyPlan';
import type { DeckWithStats } from '@/types/deck';
import { DeckHierarchySelector } from '@/components/study-plan/DeckHierarchySelector';
import { WhatCanIDoDialog } from '@/components/study-plan/StudyPlanDialogs';
import BottomNav from '@/components/BottomNav';

type WizardStep = 1 | 2 | 3;

interface StudyPlanWizardProps {
  plans: StudyPlanType[];
  activeDecks: DeckWithStats[];
  globalCapacity: any;
  metrics: any;
  avgSecondsPerCard: number;
  isPremium: boolean;
  isEditing: boolean;
  editingPlanId: string | null;
  createPlan: any;
  updatePlan: any;
  deletePlan: any;
  onBack: () => void;
}

export const StudyPlanWizard = ({
  plans, activeDecks, globalCapacity, metrics, avgSecondsPerCard,
  isPremium, isEditing, editingPlanId,
  createPlan, updatePlan, deletePlan, onBack,
}: StudyPlanWizardProps) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>(() => {
    if (isEditing && editingPlanId) {
      const plan = plans.find(p => p.id === editingPlanId);
      return plan?.deck_ids ?? [];
    }
    return [];
  });
  const [targetDate, setTargetDate] = useState<Date | undefined>(() => {
    if (isEditing && editingPlanId) {
      const plan = plans.find(p => p.id === editingPlanId);
      return plan?.target_date ? new Date(plan.target_date) : undefined;
    }
    return undefined;
  });
  const [planName, setPlanName] = useState(() => {
    if (isEditing && editingPlanId) {
      return plans.find(p => p.id === editingPlanId)?.name ?? '';
    }
    return '';
  });
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [showWhatCanIDo, setShowWhatCanIDo] = useState(false);

  const handleConfirmPlan = async () => {
    const name = planName.trim() || 'Meu Objetivo';
    if (isEditing && editingPlanId) {
      await updatePlan.mutateAsync({ id: editingPlanId, name, deck_ids: selectedDeckIds, target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null });
    } else {
      await createPlan.mutateAsync({ name, deck_ids: selectedDeckIds, target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null });
    }
    onBack();
  };

  const feasibilityCheck = targetDate && selectedDeckIds.length > 0 ? (() => {
    const getNewCardsRecursive = (deckId: string): number => {
      const deck = activeDecks.find(d => d.id === deckId);
      const own = deck?.new_count ?? 0;
      const children = activeDecks.filter(d => d.parent_deck_id === deckId);
      return own + children.reduce((s, c) => s + getNewCardsRecursive(c.id), 0);
    };
    const selectedNewCards = selectedDeckIds
      .filter(id => { const deck = activeDecks.find(d => d.id === id); return !deck?.parent_deck_id || !selectedDeckIds.includes(deck.parent_deck_id); })
      .reduce((sum, id) => sum + getNewCardsRecursive(id), 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
    const budget = getWeeklyAvgNewCardsGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
    const minDaysNeeded = Math.ceil(selectedNewCards / budget);
    const isImpossible = daysLeft < minDaysNeeded;
    const isTight = !isImpossible && daysLeft === minDaysNeeded;
    if (!isImpossible && !isTight) return null;
    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + minDaysNeeded);
    const neededPerDay = Math.ceil(selectedNewCards / daysLeft);
    return { isImpossible, isTight, minDaysNeeded, suggestedDate, selectedNewCards, budget, daysLeft, neededPerDay };
  })() : null;

  const feasibilityBlock = feasibilityCheck && (
    <div className={cn(
      'rounded-lg border p-3 space-y-2',
      feasibilityCheck.isImpossible ? 'border-destructive/50 bg-destructive/5' : 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30'
    )}>
      <p className={cn('text-xs font-semibold', feasibilityCheck.isImpossible ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>
        {feasibilityCheck.isImpossible ? '⚠️ Meta inviável' : '⚡ Meta apertada'}
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {feasibilityCheck.isImpossible
          ? <>Seu ritmo atual de <strong>{feasibilityCheck.budget} cards/dia</strong> não é suficiente para cobrir os <strong>{feasibilityCheck.selectedNewCards} cards restantes</strong> até <strong>{format(targetDate!, "dd/MM/yyyy")}</strong>.</>
          : <>Você terminará os <strong>{feasibilityCheck.selectedNewCards} cards restantes</strong> exatamente na data definida, sem margem para imprevistos.</>
        }
      </p>
      {feasibilityCheck.isImpossible && (
        <Button size="sm" variant="outline" className="w-full text-xs gap-1.5" onClick={() => setShowWhatCanIDo(true)}>
          <HelpCircle className="h-3.5 w-3.5" /> O que posso fazer?
        </Button>
      )}
      <WhatCanIDoDialog
        open={showWhatCanIDo} onOpenChange={setShowWhatCanIDo}
        totalNew={feasibilityCheck.selectedNewCards} neededPerDay={feasibilityCheck.neededPerDay}
        budget={feasibilityCheck.budget} suggestedDate={feasibilityCheck.suggestedDate}
        earliestTarget={targetDate!}
        avgDailyMin={getWeeklyAvgMinutesGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes)}
        reviewMinToday={metrics?.reviewMinutes ?? 0} avgSec={avgSecondsPerCard}
        effectiveRate={feasibilityCheck.budget}
        onApplyDate={(d) => setTargetDate(d)}
        onGoToCards={onBack}
        onGoToCapacity={onBack}
      />
    </div>
  );

  if (isEditing) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="font-display text-lg font-bold flex-1">Editar Objetivo</h1>
        </header>
        <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">Nome do objetivo</h2></div>
            <Input placeholder="Ex: ENARE 2026" value={planName} onChange={(e) => setPlanName(e.target.value)} className="text-base" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">Baralhos</h2></div>
            {activeDecks.length === 0 ? (
              <Card className="border-dashed"><CardContent className="p-6 text-center space-y-3"><BookOpen className="h-10 w-10 text-muted-foreground mx-auto" /><p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p><Button onClick={() => navigate('/dashboard')}>Criar baralho</Button></CardContent></Card>
            ) : (
              <DeckHierarchySelector decks={activeDecks} selectedDeckIds={selectedDeckIds} setSelectedDeckIds={setSelectedDeckIds} plans={plans} editingPlanId={editingPlanId} />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">Data pra completar o estudo</h2></div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={targetDate} onSelect={setTargetDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {feasibilityBlock}
          </div>
          <Button className="w-full" size="lg" onClick={handleConfirmPlan} disabled={!planName.trim() || selectedDeckIds.length === 0 || !targetDate || updatePlan.isPending}>
            {updatePlan.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
          {editingPlanId && (
            <AlertDialog open={deletingPlanId === editingPlanId} onOpenChange={(open) => setDeletingPlanId(open ? editingPlanId : null)}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive text-xs"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir objetivo</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Excluir objetivo?</AlertDialogTitle><AlertDialogDescription>O objetivo "{planName}" será permanentemente excluído.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { deletePlan.mutateAsync(editingPlanId); onBack(); }}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </main>
        <BottomNav />
      </div>
    );
  }

  // Create wizard
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { if (step > 1) { setStep((step - 1) as WizardStep); return; } onBack(); }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-bold flex-1">Novo Objetivo de Estudo</h1>
        <div className="flex gap-1">{[1, 2, 3].map(s => (<div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />))}</div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <div className="flex items-center gap-2 mb-1"><GraduationCap className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Nome do objetivo</h2></div>
              <p className="text-sm text-muted-foreground">Dê um nome curto para identificar esta meta.</p>
            </div>
            <Input placeholder="Ex: ENARE 2026" value={planName} onChange={(e) => setPlanName(e.target.value)} className="text-base" autoFocus />
            <Button className="w-full" size="lg" disabled={!planName.trim()} onClick={() => setStep(2)}>Continuar</Button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div><h2 className="text-xl font-bold mb-1">Selecione os baralhos</h2><p className="text-sm text-muted-foreground">Escolha quais baralhos fazem parte deste objetivo.</p></div>
            {activeDecks.length === 0 ? (
              <Card className="border-dashed"><CardContent className="p-6 text-center space-y-3"><BookOpen className="h-10 w-10 text-muted-foreground mx-auto" /><p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p><Button onClick={() => navigate('/dashboard')}>Criar baralho</Button></CardContent></Card>
            ) : (
              <DeckHierarchySelector decks={activeDecks} selectedDeckIds={selectedDeckIds} setSelectedDeckIds={setSelectedDeckIds} plans={plans} editingPlanId={editingPlanId} />
            )}
            <Button className="w-full" size="lg" disabled={selectedDeckIds.length === 0} onClick={() => setStep(3)}>Continuar</Button>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <div className="flex items-center gap-2 mb-1"><Target className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Data pra completar o estudo</h2></div>
              <p className="text-sm text-muted-foreground">Escolha até quando você quer ter <strong>dominado todos os cards novos</strong>.</p>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4 mr-2" />{targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={targetDate} onSelect={setTargetDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {feasibilityBlock}
            <Button className="w-full" size="lg" onClick={handleConfirmPlan} disabled={!targetDate || createPlan.isPending}>
              {createPlan.isPending ? 'Salvando...' : 'Criar objetivo'}
            </Button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};
