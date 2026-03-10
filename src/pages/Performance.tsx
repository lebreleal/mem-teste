import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePerformance, type SubjectRetention, type CardTypeBreakdown } from '@/hooks/usePerformance';
import { useDecks } from '@/hooks/useDecks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, BookOpen,
  Calendar, BarChart3, Layers, RotateCcw, Sparkles,
  Type, EyeOff, ListChecks, Braces, SquarePlus,
} from 'lucide-react';

const retentionColor = (pct: number) => {
  if (pct >= 80) return { text: 'text-success', bg: 'bg-success/10', border: 'border-success/20', progress: '[&>div]:bg-success' };
  if (pct >= 50) return { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', progress: '[&>div]:bg-warning' };
  return { text: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', progress: '[&>div]:bg-destructive' };
};

const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
  if (trend === 'up') return <TrendingUp className="h-3 w-3 text-success" />;
  if (trend === 'down') return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const Performance = () => {
  const navigate = useNavigate();
  const { data, isLoading } = usePerformance();
  const { decks } = useDecks();
  const subjects = data?.subjects ?? [];

  const [newInfoOpen, setNewInfoOpen] = useState(false);
  const [learningInfoOpen, setLearningInfoOpen] = useState(false);
  const [reviewInfoOpen, setReviewInfoOpen] = useState(false);
  const [relearningInfoOpen, setRelearningInfoOpen] = useState(false);

  const globalRetention = subjects.length > 0
    ? Math.round(subjects.reduce((sum, s) => sum + s.avgRetention, 0) / subjects.length)
    : 0;

  const todaySubjects = subjects.filter(s => s.reviewCards > 0 || s.newCards > 0);

  // Aggregate card state counts from all root decks
  const cardStateCounts = useMemo(() => {
    const rootDecks = (decks ?? []).filter(d => !d.is_archived && !d.parent_deck_id);
    let newCount = 0, learningCount = 0, reviewCount = 0, relearningCount = 0;

    const addDeckAndChildren = (deckId: string) => {
      const deck = (decks ?? []).find(d => d.id === deckId);
      if (!deck || deck.is_archived) return;
      newCount += deck.new_count ?? 0;
      // learning_count includes both learning (state 1) and relearning (state 3)
      // We'll split based on state if available, otherwise show combined
      const lc = deck.learning_count ?? 0;
      learningCount += lc;
      reviewCount += deck.review_count ?? 0;
      // Find children
      const children = (decks ?? []).filter(d => d.parent_deck_id === deckId && !d.is_archived);
      children.forEach(c => addDeckAndChildren(c.id));
    };

    rootDecks.forEach(d => addDeckAndChildren(d.id));
    return { newCount, learningCount, reviewCount, relearningCount };
  }, [decks]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Planejamento
            </h1>
            <p className="text-xs text-muted-foreground">Visão geral dos seus estudos</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-2xl space-y-5">

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : subjects.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">Nenhum dado ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Estude alguns cards para ver seu planejamento aqui.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/dashboard')}>
                Ir para baralhos
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Card state breakdown - inline row */}
            <div className="rounded-2xl border border-border/50 bg-card px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <button onClick={() => setNewInfoOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                  <SquarePlus className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground tabular-nums">{cardStateCounts.newCount}</span>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </button>
                <button onClick={() => setLearningInfoOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                  <RotateCcw className="h-4 w-4 text-warning" />
                  <span className="text-sm font-bold text-foreground tabular-nums">{cardStateCounts.learningCount}</span>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </button>
                <button onClick={() => setReviewInfoOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-foreground tabular-nums">{cardStateCounts.reviewCount}</span>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </button>
                <button onClick={() => setRelearningInfoOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors">
                  <RotateCcw className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-bold text-foreground tabular-nums">{data?.totalPendingReviews ?? 0}</span>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Info dialogs */}
            <Dialog open={newInfoOpen} onOpenChange={setNewInfoOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <SquarePlus className="h-5 w-5 text-muted-foreground" />
                    Novos
                  </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">Cards que você ainda não estudou. Eles serão introduzidos gradualmente conforme seu limite diário de novos cards.</p>
              </DialogContent>
            </Dialog>
            <Dialog open={learningInfoOpen} onOpenChange={setLearningInfoOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-warning" />
                    Aprendendo
                  </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">Cards na fase inicial de aprendizado. Eles aparecem várias vezes na mesma sessão até serem memorizados o suficiente para a repetição espaçada.</p>
              </DialogContent>
            </Dialog>
            <Dialog open={reviewInfoOpen} onOpenChange={setReviewInfoOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Dominados
                  </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">Cards que já foram graduados e estão em repetição espaçada. Aparecem em intervalos cada vez maiores conforme você os domina.</p>
              </DialogContent>
            </Dialog>
            <Dialog open={relearningInfoOpen} onOpenChange={setRelearningInfoOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-destructive" />
                    Reaprendendo
                  </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">Cards dominados que você errou durante a revisão. Eles voltam para a fase de aprendizado até serem memorizados novamente.</p>
              </DialogContent>
            </Dialog>

            {/* Today's tasks */}
            <Card className="rounded-2xl">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">O Que Fazer Hoje</h2>
                </div>

                {todaySubjects.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">🎉 Tudo em dia!</p>
                    <p className="text-xs text-muted-foreground mt-1">Nenhuma revisão pendente para hoje.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {todaySubjects.map(s => {
                      const totalToday = s.newCards + s.reviewCards;
                      const ct = s.todayCardTypes;
                      const typeItems = [
                        { icon: Type, label: 'Básico', count: ct.basic, color: 'text-primary' },
                        { icon: Braces, label: 'Cloze', count: ct.cloze, color: 'text-accent-foreground' },
                        { icon: ListChecks, label: 'Múlt. Escolha', count: ct.multiple_choice, color: 'text-warning' },
                        { icon: EyeOff, label: 'Oclusão', count: ct.image_occlusion, color: 'text-success' },
                      ].filter(t => t.count > 0);

                      return (
                        <button
                          key={s.subjectId}
                          onClick={() => navigate(`/decks/${s.subjectId}`)}
                          className="w-full rounded-xl bg-muted/40 px-3 py-2.5 space-y-1.5 text-left hover:bg-muted/60 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground truncate flex-1">{s.subjectName}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-bold">
                              {totalToday} cards
                            </Badge>
                          </div>
                          {typeItems.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pl-7">
                              {typeItems.map(t => (
                                <span key={t.label} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-background/60 rounded-md px-1.5 py-0.5">
                                  <t.icon className={`h-2.5 w-2.5 ${t.color}`} />
                                  {t.count} {t.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Retention by deck */}
            <Card className="rounded-2xl">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Retenção por Baralho</h2>
                </div>

                <div className="space-y-3">
                  {subjects.map(s => {
                    const colors = retentionColor(s.avgRetention);
                    return (
                      <div key={s.subjectId} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <TrendIcon trend={s.trend} />
                            <span className="text-sm font-medium text-foreground truncate">{s.subjectName}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{s.totalCards} cards</span>
                            <span className={`text-sm font-bold tabular-nums ${colors.text}`}>
                              {s.avgRetention}%
                            </span>
                          </div>
                        </div>
                        <Progress value={s.avgRetention} className={`h-1.5 ${colors.progress}`} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default Performance;
