import { useState, useEffect, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { fsrsPreviewIntervals, type FSRSCard, type Rating, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { sm2PreviewIntervals, type SM2Card, type SM2Params, DEFAULT_SM2_PARAMS } from '@/lib/sm2';
import { parseStepToMinutes } from '@/lib/studyUtils';
import { calculateCardRecall } from '@/components/RetentionGauge';
import { Lightbulb, Sparkles, CheckCircle2, XCircle, Gauge, RotateCcw, BookOpen, Keyboard, Undo2, Check, Loader2, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import TutorLoadingAnimation from '@/components/TutorLoadingAnimation';
import TtsButton, { extractExplanationSection } from '@/components/TtsButton';
import PersonalNotes from '@/components/PersonalNotes';
import ReactMarkdown from 'react-markdown';

/** Build SM2/FSRS params from deck config so preview intervals match actual scheduling */
function buildPreviewParams(deckConfig: any, algorithmMode: string): { sm2?: SM2Params; fsrs?: FSRSParams } {
  if (!deckConfig) return {};
  const learningStepsRaw: string[] = deckConfig.learning_steps || ['1m', '10m'];
  const learningStepsMinutes = learningStepsRaw.map(parseStepToMinutes);
  const maxIntervalDays = deckConfig.max_interval ?? 36500;

  if (algorithmMode === 'fsrs') {
    const requestedRetention = deckConfig.requested_retention ?? 0.85;
    return {
      fsrs: {
        ...DEFAULT_FSRS_PARAMS,
        requestedRetention,
        maximumInterval: maxIntervalDays,
        learningSteps: learningStepsMinutes,
        relearningSteps: [learningStepsMinutes[0] ?? 10],
      },
    };
  }

  return {
    sm2: {
      learningSteps: learningStepsMinutes,
      easyBonus: (deckConfig.easy_bonus ?? 130) / 100,
      intervalModifier: (deckConfig.interval_modifier ?? 100) / 100,
      maxInterval: maxIntervalDays,
    },
  };
}

/** Convert basic markdown (**bold**, *italic*, \n) to HTML */
function formatMarkdown(text: string): string {
  // Escape HTML first to prevent XSS, then apply markdown
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\n/g, '<br />');
}

/** Check if content contains cloze syntax regardless of card_type */
function hasClozeMarkers(text: string): boolean {
  return /\{\{c\d+::.+?\}\}/.test(text);
}

/** Check if content looks like it contains HTML tags (from rich editor) */
function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

interface FlashCardProps {
  frontContent: string;
  backContent: string;
  cardId?: string;
  stability: number;
  difficulty: number;
  state: number;
  scheduledDate: string;
  lastReviewedAt?: string;
  cardType?: string;
  learningStep?: number;
  onRate: (rating: Rating) => void;
  isSubmitting: boolean;
  quickReview?: boolean;
  algorithmMode?: string;
  deckConfig?: any;
  energy?: number;
  tutorCost?: number;
  onTutorRequest?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
  isTutorLoading?: boolean;
  hintResponse?: string | null;
  explainResponse?: string | null;
  mcExplainResponse?: string | null;
  actions?: React.ReactNode;
  canUndo?: boolean;
  onUndo?: () => void;
  /** Opens the chat modal with the explain streaming */
  onOpenExplainChat?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
}

interface MultipleChoiceData {
  options: string[];
  correctIndex: number;
}

// ... keep existing code (ratingConfig, renderCloze, renderOcclusion, ConfettiEffect)

const ratingConfig = [
  { rating: 1 as Rating, label: 'Errei', colorClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground', flashClass: 'animate-wrong-flash' },
  { rating: 2 as Rating, label: 'Difícil', colorClass: 'bg-warning hover:bg-warning/90 text-warning-foreground', flashClass: '' },
  { rating: 3 as Rating, label: 'Bom', colorClass: 'bg-success hover:bg-success/90 text-success-foreground', flashClass: 'animate-correct-flash' },
  { rating: 4 as Rating, label: 'Fácil', colorClass: 'bg-info hover:bg-info/90 text-info-foreground', flashClass: 'animate-correct-flash' },
];

function renderCloze(html: string, revealed: boolean, targetNum?: number): string {
  return html.replace(/\{\{c(\d+)::(.+?)\}\}/g, (_, num, answer) => {
    const n = parseInt(num);
    // Non-target clozes always show as plain text (they belong to a different card)
    if (targetNum !== undefined && n !== targetNum) {
      return answer;
    }
    if (revealed) {
      return `<span class="cloze-revealed">${answer}</span>`;
    }
    return `<span class="cloze-blank">[...]</span>`;
  });
}

function renderOcclusion(frontContent: string, revealed: boolean, fallbackCanvas?: { w: number; h: number }): string {
  try {
    const data = JSON.parse(frontContent);
    const { imageUrl } = data;
    if (!imageUrl) return '<p>Erro ao carregar</p>';
    const allRects: any[] = data.allRects || data.rects || [];
    const activeRectIds: string[] = data.activeRectIds || allRects.map((r: any) => r.id);
    if (allRects.length === 0) return `<img src="${imageUrl}" style="max-width:100%;border-radius:0.5rem" />`;

    const svgShapes = allRects.map((r: any) => {
      const isActive = activeRectIds.includes(r.id);
      if (!isActive) return '';
      const shapeType = r.type || 'rect';
      const textW = r.w || Math.max(48, ((r.text ?? '').toString().length * 9) + 16);
      const textH = r.h || 30;
      const safeText = (r.text ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (revealed) {
        const fill = 'rgba(59,130,246,0.25)';
        const stroke = 'rgba(59,130,246,0.5)';
        if (shapeType === 'text') return `<g><rect x="${r.x}" y="${r.y}" width="${textW}" height="${textH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${r.x + textW / 2}" y="${r.y + textH / 2}" fill="white" font-size="16" font-weight="700" text-anchor="middle" dominant-baseline="middle">${safeText || '?'}</text></g>`;
        if (shapeType === 'ellipse') return `<ellipse cx="${r.x + r.w/2}" cy="${r.y + r.h/2}" rx="${Math.abs(r.w/2)}" ry="${Math.abs(r.h/2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        if (shapeType === 'polygon' && r.points) { const pts = (r.points as {x:number,y:number}[]).map((p: any) => `${p.x},${p.y}`).join(' '); return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`; }
        return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${stroke}" stroke-width="2" rx="4"/>`;
      }
      const fill = 'rgb(59,130,246)';
      const stroke = 'rgb(49,120,236)';
      if (shapeType === 'text') return `<g><rect x="${r.x}" y="${r.y}" width="${textW}" height="${textH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/></g>`;
      if (shapeType === 'ellipse') return `<ellipse cx="${r.x + r.w/2}" cy="${r.y + r.h/2}" rx="${Math.abs(r.w/2)}" ry="${Math.abs(r.h/2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      if (shapeType === 'polygon' && r.points) { const pts = (r.points as {x:number,y:number}[]).map((p: any) => `${p.x},${p.y}`).join(' '); return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`; }
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${stroke}" stroke-width="2" rx="4"/>`;
    }).join('');

    const vbW = data.canvasWidth || fallbackCanvas?.w || (() => {
      const xs = allRects.flatMap((r: any) => r.points ? r.points.map((p: any) => p.x) : [r.x, r.x + r.w]);
      return Math.max(...xs, 100) * 1.02;
    })();
    const vbH = data.canvasHeight || fallbackCanvas?.h || (() => {
      const ys = allRects.flatMap((r: any) => r.points ? r.points.map((p: any) => p.y) : [r.y, r.y + r.h]);
      return Math.max(...ys, 100) * 1.02;
    })();

    return `<div style="position:relative;display:inline-block;max-width:100%">
      <img src="${imageUrl}" style="max-width:100%;border-radius:0.5rem;display:block" crossorigin="anonymous" />
      <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMinYMin meet">
        ${svgShapes}
      </svg>
    </div>`;
  } catch {
    return '<p>Erro ao carregar oclusão</p>';
  }
}

// ConfettiEffect removed — only card border flash animations remain

function parseMultipleChoice(backContent: string): MultipleChoiceData | null {
  try {
    const data = JSON.parse(backContent);
    if (Array.isArray(data.options) && typeof data.correctIndex === 'number') {
      return data;
    }
  } catch {}
  return null;
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
  learningStep = 0,
  canUndo,
  onUndo,
  onOpenExplainChat,
}: {
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
  learningStep?: number;
  canUndo?: boolean;
  onUndo?: () => void;
  onOpenExplainChat?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | 'hard' | null>(null);
  const [loadingAction, setLoadingAction] = useState<'explain' | 'explain-mc' | 'hint' | null>(null);
  const [recallExpanded, setRecallExpanded] = useState(false);
  const mcData = parseMultipleChoice(backContent);
  const canUseTutor = energy >= (2);

  const previewParams = buildPreviewParams(deckConfig, algorithmMode || 'fsrs');
  const intervals = (() => {
    if (algorithmMode === 'fsrs') {
      const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate, learning_step: learningStep ?? 0 };
      return fsrsPreviewIntervals(fsrsCard, previewParams.fsrs);
    }
    const sm2Card: SM2Card = { stability, difficulty, state, scheduled_date: scheduledDate };
    return sm2PreviewIntervals(sm2Card, previewParams.sm2);
  })();

  useEffect(() => {
    if (feedbackType) {
      const timer = setTimeout(() => setFeedbackType(null), 800);
      return () => clearTimeout(timer);
    }
  }, [feedbackType]);

  // Clear loading action when loading finishes
  useEffect(() => {
    if (!isTutorLoading) setLoadingAction(null);
  }, [isTutorLoading]);

  if (!mcData) return <p className="text-destructive text-sm">Erro ao carregar opções</p>;

  const handleSelect = (idx: number) => {
    if (answered) return;
    setSelectedIndex(idx);
    setAnswered(true);
    // No card-level shadow animation on select — only on rating
  };

  const handleRate = (rating: Rating) => {
    // Set flash for the rating action (overrides confirm flash)
    setFeedbackType(rating >= 3 ? 'correct' : rating === 2 ? 'hard' : 'wrong');
    onRate(rating);
    // Reset state after a brief delay so flash is visible before card transitions
    setTimeout(() => {
      setSelectedIndex(null);
      setAnswered(false);
      setFeedbackType(null);
    }, 700);
  };

  const recallColor = recallData
    ? recallData.percent >= 80 ? 'text-emerald-600 dark:text-emerald-400' : recallData.percent >= 60 ? 'text-primary' : recallData.percent >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400'
    : 'text-muted-foreground';

  const recallBgColor = recallData
    ? recallData.state === 'new' ? 'bg-muted/80' : recallData.state === 'learning' ? 'bg-emerald-500/10' : 'bg-primary/10'
    : '';

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] w-full max-w-lg mx-auto px-1 relative">
      {/* Card border flash only — no confetti */}

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
          {/* Question card — receives feedback animation */}
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

const FlashCard = ({
  frontContent, backContent, cardId, stability, difficulty, state, scheduledDate, lastReviewedAt, cardType, learningStep = 0,
  onRate, isSubmitting, quickReview, algorithmMode = 'fsrs', deckConfig,
  energy = 0, tutorCost = 2, onTutorRequest, isTutorLoading, hintResponse, explainResponse, mcExplainResponse, actions,
  canUndo, onUndo, onOpenExplainChat,
}: FlashCardProps) => {
  const [flipped, setFlipped] = useState(false);
  const [peekingFront, setPeekingFront] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | 'hard' | null>(null);
  const [typingAnswer, setTypingAnswer] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [recallExpanded, setRecallExpanded] = useState(false);

  // Auto-detect card type: if content has cloze markers, treat as cloze regardless of cardType
  const effectiveCardType = useMemo(() => {
    if (cardType === 'image_occlusion') return 'image_occlusion';
    if (cardType === 'multiple_choice') return 'multiple_choice';
    if (cardType === 'cloze' || hasClozeMarkers(frontContent)) return 'cloze';
    return 'basic';
  }, [cardType, frontContent]);

  const isCloze = effectiveCardType === 'cloze';
  const isOcclusion = effectiveCardType === 'image_occlusion';
  const isMultipleChoice = effectiveCardType === 'multiple_choice';
  const canUseTutor = energy >= tutorCost;

  const recallData = useMemo(() => {
    if (algorithmMode === 'quick_review') return null;
    return calculateCardRecall({ state, stability, difficulty, scheduled_date: scheduledDate, last_reviewed_at: lastReviewedAt }, algorithmMode);
  }, [state, stability, difficulty, scheduledDate, lastReviewedAt, algorithmMode]);

  const [occlusionFallbackCanvas, setOcclusionFallbackCanvas] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!isOcclusion) {
      setOcclusionFallbackCanvas(null);
      return;
    }

    try {
      const data = JSON.parse(frontContent);
      if (data.canvasWidth && data.canvasHeight) {
        setOcclusionFallbackCanvas(null);
        return;
      }
      if (!data.imageUrl) {
        setOcclusionFallbackCanvas(null);
        return;
      }

      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.min(1, 450 / img.naturalHeight);
        setOcclusionFallbackCanvas({
          w: Math.round(img.naturalWidth * scale),
          h: Math.round(img.naturalHeight * scale),
        });
      };
      img.onerror = () => setOcclusionFallbackCanvas(null);
      img.src = data.imageUrl;
    } catch {
      setOcclusionFallbackCanvas(null);
    }
  }, [isOcclusion, frontContent]);

  useEffect(() => {
    if (feedbackType) {
      const timer = setTimeout(() => setFeedbackType(null), 800);
      return () => clearTimeout(timer);
    }
  }, [feedbackType]);

  // Multiple choice has its own dedicated component
  if (isMultipleChoice) {
    return (
      <MultipleChoiceCard
        frontContent={looksLikeHtml(frontContent) ? frontContent : formatMarkdown(frontContent)}
        backContent={backContent}
        cardId={cardId}
        onRate={onRate}
        isSubmitting={isSubmitting}
        energy={energy}
        onTutorRequest={onTutorRequest}
        isTutorLoading={isTutorLoading}
        hintResponse={hintResponse}
        explainResponse={explainResponse}
        mcExplainResponse={mcExplainResponse}
        recallData={recallData}
        algorithmMode={algorithmMode}
        deckConfig={deckConfig}
        actions={actions}
        stability={stability}
        difficulty={difficulty}
        state={state}
        scheduledDate={scheduledDate}
        canUndo={canUndo}
        onUndo={onUndo}
        onOpenExplainChat={onOpenExplainChat}
        learningStep={learningStep}
      />
    );
  }

  const handleRate = (rating: Rating) => {
    setFeedbackType(rating >= 3 ? 'correct' : rating === 2 ? 'hard' : 'wrong');
    onRate(rating);
  };

  const previewParams = buildPreviewParams(deckConfig, algorithmMode);
  const intervals = (() => {
    if (algorithmMode === 'fsrs') {
      const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate, learning_step: learningStep };
      return fsrsPreviewIntervals(fsrsCard, previewParams.fsrs);
    }
    const sm2Card: SM2Card = { stability, difficulty, state, scheduled_date: scheduledDate };
    return sm2PreviewIntervals(sm2Card, previewParams.sm2);
  })();

  let displayFront: string;
  let displayBack: string;
  let occlusionFrontText = '';
  let occlusionBackText = '';

  if (isOcclusion) {
    displayFront = renderOcclusion(frontContent, false, occlusionFallbackCanvas ?? undefined);
    displayBack = renderOcclusion(frontContent, true, occlusionFallbackCanvas ?? undefined);

    try {
      const occData = JSON.parse(frontContent);
      const strippedFront = typeof occData.frontText === 'string' ? occData.frontText.replace(/<[^>]*>/g, '').trim() : '';
      if (strippedFront) {
        occlusionFrontText = sanitizeHtml(occData.frontText);
      }
    } catch {}

    const backStripped = backContent ? backContent.replace(/<[^>]*>/g, '').trim() : '';
    if (backStripped) {
      occlusionBackText = sanitizeHtml(backContent);
    }
  } else if (isCloze) {
    // Parse cloze target number from backContent (JSON with clozeTarget)
    let clozeTarget: number | undefined;
    let extraBack = '';
    if (backContent && backContent.trim()) {
      try {
        const parsed = JSON.parse(backContent);
        if (typeof parsed.clozeTarget === 'number') {
          clozeTarget = parsed.clozeTarget;
          extraBack = parsed.extra || '';
        } else {
          extraBack = backContent;
        }
      } catch {
        extraBack = backContent;
      }
    }
    const processedFront = looksLikeHtml(frontContent) ? frontContent : formatMarkdown(frontContent);
    displayFront = renderCloze(processedFront, false, clozeTarget);
    const revealedCloze = renderCloze(processedFront, true, clozeTarget);
    if (extraBack && extraBack.trim()) {
      const processedBack = looksLikeHtml(extraBack) ? extraBack : formatMarkdown(extraBack);
      displayBack = revealedCloze + '<hr style="margin:1rem 0;border-color:hsl(var(--border))" />' + processedBack;
    } else {
      displayBack = revealedCloze;
    }
  } else {
    // Basic cards: format content properly
    displayFront = looksLikeHtml(frontContent) ? frontContent : formatMarkdown(frontContent);
    displayBack = looksLikeHtml(backContent) ? backContent : formatMarkdown(backContent);
  }

  const recallColor = recallData
    ? recallData.percent >= 80 ? 'text-emerald-600 dark:text-emerald-400' : recallData.percent >= 60 ? 'text-primary' : recallData.percent >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400'
    : 'text-muted-foreground';

  const recallBgColor = recallData
    ? recallData.state === 'new' ? 'bg-muted/80' : recallData.state === 'learning' ? 'bg-emerald-500/10' : 'bg-primary/10'
    : '';

  return (
    <div className="flex flex-col w-full max-w-lg mx-auto px-1 h-[calc(100dvh-7rem)] relative">
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
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4 -m-4">
        <div className="space-y-3 pb-2 pt-1 w-full">
          {/* Card container */}
          <div
            onClick={() => !flipped && setFlipped(true)}
            style={{ cursor: !flipped ? 'pointer' : 'default' }}
            className="w-full"
          >
            {/* Front face */}
            {!flipped && (
              <div
                className="card-premium w-full border border-border/40 bg-card p-6 sm:p-8 animate-fade-in"
                style={{ borderRadius: 'var(--radius)', minHeight: '200px', display: 'flex', alignItems: isOcclusion ? 'flex-start' : 'center', justifyContent: 'center' }}
              >
                {isOcclusion ? (
                  <div className="w-full space-y-4">
                    <div className="w-full flex justify-center" dangerouslySetInnerHTML={{ __html: displayFront }} />
                    {occlusionFrontText && (
                      <div className="prose prose-sm max-w-none text-left text-card-foreground" dangerouslySetInnerHTML={{ __html: occlusionFrontText }} />
                    )}
                  </div>
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-center text-card-foreground w-full"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayFront) }}
                  />
                )}
              </div>
            )}

            {/* Back face (or peeking front) */}
            {flipped && (
              <>
                {/* Typed answer comparison */}
                {answerSubmitted && typedAnswer.trim() && (
                  <div className="card-premium w-full border-2 border-primary/30 bg-primary/5 p-4 mb-3 animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5 block">Sua resposta</span>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{typedAnswer}</p>
                  </div>
                )}

                <div
                  className={`card-premium w-full border border-border/40 bg-card p-6 sm:p-8 ${peekingFront ? 'animate-flip-peek' : 'animate-fade-in'} ${feedbackType === 'correct' ? 'animate-correct-flash' : feedbackType === 'wrong' ? 'animate-wrong-flash' : feedbackType === 'hard' ? 'animate-hard-flash' : ''}`}
                  style={{ borderRadius: 'var(--radius)', minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: isOcclusion ? 'flex-start' : 'center', justifyContent: isOcclusion ? 'flex-start' : 'center', position: 'relative' }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPeekingFront(prev => !prev);
                    }}
                    className={`absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                      peekingFront
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
                    }`}
                    aria-label={peekingFront ? 'Ver verso do card' : 'Ver frente do card'}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  {isOcclusion ? (
                    <div className="w-full space-y-4">
                      <div className="w-full flex justify-center" dangerouslySetInnerHTML={{ __html: peekingFront ? displayFront : displayBack }} />
                      {occlusionFrontText && (
                        <div className="prose prose-sm max-w-none text-left text-card-foreground" dangerouslySetInnerHTML={{ __html: occlusionFrontText }} />
                      )}
                      {!peekingFront && occlusionBackText && (
                        <div className="prose prose-sm max-w-none text-left text-muted-foreground pt-3 border-t border-border/30" dangerouslySetInnerHTML={{ __html: occlusionBackText }} />
                      )}
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-center text-card-foreground w-full"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(peekingFront ? displayFront : displayBack) }}
                    />
                  )}
                  {peekingFront && (
                    <span className="mt-3 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Frente do card</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Tutor hint response - show before flip */}
          {hintResponse && !flipped && (
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

          {/* Tutor explain response - show after flip (only if no onOpenExplainChat, i.e. fallback) */}
          {explainResponse && flipped && !onOpenExplainChat && (
            <div className="card-premium w-full border border-primary/20 bg-primary/5 p-4 text-sm text-foreground animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-primary text-xs uppercase tracking-wider">Explicação IA</span>
                {explainResponse && <TtsButton text={extractExplanationSection(explainResponse)} isStreaming={isTutorLoading} />}
              </div>
              <div className="max-h-[40vh] overflow-y-auto scrollbar-hide">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" style={{ overflowWrap: 'anywhere' }}>
                  <ReactMarkdown>{explainResponse}</ReactMarkdown>
                  {isTutorLoading && <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle rounded-sm" />}
                </div>
              </div>
            </div>
          )}

          {/* Personal notes */}
          {cardId && flipped && (
            <PersonalNotes cardId={cardId} />
          )}
        </div>
      </div>

      {/* Fixed bottom buttons */}
      <div className="flex-shrink-0 pt-3 pb-2 space-y-2">
        {!flipped ? (
          <div>
            {typingAnswer ? (
              <div className="flex w-full gap-2 items-end">
                <input
                  autoFocus
                  type="text"
                  value={typedAnswer}
                  onChange={e => setTypedAnswer(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && typedAnswer.trim()) {
                      setAnswerSubmitted(true);
                      setFlipped(true);
                    } else if (e.key === 'Escape') {
                      setTypingAnswer(false);
                      setTypedAnswer('');
                    }
                  }}
                  placeholder="Digite a resposta"
                  className="flex-1 rounded-xl border-2 border-primary/40 bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  onClick={() => { setTypingAnswer(false); setTypedAnswer(''); }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95 shrink-0"
                  aria-label="Cancelar"
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    if (typedAnswer.trim()) {
                      setAnswerSubmitted(true);
                      setFlipped(true);
                    }
                  }}
                  disabled={!typedAnswer.trim()}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-all active:scale-95 shrink-0"
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex w-full items-center gap-2">
                {onTutorRequest && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={canUseTutor ? () => onTutorRequest() : undefined}
                        disabled={!canUseTutor || isTutorLoading}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:text-primary/80 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Tutor IA"
                      >
                        {isTutorLoading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Lightbulb className="h-4.5 w-4.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>Dica do Tutor IA</p></TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setTypingAnswer(true); setTypedAnswer(''); setAnswerSubmitted(false); }}
                      className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label="Digitar resposta"
                    >
                      <Keyboard className="h-4.5 w-4.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent><p>Digitar resposta</p></TooltipContent>
                </Tooltip>
                <button
                  onClick={() => setFlipped(true)}
                  className="card-premium flex-1 border border-border/40 bg-card px-6 py-3 font-display font-semibold text-card-foreground transition-all hover:shadow-md active:scale-[0.98]"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  Mostrar Resposta
                </button>
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
            )}
          </div>
        ) : (
          <>
            {quickReview ? (
              <div className="grid w-full grid-cols-2 gap-2.5">
                <button
                  onClick={() => handleRate(1)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center gap-1 px-2 py-3.5 font-medium transition-all active:scale-95 disabled:opacity-50 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <span className="text-sm font-bold">Errei</span>
                </button>
                <button
                  onClick={() => handleRate(3)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center gap-1 px-2 py-3.5 font-medium transition-all active:scale-95 disabled:opacity-50 bg-primary hover:bg-primary/90 text-primary-foreground"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <span className="text-sm font-bold flex items-center gap-1">
                    Acertei <Sparkles className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>
            ) : (
              <>
                {/* Explain button for basic/cloze/occlusion — opens chat modal */}
                {onOpenExplainChat && (
                  <button
                    onClick={() => canUseTutor ? onOpenExplainChat({ action: 'explain' }) : undefined}
                    disabled={!canUseTutor || isTutorLoading}
                    className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                      canUseTutor
                        ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                        : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    }`}
                  >
                    {isTutorLoading ? <TutorLoadingAnimation /> : <><BookOpen className="h-3.5 w-3.5" /> Explicar conteúdo</>}
                  </button>
                )}

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
          </>
        )}
      </div>
    </div>
  );
};

export default FlashCard;
