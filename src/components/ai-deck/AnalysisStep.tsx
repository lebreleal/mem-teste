/**
 * Coverage analysis step: shows coverage %, covered/missing topics, recommendation.
 */

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, Plus, CheckCircle2, AlertCircle, Lightbulb, ShieldCheck } from 'lucide-react';
import type { CoverageAnalysis } from './types';

interface AnalysisStepProps {
  analysis: CoverageAnalysis;
  onBack: () => void;
  onFillGaps: () => void;
}

function getCoverageColor(pct: number) {
  if (pct >= 80) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-destructive';
}

function getCoverageBg(pct: number) {
  if (pct >= 80) return 'bg-success/10 border-success/30';
  if (pct >= 50) return 'bg-warning/10 border-warning/30';
  return 'bg-destructive/10 border-destructive/30';
}

function getCoverageLabel(pct: number) {
  if (pct >= 90) return 'Excelente! 🎉';
  if (pct >= 75) return 'Boa cobertura 👍';
  if (pct >= 50) return 'Cobertura parcial ⚠️';
  return 'Cobertura baixa 🔴';
}

const AnalysisStep = ({ analysis, onBack, onFillGaps }: AnalysisStepProps) => {
  const pct = analysis.coveragePercent;

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[60dvh] sm:max-h-[65vh]">
        <div className="space-y-4">

          {/* Coverage gauge */}
          <div className={`rounded-2xl border p-4 text-center space-y-3 ${getCoverageBg(pct)}`}>
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className={`h-5 w-5 ${getCoverageColor(pct)}`} />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Cobertura do Material
              </span>
            </div>
            <div className={`text-4xl font-black tabular-nums ${getCoverageColor(pct)}`}>
              {pct}%
            </div>
            <p className="text-sm font-semibold text-foreground">{getCoverageLabel(pct)}</p>
            <Progress value={pct} className="h-2.5" />
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">📋 Resumo</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Covered topics */}
          {analysis.coveredTopics && analysis.coveredTopics.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <p className="text-xs font-semibold text-foreground">
                  Tópicos cobertos ({analysis.coveredTopics.length})
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.coveredTopics.map((t, i) => (
                  <span key={i} className="text-[10px] bg-success/10 text-success border border-success/20 px-2 py-1 rounded-full font-medium">
                    ✓ {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing topics */}
          {analysis.missingTopics.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <p className="text-xs font-semibold text-foreground">
                  Tópicos que faltam ({analysis.missingTopics.length})
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.missingTopics.map((t, i) => (
                  <span key={i} className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-1 rounded-full font-medium">
                    ✗ {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          {analysis.recommendation && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold text-foreground">Recomendação</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{analysis.recommendation}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-border/50">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar
        </Button>
        {pct < 95 && analysis.missingTopics.length > 0 && (
          <Button onClick={onFillGaps} className="flex-1 gap-2">
            <Plus className="h-4 w-4" /> Gerar cartões para {analysis.missingTopics.length} tópico{analysis.missingTopics.length > 1 ? 's' : ''} faltante{analysis.missingTopics.length > 1 ? 's' : ''}
          </Button>
        )}
      </div>
    </div>
  );
};

export default AnalysisStep;
