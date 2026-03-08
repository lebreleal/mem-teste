/**
 * Extracted dialogs from StudyPlan page:
 * - WhatCanIDoDialog: shows options when objective is infeasible
 * - CatchUpDialog: manages overdue review cards
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, HelpCircle, Layers, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMinutes } from './constants';

// ─── "What Can I Do?" Dialog ────────────────────────────
export function WhatCanIDoDialog({ open, onOpenChange, totalNew, neededPerDay, budget, suggestedDate, earliestTarget, avgDailyMin, reviewMinToday, avgSec, effectiveRate, onApplyDate, onGoToCards, onGoToCapacity }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  totalNew: number; neededPerDay: number; budget: number;
  suggestedDate: Date; earliestTarget: Date;
  avgDailyMin: number; reviewMinToday: number; avgSec: number; effectiveRate: number;
  onApplyDate: (date: Date) => void;
  onGoToCards: () => void;
  onGoToCapacity: () => void;
}) {
  const neededMinPerDay = Math.ceil((neededPerDay * avgSec) / 60) + reviewMinToday;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            O que posso fazer?
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Você tem <strong>{totalNew} cards novos</strong> para dominar até <strong>{format(earliestTarget, "dd/MM/yyyy")}</strong>, mas no ritmo atual ({effectiveRate}/dia) só terminaria em <strong>{format(suggestedDate, "dd/MM/yyyy")}</strong>. Veja suas opções:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Option 1: Change date */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold">Dar mais tempo</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mudar a data pra completar o estudo para <strong>{format(suggestedDate, "dd/MM/yyyy")}</strong> — assim você mantém o ritmo atual sem se sobrecarregar.
            </p>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { onApplyDate(suggestedDate); onOpenChange(false); }}>
              <CalendarIcon className="h-3 w-3 mr-1.5" />
              Aplicar data sugerida
            </Button>
          </div>

          {/* Option 2: Increase cards */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold">Estudar mais cards por dia</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aumentar de <strong>{budget}</strong> para <strong>{neededPerDay} novos cards/dia</strong> para cumprir o prazo.
            </p>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { onGoToCards(); onOpenChange(false); }}>
              <Layers className="h-3 w-3 mr-1.5" />
              Ajustar limite de cards
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catch-Up Dialog ────────────────────────────────────
export function CatchUpDialog({ open, onOpenChange, totalReview, avgSecondsPerCard, allDeckIds }: {
  open: boolean; onOpenChange: (v: boolean) => void; totalReview: number; avgSecondsPerCard: number; allDeckIds: string[];
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [diluting, setDiluting] = useState(false);

  useEffect(() => {
    if (!open || allDeckIds.length === 0) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .in('deck_id', allDeckIds)
      .eq('state', 2)
      .lt('scheduled_date', cutoff.toISOString())
      .then(({ count }) => setOverdueCount(count ?? 0));
  }, [open, allDeckIds]);

  const handleDilute = async (days: number) => {
    if (allDeckIds.length === 0) return;
    setDiluting(true);

    const { data: overdueCards, error: fetchErr } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', allDeckIds)
      .eq('state', 2)
      .lte('scheduled_date', new Date().toISOString())
      .order('scheduled_date', { ascending: true });

    if (fetchErr || !overdueCards || overdueCards.length === 0) {
      setDiluting(false);
      onOpenChange(false);
      if (fetchErr) toast({ title: 'Erro ao buscar cards', variant: 'destructive' });
      return;
    }

    const perDay = Math.ceil(overdueCards.length / days);
    let hasError = false;

    for (let d = 0; d < days && !hasError; d++) {
      const batch = overdueCards.slice(d * perDay, (d + 1) * perDay);
      if (batch.length === 0) break;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + d);
      targetDate.setHours(0, 0, 0, 0);

      const { error: upErr } = await supabase
        .from('cards')
        .update({ scheduled_date: targetDate.toISOString() } as any)
        .in('id', batch.map(c => c.id));

      if (upErr) hasError = true;
    }

    setDiluting(false);
    onOpenChange(false);

    if (hasError) {
      toast({ title: 'Erro ao redistribuir alguns cards', variant: 'destructive' });
    } else {
      const minPerDay = Math.round((perDay * avgSecondsPerCard) / 60);
      toast({
        title: `${overdueCards.length} revisões redistribuídas em ${days} dias`,
        description: `~${perDay} cards/dia · ${formatMinutes(minPerDay)} extra por dia`,
      });
    }

    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
    qc.invalidateQueries({ queryKey: ['study-queue'] });
    qc.invalidateQueries({ queryKey: ['decks'] });
    qc.invalidateQueries({ queryKey: ['deck-stats'] });
    qc.invalidateQueries({ queryKey: ['per-deck-new-counts'] });
  };

  const handleResetOverdue = async () => {
    if (allDeckIds.length === 0) return;
    setResetting(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    
    const { error } = await supabase
      .from('cards')
      .update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any)
      .in('deck_id', allDeckIds)
      .eq('state', 2)
      .lt('scheduled_date', cutoff.toISOString());
    
    setResetting(false);
    setShowResetConfirm(false);
    onOpenChange(false);
    
    if (error) {
      toast({ title: 'Erro ao resetar cards', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['plan-metrics'] });
      qc.invalidateQueries({ queryKey: ['per-deck-new-counts'] });
      qc.invalidateQueries({ queryKey: ['study-queue'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck-stats'] });
      toast({ title: `${overdueCount} cards resetados`, description: 'Eles voltaram ao estado "novo" e serão reapresentados gradualmente.' });
    }
  };

  return (
    <>
      <Dialog open={open && !showResetConfirm} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Gerenciar Revisões Atrasadas
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">O que são revisões atrasadas?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              São <strong>{totalReview} cards</strong> que já passaram da data ideal de revisão.
              Eles <strong>já estão incluídos</strong> na sua carga diária — quando você estuda,
              esses cards aparecem normalmente junto com os novos.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se o volume está alto demais, você pode <strong>redistribuí-los</strong> ao longo de
              vários dias para tornar a carga mais leve, ou <strong>resetar</strong> os cards
              muito antigos para recomeçar do zero.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Redistribuir ao longo de dias
            </p>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Move as datas de revisão para distribuir a carga uniformemente.
            </p>
            {[3, 5, 7].map(days => {
              const perDay = Math.ceil(totalReview / days);
              const minPerDay = Math.round((perDay * avgSecondsPerCard) / 60);
              return (
                <Button key={days} variant="outline" className="w-full justify-between h-auto py-3" onClick={() => handleDilute(days)} disabled={diluting}>
                  <span>{diluting ? 'Redistribuindo…' : <>Diluir em <strong>{days} dias</strong></>}</span>
                  <span className="text-xs text-muted-foreground">{perDay} cards/dia · {formatMinutes(minPerDay)}</span>
                </Button>
              );
            })}

            {overdueCount != null && overdueCount > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opção drástica</p>
                <p className="text-[11px] text-muted-foreground">
                  Cards com mais de 30 dias de atraso provavelmente já foram esquecidos.
                  Resetar faz eles voltarem como "novos" — você reestuda do zero.
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto py-3 border-destructive/30 text-destructive hover:bg-destructive/5"
                  onClick={() => setShowResetConfirm(true)}
                >
                  <span>Resetar <strong>{overdueCount}</strong> cards com &gt;30 dias de atraso</span>
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Resetar {overdueCount} cards?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso é irreversível. Esses cards perderão todo o progresso de repetição espaçada e voltarão ao estado "novo".
              Use apenas se você ficou muito tempo sem estudar e quer recomeçar esses cards do zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetOverdue}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? 'Resetando...' : 'Sim, resetar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
