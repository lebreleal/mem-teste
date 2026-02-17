import { useNavigate } from 'react-router-dom';
import { usePerformance, type SubjectRetention, type CardTypeBreakdown } from '@/hooks/usePerformance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, BookOpen,
  Calendar, BarChart3, Layers, RotateCcw, Sparkles,
  Type, EyeOff, ListChecks, Braces,
} from 'lucide-react';

const retentionColor = (pct: number) => {
  if (pct >= 80) return { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', progress: '[&>div]:bg-emerald-500' };
  if (pct >= 50) return { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', progress: '[&>div]:bg-amber-500' };
  return { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', progress: '[&>div]:bg-red-500' };
};

const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
  if (trend === 'up') return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const Performance = () => {
  const navigate = useNavigate();
  const { data, isLoading } = usePerformance();
  const subjects = data?.subjects ?? [];

  const globalRetention = subjects.length > 0
    ? Math.round(subjects.reduce((sum, s) => sum + s.avgRetention, 0) / subjects.length)
    : 0;

  const todaySubjects = subjects.filter(s => s.reviewCards > 0 || s.newCards > 0);

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
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="rounded-2xl">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${retentionColor(globalRetention).text}`}>
                    {globalRetention}%
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Retenção Geral</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-2xl font-bold text-primary">{data?.totalPendingReviews ?? 0}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Revisões</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-2xl font-bold text-primary">{data?.totalNewCards ?? 0}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Novos</p>
                </CardContent>
              </Card>
            </div>

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
                        { icon: Type, label: 'Básico', count: ct.basic, color: 'text-blue-500' },
                        { icon: Braces, label: 'Cloze', count: ct.cloze, color: 'text-violet-500' },
                        { icon: ListChecks, label: 'Múlt. Escolha', count: ct.multiple_choice, color: 'text-amber-500' },
                        { icon: EyeOff, label: 'Oclusão', count: ct.image_occlusion, color: 'text-emerald-500' },
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
