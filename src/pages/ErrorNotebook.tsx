/**
 * ErrorNotebook — Shows weak concepts with errors.
 * Lists concepts the user got wrong, with stats and scheduled review dates.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, BookX, CheckCircle2, BrainCircuit,
  AlertTriangle, Shield, PlayCircle, ChevronRight,
  Loader2, GitBranch, Clock, Zap,
} from 'lucide-react';
import { getWeakConceptsWithErrors, type WeakConceptWithErrors } from '@/services/conceptHierarchyService';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const HEALTH_CONFIG = {
  weak: { label: 'Fraco', icon: AlertTriangle, badgeClass: 'bg-destructive/15 text-destructive border-destructive/30' },
  learning: { label: 'Aprendendo', icon: BrainCircuit, badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  strong: { label: 'Dominado', icon: Shield, badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
};

// ─── Concept Row ───
const ConceptRow = ({
  concept,
}: {
  concept: WeakConceptWithErrors;
}) => {
  const config = HEALTH_CONFIG[concept.health];
  const Icon = config.icon;
  const total = concept.correct_count + concept.wrong_count;
  const pct = total > 0 ? Math.round((concept.correct_count / total) * 100) : 0;

  const scheduledDate = new Date(concept.scheduled_date);
  const isScheduledFuture = !concept.isDue;
  const timeLabel = isScheduledFuture
    ? `em ${formatDistanceToNow(scheduledDate, { locale: ptBR })}`
    : null;

  return (
    <div className={`rounded-xl border bg-card px-4 py-3 space-y-2.5 ${concept.isDue ? 'border-border/50' : 'border-border/30 opacity-75'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className="h-4 w-4 shrink-0 text-destructive" />
          <span className="text-sm font-semibold truncate">{concept.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {concept.isCascaded && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              Cascade
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${config.badgeClass}`}>
            {config.label}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {concept.errorCount > 0 && (
          <span>{concept.errorCount} {concept.errorCount === 1 ? 'erro' : 'erros'}</span>
        )}
        {total > 0 && (
          <>
            {concept.errorCount > 0 && <span>·</span>}
            <span className="tabular-nums">{concept.correct_count}✓ {concept.wrong_count}✗</span>
          </>
        )}
        {concept.category && (
          <>
            <span>·</span>
            <span className="truncate">{concept.category}</span>
          </>
        )}
      </div>

      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      )}

      {concept.parent && concept.parent.state !== 2 && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          <GitBranch className="h-3 w-3" />
          <span>Pré-requisito fraco: <strong>{concept.parent.name}</strong></span>
        </div>
      )}

      {isScheduledFuture && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-1">
          <Clock className="h-3 w-3" />
          <span>Revisão agendada {timeLabel}</span>
        </div>
      )}
    </div>
  );
};

// ─── Main Page ───
const ErrorNotebook = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: weakConcepts = [], isLoading } = useQuery({
    queryKey: ['error-notebook-concepts', user?.id],
    queryFn: () => getWeakConceptsWithErrors(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  const dueConcepts = weakConcepts.filter(c => c.isDue);
  const scheduledConcepts = weakConcepts.filter(c => !c.isDue);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <BookX className="h-5 w-5 text-destructive" />
              Temas Fracos
            </h1>
            <p className="text-xs text-muted-foreground">
              {dueConcepts.length} para revisar agora
              {scheduledConcepts.length > 0 && ` · ${scheduledConcepts.length} agendados`}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : weakConcepts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground">Tudo dominado!</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Não há temas fracos. Continue estudando — temas fracos aparecerão aqui automaticamente.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/dashboard')}>
              Voltar ao Dashboard
            </Button>
          </div>
        ) : (
          <>
            {/* Summary */}
            {dueConcepts.length > 0 && (
              <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-destructive text-lg">{dueConcepts.length}</span>{' '}
                    temas para revisar agora
                  </p>
                  <Badge variant="destructive" className="gap-1">
                    <BrainCircuit className="h-3 w-3" />
                    {weakConcepts.reduce((sum, c) => sum + c.errorCount, 0)} erros
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Temas onde você errou questões. Revise-os nos seus baralhos para fortalecer seu conhecimento.
                </p>
              </div>
            )}

            {/* Due concepts */}
            {dueConcepts.map(concept => (
              <ConceptRow key={concept.id} concept={concept} />
            ))}

            {/* Scheduled concepts (not yet due) */}
            {scheduledConcepts.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Agendados para revisão futura</span>
                </div>
                {scheduledConcepts.map(concept => (
                  <ConceptRow key={concept.id} concept={concept} />
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default ErrorNotebook;
