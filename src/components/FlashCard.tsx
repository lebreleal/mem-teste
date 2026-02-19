import { useState, useEffect, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { fsrsPreviewIntervals, type FSRSCard, type Rating } from '@/lib/fsrs';
import { sm2PreviewIntervals, type SM2Card } from '@/lib/sm2';
import { calculateCardRecall } from '@/components/RetentionGauge';
import { Lightbulb, Sparkles, CheckCircle2, XCircle, Gauge, RotateCcw, BookOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import TutorLoadingAnimation from '@/components/TutorLoadingAnimation';

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
  stability: number;
  difficulty: number;
  state: number;
  scheduledDate: string;
  cardType?: string;
  onRate: (rating: Rating) => void;
  isSubmitting: boolean;
  quickReview?: boolean;
  algorithmMode?: string;
  energy?: number;
  onTutorRequest?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
  isTutorLoading?: boolean;
  tutorResponse?: string | null;
  actions?: React.ReactNode;
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

function renderOcclusion(frontContent: string, revealed: boolean): string {
  try {
    const data = JSON.parse(frontContent);
    const { imageUrl } = data;
    if (!imageUrl) return '<p>Erro ao carregar</p>';
    const allRects: any[] = data.allRects || data.rects || [];
    const activeRectIds: string[] = data.activeRectIds || allRects.map((r: any) => r.id);
    if (allRects.length === 0) return `<img src="${imageUrl}" style="max-width:100%;border-radius:0.5rem" />`;
    const allX = allRects.map((r: any) => r.x + r.w);
    const allY = allRects.map((r: any) => r.y + r.h);
    const maxX = Math.max(...allX, 100);
    const maxY = Math.max(...allY, 100);
    const svgShapes = allRects.map((r: any) => {
      const isActive = activeRectIds.includes(r.id);
      if (!isActive) return '';
      const shapeType = r.type || 'rect';
      if (revealed) {
        const fill = 'rgba(59,130,246,0.25)';
        const stroke = 'rgba(59,130,246,0.5)';
        if (shapeType === 'ellipse') return `<ellipse cx="${r.x + r.w/2}" cy="${r.y + r.h/2}" rx="${Math.abs(r.w/2)}" ry="${Math.abs(r.h/2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        if (shapeType === 'polygon' && r.points) { const pts = (r.points as {x:number,y:number}[]).map((p: any) => `${p.x},${p.y}`).join(' '); return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`; }
        return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${stroke}" stroke-width="2" rx="4"/>`;
      }
      const fill = 'rgb(59,130,246)';
      const stroke = 'rgb(49,120,236)';
      if (shapeType === 'ellipse') return `<ellipse cx="${r.x + r.w/2}" cy="${r.y + r.h/2}" rx="${Math.abs(r.w/2)}" ry="${Math.abs(r.h/2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      if (shapeType === 'polygon' && r.points) { const pts = (r.points as {x:number,y:number}[]).map((p: any) => `${p.x},${p.y}`).join(' '); return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`; }
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${stroke}" stroke-width="2" rx="4"/>`;
    }).join('');
    return `<div style="position:relative;display:inline-block;max-width:100%">
      <img src="${imageUrl}" style="max-width:100%;border-radius:0.5rem" crossorigin="anonymous" />
      <svg style="position:absolute;top:0;left:0;width:100%;height:100%" viewBox="0 0 ${maxX * 1.05} ${maxY * 1.05}" preserveAspectRatio="xMinYMin meet">
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
  onRate,
  isSubmitting,
  energy = 0,
  onTutorRequest,
  isTutorLoading,
  tutorResponse,
  recallData,
  algorithmMode,
  actions,
  stability,
  difficulty,
  state,
  scheduledDate,
}: {
  frontContent: string;
  backContent: string;
  onRate: (rating: Rating) => void;
  isSubmitting: boolean;
  energy?: number;
  onTutorRequest?: (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => void;
  isTutorLoading?: boolean;
  tutorResponse?: string | null;
  recallData?: { percent: number; label: string; state: 'new' | 'learning' | 'review' } | null;
  algorithmMode?: string;
  actions?: React.ReactNode;
  stability: number;
  difficulty: number;
  state: number;
  scheduledDate: string;
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | 'hard' | null>(null);
  const mcData = parseMultipleChoice(backContent);
  const canUseTutor = energy >= 2;

  const intervals = (() => {
    if (algorithmMode === 'fsrs') {
      const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate };
      return fsrsPreviewIntervals(fsrsCard);
    }
    const sm2Card: SM2Card = { stability, difficulty, state, scheduled_date: scheduledDate };
    return sm2PreviewIntervals(sm2Card);
  })();

  useEffect(() => {
    if (feedbackType) {
      const timer = setTimeout(() => setFeedbackType(null), 800);
      return () => clearTimeout(timer);
    }
  }, [feedbackType]);

  if (!mcData) return <p className="text-destructive text-sm">Erro ao carregar opções</p>;

  const handleSelect = (idx: number) => {
    if (answered) return;
    setSelectedIndex(idx);
    // Auto-confirm on select
    setAnswered(true);
    const isCorrect = idx === mcData.correctIndex;
    setFeedbackType(isCorrect ? 'correct' : 'wrong');
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
    }, 100);
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 rounded-xl ${recallBgColor} px-2.5 py-1 cursor-help transition-all`}>
                <Gauge className={`h-3 w-3 ${recallColor}`} />
                <span className={`text-[11px] font-bold ${recallColor}`}>
                  {recallData.state === 'new' ? 'Novo' : `${recallData.percent}%`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              <p className="text-xs font-bold mb-1">📊 Probabilidade de Acerto</p>
              <p className="text-[10px] text-muted-foreground">
                {recallData.state === 'new' ? 'Card novo, ainda não estudado.' :
                 recallData.state === 'learning' ? 'Em aprendizado inicial.' :
                 `Baseado no algoritmo ${algorithmMode === 'fsrs' ? 'FSRS' : 'SM-2'}.`}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {actions}
      </div>

      {/* Scrollable content area */}
      <div className={`flex-1 min-h-0 overflow-y-auto scrollbar-hide ${feedbackType === 'correct' ? 'animate-correct-flash' : feedbackType === 'wrong' ? 'animate-wrong-flash' : feedbackType === 'hard' ? 'animate-hard-flash' : ''}`}>
        <div className="space-y-3 pb-2">
          {/* Question */}
          <div
            className="card-premium w-full border border-border/40 bg-card p-4 sm:p-6"
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



          {/* Tutor response (before answering) */}
          {tutorResponse && !answered && (
            <div className="card-premium w-full border border-primary/20 bg-primary/5 p-4 text-sm text-foreground animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-primary text-xs uppercase tracking-wider">Tutor IA</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto scrollbar-hide">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none break-words" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatMarkdown(tutorResponse)) }} />
              </div>
            </div>
          )}

          {/* AI Explanation (after answering) */}
          {tutorResponse && answered && (
            <div className="card-premium w-full border border-primary/20 bg-primary/5 p-4 text-sm text-foreground animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-primary text-xs uppercase tracking-wider">Explicação IA</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto scrollbar-hide">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none break-words" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatMarkdown(tutorResponse)) }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom buttons */}
      <div className="flex-shrink-0 pt-3 pb-2 space-y-2">
        {!answered ? (
          <div className="flex w-full">
            {onTutorRequest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={canUseTutor ? () => onTutorRequest() : undefined}
                    disabled={!canUseTutor || isTutorLoading}
                    className={`card-premium flex-1 flex items-center justify-center gap-2 border px-4 py-3 font-display font-semibold text-sm transition-all active:scale-[0.98] ${
                      canUseTutor
                        ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                        : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    }`}
                    style={{ borderRadius: 'var(--radius)' }}
                  >
                    {isTutorLoading ? <TutorLoadingAnimation /> : <><Lightbulb className="h-4 w-4" /> Dica do Tutor</>}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {canUseTutor ? <p>Dica do Tutor (2 créditos)</p> : <p>Sem créditos</p>}
                </TooltipContent>
              </Tooltip>
            )}
            {!onTutorRequest && (
              <p className="text-center text-sm text-muted-foreground w-full py-3">Selecione uma alternativa</p>
            )}
          </div>
        ) : (
          <>
            {/* Explain button */}
            {onTutorRequest && !tutorResponse && (
              <button
                onClick={() => canUseTutor ? onTutorRequest({
                  action: 'explain-mc',
                  mcOptions: mcData.options,
                  correctIndex: mcData.correctIndex,
                  selectedIndex: selectedIndex ?? undefined,
                }) : undefined}
                disabled={!canUseTutor || isTutorLoading}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                  canUseTutor
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                }`}
              >
                {isTutorLoading ? <TutorLoadingAnimation /> : <><Sparkles className="h-3.5 w-3.5" /> Explicar alternativas (2 créditos)</>}
              </button>
            )}

            {/* Rating buttons */}
            <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2">
              {ratingConfig.map(({ rating, label, colorClass }) => (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  disabled={isSubmitting}
                  className={`flex flex-col items-center gap-0.5 px-2 py-2.5 sm:py-3 font-medium transition-all active:scale-95 disabled:opacity-50 ${colorClass}`}
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <span className="text-sm font-bold">{label}</span>
                  <span className="text-[11px] sm:text-xs opacity-80">{intervals[rating]}</span>
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
  frontContent, backContent, stability, difficulty, state, scheduledDate, cardType,
  onRate, isSubmitting, quickReview, algorithmMode = 'sm2',
  energy = 0, onTutorRequest, isTutorLoading, tutorResponse, actions,
}: FlashCardProps) => {
  const [flipped, setFlipped] = useState(false);
  const [peekingFront, setPeekingFront] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | 'hard' | null>(null);

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
  const canUseTutor = energy >= 2;

  const recallData = useMemo(() => {
    if (algorithmMode === 'quick_review') return null;
    return calculateCardRecall({ state, stability, difficulty, scheduled_date: scheduledDate }, algorithmMode);
  }, [state, stability, difficulty, scheduledDate, algorithmMode]);

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
        onRate={onRate}
        isSubmitting={isSubmitting}
        energy={energy}
        onTutorRequest={onTutorRequest}
        isTutorLoading={isTutorLoading}
        tutorResponse={tutorResponse}
        recallData={recallData}
        algorithmMode={algorithmMode}
        actions={actions}
        stability={stability}
        difficulty={difficulty}
        state={state}
        scheduledDate={scheduledDate}
      />
    );
  }

  const handleRate = (rating: Rating) => {
    setFeedbackType(rating >= 3 ? 'correct' : rating === 2 ? 'hard' : 'wrong');
    onRate(rating);
  };

  const intervals = (() => {
    if (algorithmMode === 'fsrs') {
      const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate };
      return fsrsPreviewIntervals(fsrsCard);
    }
    const sm2Card: SM2Card = { stability, difficulty, state, scheduled_date: scheduledDate };
    return sm2PreviewIntervals(sm2Card);
  })();

  let displayFront: string;
  let displayBack: string;

  if (isOcclusion) {
    displayFront = renderOcclusion(frontContent, false);
    const revealedImage = renderOcclusion(frontContent, true);
    const userText = backContent ? `<div style="margin-top:1rem">${backContent}</div>` : '';
    displayBack = revealedImage + userText;
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
      {/* Recall probability bar + actions */}
      <div className="flex items-center justify-center gap-2 w-full flex-shrink-0 pb-3">
        {recallData && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-2 rounded-xl ${recallBgColor} px-3 py-1.5 cursor-help transition-all`}>
                <Gauge className={`h-3.5 w-3.5 ${recallColor}`} />
                <span className={`text-xs font-bold ${recallColor}`}>
                  {recallData.state === 'new' ? 'Card novo' : `${recallData.percent}% de chance de acerto`}
                </span>
                <span className="text-[10px] text-muted-foreground">•</span>
                <span className="text-[10px] text-muted-foreground font-medium">{recallData.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px]">
              <p className="text-xs font-bold mb-1">📊 Probabilidade de Acerto</p>
              {recallData.state === 'new' ? (
                <p className="text-[10px] text-muted-foreground">Este card é novo e ainda não foi estudado.</p>
              ) : recallData.state === 'learning' ? (
                <p className="text-[10px] text-muted-foreground">Card em aprendizado inicial.</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">Baseado no algoritmo {algorithmMode === 'fsrs' ? 'FSRS' : 'SM-2'}.</p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {actions}
      </div>

      {/* Scrollable content area */}
      <div className={`flex-1 min-h-0 overflow-y-auto scrollbar-hide ${feedbackType === 'correct' ? 'animate-correct-flash' : feedbackType === 'wrong' ? 'animate-wrong-flash' : feedbackType === 'hard' ? 'animate-hard-flash' : ''}`}>
        <div className="space-y-3 pb-2">
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
                style={{ borderRadius: 'var(--radius)', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div
                  className="prose prose-sm max-w-none text-center text-card-foreground w-full"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayFront) }}
                />
              </div>
            )}

            {/* Back face (or peeking front) */}
            {flipped && (
              <div
                className={`card-premium w-full border border-border/40 bg-card p-6 sm:p-8 ${peekingFront ? 'animate-flip-peek' : 'animate-fade-in'}`}
                style={{ borderRadius: 'var(--radius)', minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
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
                <div
                  className="prose prose-sm max-w-none text-center text-card-foreground w-full"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(peekingFront ? displayFront : displayBack) }}
                />
                {peekingFront && (
                  <span className="mt-3 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Frente do card</span>
                )}
              </div>
            )}
          </div>

          {/* Tutor hint response - show before flip */}
          {tutorResponse && !flipped && (
            <div className="card-premium w-full border border-primary/20 bg-primary/5 p-4 text-sm text-foreground animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-primary text-xs uppercase tracking-wider">Tutor IA</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto scrollbar-hide">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none break-words" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatMarkdown(tutorResponse)) }} />
              </div>
            </div>
          )}

          {/* Tutor explain response - show after flip */}
          {tutorResponse && flipped && (
            <div className="card-premium w-full border border-primary/20 bg-primary/5 p-4 text-sm text-foreground animate-fade-in" style={{ borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-primary text-xs uppercase tracking-wider">Explicação IA</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto scrollbar-hide">
                <div className="text-sm leading-relaxed prose prose-sm max-w-none break-words" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatMarkdown(tutorResponse)) }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom buttons */}
      <div className="flex-shrink-0 pt-3 pb-2 space-y-2">
        {!flipped ? (
          <div className="flex w-full gap-2">
            <button
              onClick={() => setFlipped(true)}
              className="card-premium flex-1 border border-border/40 bg-card px-6 py-3.5 font-display font-semibold text-card-foreground transition-all hover:shadow-md active:scale-[0.98]"
              style={{ borderRadius: 'var(--radius)' }}
            >
              Mostrar Resposta
            </button>
            {onTutorRequest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={canUseTutor ? () => onTutorRequest() : undefined}
                    disabled={!canUseTutor || isTutorLoading}
                    className={`flex items-center justify-center border px-3 py-3.5 transition-all active:scale-95 ${
                      canUseTutor
                        ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                        : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    }`}
                    style={{ borderRadius: 'var(--radius)' }}
                  >
                    {isTutorLoading ? <TutorLoadingAnimation /> : <Lightbulb className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {canUseTutor ? <p>Pedir dica ao Tutor (2 Créditos IA)</p> : <p>Estude mais para ganhar Créditos IA</p>}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : quickReview ? (
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
            {/* Explain button for basic/cloze/occlusion */}
            {onTutorRequest && !tutorResponse && (
              <button
                onClick={() => canUseTutor ? onTutorRequest({ action: 'explain' }) : undefined}
                disabled={!canUseTutor || isTutorLoading}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                  canUseTutor
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                    : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                }`}
              >
                {isTutorLoading ? <TutorLoadingAnimation /> : <><BookOpen className="h-3.5 w-3.5" /> Explicar com IA (2 créditos)</>}
              </button>
            )}

            <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2">
              {ratingConfig.map(({ rating, label, colorClass }) => (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  disabled={isSubmitting}
                  className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 py-3 sm:py-3.5 font-medium transition-all active:scale-95 disabled:opacity-50 ${colorClass}`}
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <span className="text-sm font-bold">{label}</span>
                  <span className="text-[11px] sm:text-xs opacity-80">{intervals[rating]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FlashCard;
