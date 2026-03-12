/**
 * ConceptList — mastery dashboard list derived from question performance.
 * No CRUD, no FSRS. Shows mastery level, accuracy, and question count.
 */
import { useState, useMemo } from 'react';
import { BrainCircuit, CheckCircle2, AlertCircle, X as XIcon, Search, BookOpen, Sparkles, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ConceptMasteryItem } from '@/hooks/useConceptMastery';

interface ConceptListProps {
  concepts: ConceptMasteryItem[];
  onPracticeConcept: (concept: string) => void;
  onGenerateQuestions: (concept: string) => void;
}

type FilterType = 'all' | 'weak' | 'learning' | 'strong';

const masteryConfig = {
  strong: { label: 'Forte', icon: CheckCircle2, color: 'text-emerald-500', badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  learning: { label: 'Parcial', icon: AlertCircle, color: 'text-amber-500', badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  weak: { label: 'Fraco', icon: XIcon, color: 'text-destructive', badgeBg: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const ConceptList = ({ concepts, onPracticeConcept, onGenerateQuestions }: ConceptListProps) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = concepts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.concept.toLowerCase().includes(q));
    }
    if (filter !== 'all') result = result.filter(c => c.masteryLevel === filter);
    return result;
  }, [concepts, search, filter]);

  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <BrainCircuit className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <h3 className="font-display text-base font-semibold text-foreground">Nenhum conceito</h3>
        <p className="mt-1 text-sm text-muted-foreground">Responda questões para que os conceitos apareçam aqui.</p>
      </div>
    );
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'weak', label: 'Fracos' },
    { key: 'learning', label: 'Parciais' },
    { key: 'strong', label: 'Fortes' },
  ];

  return (
    <div className="space-y-3">
      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar conceito..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Concept items */}
      {filtered.map(item => {
        const config = masteryConfig[item.masteryLevel];
        const Icon = config.icon;
        const isExpanded = expandedId === item.concept;

        return (
          <div key={item.concept} className="rounded-xl border border-border bg-card overflow-hidden">
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : item.concept)}
            >
              <Icon className={`h-5 w-5 shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.concept}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <HelpCircle className="h-3 w-3" /> {item.questionCount} questões
                  </span>
                  {item.totalAttempts > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      · {item.correctCount}/{item.totalAttempts} corretas ({item.accuracy}%)
                    </span>
                  )}
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 border ${config.badgeBg}`}>
                    {config.label}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-border/50 px-3 pb-3 pt-2 space-y-2">
                {/* Accuracy bar */}
                {item.totalAttempts > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Taxa de acerto</span>
                      <span className="font-medium text-foreground">{item.accuracy}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.accuracy >= 70 ? 'bg-emerald-500' :
                          item.accuracy >= 40 ? 'bg-amber-500' :
                          'bg-destructive'
                        }`}
                        style={{ width: `${item.accuracy}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onPracticeConcept(item.concept); }}
                    disabled={item.questionCount === 0}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Praticar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onGenerateQuestions(item.concept); }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Gerar questões
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ConceptList;
