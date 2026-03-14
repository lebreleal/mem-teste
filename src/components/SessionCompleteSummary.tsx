/**
 * SessionCompleteSummary — ALEKS-style epic completion screen.
 * Shows per-deck breakdown, accuracy, time, and motivational message.
 */
import { useMemo } from 'react';
import { ArrowLeft, CheckCircle2, Trophy, Target, Clock, Flame, Layers, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DeckSessionStats } from '@/components/SessionProgressStrip';

interface SessionCompleteSummaryProps {
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
  elapsedMs: number;
  deckStats: DeckSessionStats[];
  onGoBack: () => void;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}min ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function getMotivationalMessage(accuracy: number, count: number) {
  if (count >= 100 && accuracy >= 85) return 'Sessão épica! Você é uma máquina! 🏆';
  if (count >= 50 && accuracy >= 80) return 'Excelente sessão! Sua memória agradece! 💪';
  if (accuracy >= 90) return 'Retenção absurda! Continue assim! 🎯';
  if (accuracy >= 75) return 'Ótimo trabalho! A consistência faz a diferença! 🔥';
  if (accuracy >= 60) return 'Bom esforço! Os erros são parte do aprendizado! 📈';
  return 'Cada card estudado é progresso! Continue firme! 💡';
}

const SessionCompleteSummary = ({
  reviewCount,
  correctCount,
  wrongCount,
  elapsedMs,
  deckStats,
  onGoBack,
}: SessionCompleteSummaryProps) => {
  const accuracy = reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : 0;
  const avgTimePerCard = reviewCount > 0 ? Math.round(elapsedMs / reviewCount / 1000) : 0;
  const completedDecks = deckStats.filter(d => d.done >= d.total && d.total > 0);
  const activeDecks = deckStats.filter(d => d.total > 0).sort((a, b) => (b.done / b.total) - (a.done / a.total));
  const message = getMotivationalMessage(accuracy, reviewCount);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="animate-fade-in w-full max-w-md space-y-6">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-10 w-10 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Sessão Completa!</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/50 bg-card p-3 text-center">
            <Layers className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground tabular-nums">{reviewCount}</p>
            <p className="text-[11px] text-muted-foreground">cards estudados</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3 text-center">
            <Target className="h-4 w-4 mx-auto mb-1" style={{ color: accuracy >= 80 ? 'hsl(var(--primary))' : accuracy >= 60 ? 'hsl(45 100% 50%)' : 'hsl(var(--destructive))' }} />
            <p className="text-2xl font-bold text-foreground tabular-nums">{accuracy}%</p>
            <p className="text-[11px] text-muted-foreground">acerto ({correctCount}✓ {wrongCount}✗)</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3 text-center">
            <Clock className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatTime(elapsedMs)}</p>
            <p className="text-[11px] text-muted-foreground">tempo total</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3 text-center">
            <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground tabular-nums">{avgTimePerCard}s</p>
            <p className="text-[11px] text-muted-foreground">média por card</p>
          </div>
        </div>

        {/* Per-deck breakdown */}
        {activeDecks.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Progresso por baralho
              {completedDecks.length > 0 && (
                <span className="text-primary">({completedDecks.length} concluídos)</span>
              )}
            </h3>
            <div className="space-y-2">
              {activeDecks.slice(0, 10).map(deck => {
                const pct = deck.total > 0 ? Math.round((deck.done / deck.total) * 100) : 0;
                const isDone = deck.done >= deck.total;
                return (
                  <div key={deck.deckId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`truncate flex-1 min-w-0 pr-2 ${isDone ? 'text-primary font-medium' : 'text-foreground'}`}>
                        {isDone && '✅ '}{deck.deckName}
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {deck.done}/{deck.total}
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
              {activeDecks.length > 10 && (
                <p className="text-[10px] text-muted-foreground">+{activeDecks.length - 10} baralhos</p>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
        <Button onClick={onGoBack} className="w-full h-12 gap-2 text-base font-bold rounded-xl">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Dashboard
        </Button>
      </div>
    </div>
  );
};

export default SessionCompleteSummary;
