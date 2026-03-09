import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudyPlan, type StudyPlan as StudyPlanType } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { StudyPlanWizard } from '@/components/study-plan/StudyPlanWizard';
import { StudyPlanHome } from '@/components/study-plan/StudyPlanHome';
import BottomNav from '@/components/BottomNav';

const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    plans, allDeckIds, expandedDeckIds, globalCapacity, isLoading, metrics, avgSecondsPerCard,
    calcImpact, createPlan, updatePlan, deletePlan, updateCapacity, updateNewCardsLimit, reorderObjectives,
  } = useStudyPlan({ full: true });
  const { decks, isLoading: decksLoading } = useDecks();
  const { isPremium } = useSubscription();
  const activeDecks = useMemo(() => (decks ?? []).filter(d => !d.is_archived), [decks]);

  const [view, setView] = useState<'home' | 'wizard'>('home');
  const [isEditing, setIsEditing] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    setView('home');
    setIsEditing(false);
    setEditingPlanId(null);
  }, []);

  const startNewPlan = useCallback(() => {
    if (!isPremium && plans.length >= 1) {
      toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais objetivos.', variant: 'destructive' });
      return;
    }
    setEditingPlanId(null);
    setIsEditing(false);
    setView('wizard');
  }, [isPremium, plans.length, toast]);

  const startEdit = useCallback((p: StudyPlanType) => {
    setEditingPlanId(p.id);
    setIsEditing(true);
    setView('wizard');
  }, []);

  if (isLoading || decksLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (view === 'wizard') {
    return (
      <StudyPlanWizard
        plans={plans}
        activeDecks={activeDecks}
        globalCapacity={globalCapacity}
        metrics={metrics}
        avgSecondsPerCard={avgSecondsPerCard}
        isPremium={isPremium}
        isEditing={isEditing}
        editingPlanId={editingPlanId}
        createPlan={createPlan}
        updatePlan={updatePlan}
        deletePlan={deletePlan}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-display text-lg font-bold flex-1">Meu Plano de Estudos</h1>
        <Button variant="ghost" size="icon" onClick={startNewPlan} title="Novo objetivo"><Plus className="h-5 w-5" /></Button>
      </header>

      <StudyPlanHome
        plans={plans}
        activeDecks={activeDecks}
        globalCapacity={globalCapacity}
        expandedDeckIds={expandedDeckIds}
        allDeckIds={allDeckIds}
        metrics={metrics}
        avgSecondsPerCard={avgSecondsPerCard}
        isPremium={isPremium}
        updateCapacity={updateCapacity}
        updateNewCardsLimit={updateNewCardsLimit}
        reorderObjectives={reorderObjectives}
        updatePlan={updatePlan}
        onNavigateBack={() => navigate('/dashboard')}
        onStartNewPlan={startNewPlan}
        onStartEdit={startEdit}
      />

      <BottomNav />
    </div>
  );
};

export default StudyPlan;
