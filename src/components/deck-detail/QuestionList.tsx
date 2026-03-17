/**
 * QuestionList — renders the list of question cards.
 * Extracted per Lei 2B from DeckQuestionsTab.tsx (copy-paste integral).
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PenLine, Brain, Trash2, Eye, MoreVertical } from 'lucide-react';
import { shortDisplayId } from '@/lib/shortId';
import type { DeckQuestion, QuestionStatsData } from '@/components/deck-detail/question-types';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

interface QuestionListProps {
  questions: DeckQuestion[];
  statsData: QuestionStatsData;
  selectionMode: boolean;
  selectedQuestions: Set<string>;
  isReadOnly: boolean;
  onToggleSelection: (id: string) => void;
  onPreview: (q: DeckQuestion) => void;
  onEdit: (q: DeckQuestion) => void;
  onDelete: (id: string) => void;
  onCommunityWarning: () => void;
  isCommunityQuestion: (q: DeckQuestion) => boolean;
  isLoading: boolean;
  hasActiveFilter: boolean;
  searchQuery: string;
}

const QuestionList = React.memo(({
  questions, statsData, selectionMode, selectedQuestions, isReadOnly,
  onToggleSelection, onPreview, onEdit, onDelete, onCommunityWarning,
  isCommunityQuestion, isLoading, hasActiveFilter, searchQuery,
}: QuestionListProps) => {
  if (isLoading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Carregando questões...</div>;
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <h3 className="font-display text-lg font-semibold text-foreground">
          {hasActiveFilter || searchQuery ? 'Nenhuma questão encontrada' : 'Nenhuma questão ainda'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasActiveFilter || searchQuery ? 'Tente ajustar os filtros ou busca.' : 'Adicione questões para praticar.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {questions.map((q, idx) => {
        const opts: string[] = q.options ?? [];
        const cIdx = q.correct_indices?.[0] ?? 0;
        const plainText = (q.question_text ?? '').replace(/<[^>]+>/g, '').trim();
        const isError = statsData.errorQuestionIds.has(q.id);
        const isAnswered = statsData.answeredQuestionIds.has(q.id);
        const isCorrectlyAnswered = isAnswered && !isError;
        const isSelected = selectedQuestions.has(q.id);
        const isCommunity = isCommunityQuestion(q);
        const conceptCount = q.concepts?.length ?? 0;

        const borderClass = isError
          ? 'border-destructive/40'
          : isCorrectlyAnswered
          ? 'border-emerald-500/40'
          : 'border-border/60';

        return (
          <div
            key={q.id}
            className={`group rounded-xl border bg-card p-4 transition-colors cursor-pointer ${
              isSelected ? 'border-primary/50 bg-primary/5' : `${borderClass} hover:border-border hover:shadow-sm`
            }`}
            onClick={() => {
              if (selectionMode) {
                if (isCommunity) {
                  onCommunityWarning();
                  return;
                }
                onToggleSelection(q.id);
                return;
              }
              onPreview(q);
            }}
          >
            <div className="flex items-start gap-3">
              {selectionMode && (
                <div
                  className="pt-0.5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCommunity) { onCommunityWarning(); return; }
                    onToggleSelection(q.id);
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    className={isCommunity ? 'opacity-40 cursor-not-allowed' : ''}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {/* Concept count badge */}
                {conceptCount > 0 && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Brain className="h-2.5 w-2.5" /> {conceptCount} conceito{conceptCount > 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Question text */}
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                  <span className="text-[10px] font-mono text-muted-foreground/60 mr-1.5">{shortDisplayId(q.id)}</span>
                  {idx + 1}. {plainText || '(Sem enunciado)'}
                </p>

                {/* Options preview - MC style */}
                {opts.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {opts.slice(0, 5).map((opt, oi) => (
                      <p key={oi} className={`text-xs leading-snug ${
                        oi === cIdx ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'
                      }`}>
                        {oi === cIdx ? '✓ ' : '  '}{LETTERS[oi]}. {opt.length > 60 ? opt.slice(0, 60) + '…' : opt}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Right side: 3-dot menu only */}
              {!selectionMode && (
                <div className="flex items-center shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e: any) => e.stopPropagation()}>
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                      <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); onPreview(q); }}>
                        <Eye className="mr-2 h-4 w-4" /> Ver
                      </DropdownMenuItem>
                      {!isReadOnly && !isCommunity && (
                        <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); onEdit(q); }}>
                          <PenLine className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                      )}
                      {!isReadOnly && !isCommunity && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e: any) => { e.stopPropagation(); onDelete(q.id); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

QuestionList.displayName = 'QuestionList';

export default QuestionList;
