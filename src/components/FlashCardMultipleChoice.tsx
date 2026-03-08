/**
 * MultipleChoiceCard — Extracted from FlashCard.tsx.
 * Renders a multiple-choice flashcard with options, tutor hints, and rating buttons.
 */

import { useState, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { getPreviewIntervals, getRecallColor, getRecallBgColor } from '@/lib/flashCardUtils';
import type { Rating } from '@/lib/fsrs';
import { Lightbulb, Sparkles, Gauge, BookOpen, Loader2, Undo2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import TutorLoadingAnimation from '@/components/TutorLoadingAnimation';
import TtsButton from '@/components/TtsButton';
import PersonalNotes from '@/components/PersonalNotes';
import ReactMarkdown from 'react-markdown';

export interface MultipleChoiceData {
  options: string[];
  correctIndex: number;
}

export function parseMultipleChoice(backContent: string): MultipleChoiceData | null {
  try {
    const data = JSON.parse(backContent);
    if (Array.isArray(data.options) && typeof data.correctIndex === 'number') {
      return data;
    }
  } catch {}
  return null;
}

const ratingConfig = [
  { rating: 1 as Rating, label: 'Errei', colorClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground', flashClass: 'animate-wrong-flash' },
  { rating: 2 as Rating, label: 'Difícil', colorClass: 'bg-warning hover:bg-warning/90 text-warning-foreground', flashClass: '' },
  { rating: 3 as Rating, label: 'Bom', colorClass: 'bg-success hover:bg-success/90 text-success-foreground', flashClass: 'animate-correct-flash' },
  { rating: 4 as Rating, label: 'Fácil', colorClass: 'bg-info hover:bg-info/90 text-info-foreground', flashClass: 'animate-correct-flash' },
];

interface MultipleChoiceCardProps {
  cardId?: string;
  frontContent: string;
  backContent: string;
  onRate: (rating: Rating) => void;
  isSubmitting: boolean;
  energy?: number;
  onTutorRequest?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
  isTutorLoading?: boolean;
  hintResponse?: string | null;
  explainResponse?: string | null;
  mcExplainResponse?: string | null;
  recallData?: { percent: number; label: string; state: 'new' | 'learning' | 'review' } | null;
  algorithmMode?: string;
  deckConfig?: any;
  actions?: React.ReactNode;
  stability: number;
  difficulty: number;
  state: number;
  scheduledDate: string;
  lastReviewedAt?: string;
  learningStep?: number;
  canUndo?: boolean;
  onUndo?: () => void;
  onOpenExplainChat?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
}

const MultipleChoiceCard = ({
  frontContent,
  backContent,
  cardId,
  onRate,
  isSubmitting,
  energy = 0,
  onTutorRequest,
  isTutorLoading,
  hintResponse,
  explainResponse,
  mcExplainResponse,
  recallData,
  algorithmMode,
  deckConfig,
  actions,
  stability,
  difficulty,
  state,
  scheduledDate,
  lastReviewedAt,
  learningStep = 0,
  canUndo,
  onUndo,
  onOpenExplainChat,
}: MultipleChoiceCardProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | 'hard' | null>(null);
  const [loadingAction, setLoadingAction] = useState<'explain' | 'explain-mc' | 'hint' | null>(null);
  const [recallExpanded, setRecallExpanded] = useState(false);
  const mcData = parseMultipleChoice(backContent);
  const canUseTutor = energy >= (2);

  const intervals = getPreviewIntervals(algorithmMode || 'fsrs', deckConfig, { stability, difficulty, state, scheduledDate, learningStep: learningStep ?? 0, lastReviewedAt });

  useEffect(() => {
    if (feedbackType) {
      const timer = setTimeout(() => setFeedbackType(null), 800);
      return () => clearTimeout(timer);
    }
  }, [feedbackType]);

  useEffect(() => {
    if (!isTutorLoading) setLoadingAction(null);
  }, [isTutorLoading]);

  if (!mcData) return <p className="text-destructive text-sm">Erro ao carregar opções</p>;

  const handleSelect = (idx: number) => {
    if (answered) return;
    setSelectedIndex(idx);
    setAnswered(true);
  };

  const handleRate = (rating: Rating) => {
    setFeedbackType(rating >= 3 ? 'correct' : rating === 2 ? 'hard' : 'wrong');
    onRate(rating);
    setTimeout(() => {
      setSelectedIndex(null);
      setAnswered(false);
      setFeedbackType(null);
    }, 700);
  };

  const recallColor = getRecallColor(recallData);
  const recallBgColor = getRecallBgColor(recallData);

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] w-full max-w-lg mx-auto px-1 relative">
      {/* Top bar: recall + actions */}
      <div className="flex items-center justify-center gap-2 flex-shrink-0 pb-3">
        {recallData && (
          <button
            onClick={() => setRecallExpanded(prev => !prev)}
            className={`flex items-center gap-1.5 rounded-xl ${recallBgColor} px-2.5 py-1 transition-all active:scale-95`}
          >
            <Gauge className={`h-3 w-3 ${recallColor}`} />
            <span className={`text-[11px] font-bold ${recallColor}`}>
              {recallExpanded
                ? (recallData.state === 'new' ? 'Card novo' : `${recallData.percent}% de chance de acerto`)
                : (recallData.state === 'new' ? 'Novo' : `${recallData.percent}%`)}
            </span>
            {!recallExpanded && (
              <>
                <span className="text-[10px] text-muted-foreground">•</span>
                <span className="text-[10px] text-muted-foreground font-medium">{recallData.label}</span>
              </>
            )}
          </button>
        )}
        {actions}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 -mx-4">
        <div className="space-y-3 pb-4 pt-1">
          {/* Question card */}
          <div
            className={`card-premium w-full border border-border/40 bg-card p-4 sm:p-6 ${
              feedbackType === 'correct' ? 'animate-correct-flash' :
              feedbackType === 'wrong' ? 'animate-wrong-flash' :
              feedbackType === 'hard' ? 'animate-hard-flash' :
              ''
            }`}
            style={{ borderRadius: 'var(--radius)' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5 block">Múltipla escolha</span>
            <div
              className="prose prose-sm max-w-none text-card-foreground"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(frontContent) }}
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            {mcData.options.map((option, idx) => {
              let optionClass = 'border-border bg-card hover:bg-accent/50 cursor-pointer';
              if (answered) {
                if (idx === mcData.correctIndex) {
                  optionClass = 'border-success bg-success/10';
                } else if (idx === selectedIndex && idx !== mcData.correctIndex) {
                  optionClass = 'border-destructive bg-destructive/10';
                } else {
                  optionClass = 'border-border bg-card opacity-50';
                }
              } else if (selectedIndex === idx) {
                optionClass = 'border-primary bg-primary/10 ring-2 ring-primary/20';
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={answered}
                  className={`w-full flex items-center gap-3 border-2 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-left transition-all ${optionClass}`}
                >
                  <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
                    answered && idx === mcData.correctIndex
                      ? 'border-success bg-success text-white'
                      : answered && idx === selectedIndex && idx !== mcData.correctIndex
                      ? 'border-destructive bg-destructive text-white'
                      : selectedIndex === idx
                      ? 'border-primary bg-primary text-white'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="text-sm font-medium text-card-foreground">{option}</span>
                </button>
              );
            })}
          </div>

          {/* Tutor hint (before answering) */}
          {hintResponse && !answered && (
            <div className="card-premium w-full border border-primary/20 bg-primary/5 p-4 text-sm text-foreground animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-primary text-xs uppercase tracking-wider">Tutor IA</span>
                {hintResponse && <TtsButton text={hintResponse} isStreaming={isTutorLoading} />}
              </div>
              <div className="max-h-[40vh] overflow-y-auto scrollbar-hide">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" style={{ overflowWrap: 'anywhere' }}>
                  <ReactMarkdown>{hintResponse}</ReactMarkdown>
                  {isTutorLoading && <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle rounded-sm" />}
                </div>
              </div>
            </div>
          )}

          {/* Personal notes */}
          {cardId && answered && (
            <PersonalNotes cardId={cardId} />
          )}
        </div>
      </div>

      {/* Fixed bottom buttons */}
      <div className="flex-shrink-0 pt-3 pb-2 space-y-2">
        {!answered ? (
          <div className="flex w-full items-center gap-2">
            {/* Tutor IA icon — left side */}
            {onTutorRequest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={canUseTutor ? () => { setLoadingAction('hint'); onTutorRequest(); } : undefined}
                    disabled={!canUseTutor || isTutorLoading}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:text-primary/80 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Dica do Tutor IA"
                  >
                    {loadingAction === 'hint' && isTutorLoading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Lightbulb className="h-4.5 w-4.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {canUseTutor ? <p>Dica do Tutor IA</p> : <p>Sem créditos</p>}
                </TooltipContent>
              </Tooltip>
            )}

            {!onTutorRequest && (
              <p className="text-center text-sm text-muted-foreground flex-1 py-3">Selecione uma alternativa</p>
            )}

            {onTutorRequest && <div className="flex-1" />}

            {/* Undo — right side */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Desfazer"
                >
                  <Undo2 className="h-4.5 w-4.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent><p>Desfazer última revisão</p></TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            {/* Explain subject button — opens chat */}
            {onOpenExplainChat && (
              <button
                onClick={() => { if (!canUseTutor) return; setLoadingAction('explain'); onOpenExplainChat({ action: 'explain' }); }}
                disabled={!canUseTutor || isTutorLoading}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                  canUseTutor
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                }`}
              >
                {loadingAction === 'explain' && isTutorLoading ? <TutorLoadingAnimation /> : <><BookOpen className="h-3.5 w-3.5" /> Explicar conteúdo</>}
              </button>
            )}

            {/* Explain alternatives button — opens chat */}
            {onOpenExplainChat && (
              <button
                onClick={() => { if (!canUseTutor) return; setLoadingAction('explain-mc'); onOpenExplainChat({
                  action: 'explain-mc',
                  mcOptions: mcData.options,
                  correctIndex: mcData.correctIndex,
                  selectedIndex: selectedIndex ?? undefined,
                }); }}
                disabled={!canUseTutor || isTutorLoading}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                  canUseTutor
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                }`}
              >
                {loadingAction === 'explain-mc' && isTutorLoading ? <TutorLoadingAnimation variant="mc-alternatives" /> : <><Sparkles className="h-3.5 w-3.5" /> Explicar alternativas</>}
              </button>
            )}

            {/* Rating buttons */}
            <div className="grid w-full grid-cols-4 gap-1.5">
              {ratingConfig.map(({ rating, label, colorClass }) => (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  disabled={isSubmitting}
                  className={`flex flex-col items-center gap-0.5 px-1 py-1.5 font-medium transition-all active:scale-95 disabled:opacity-50 ${colorClass}`}
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <span className="text-xs font-bold">{label}</span>
                  <span className="text-[10px] opacity-80">{intervals[rating]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MultipleChoiceCard;
