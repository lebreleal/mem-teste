/**
 * PublicDeckPreview — full page preview of a public deck
 * with card list, community suggestions, and import action.
 * Reuses exact same CardContent/viewer from CardPreviewSheet and card list layout from CardList.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, RefreshCw, ArrowLeft, MessageSquare, Clock, ChevronLeft, ChevronRight, X, FileText, GraduationCap, Download, Paperclip, Plus, Pencil, AlertTriangle, Loader2, Trash2, Send } from 'lucide-react';
import SuggestCorrectionModal from '@/components/SuggestCorrectionModal';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { CardContent, buildVirtualCards } from '@/components/deck-detail/CardPreviewSheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Json } from '@/integrations/supabase/types';

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

/* ─── Read-only Card Preview Sheet (reuses CardContent from CardPreviewSheet) ─── */
const ReadOnlyPreviewSheet = ({ cards, initialIndex, open, onClose, deckId, isOwner }: {
  cards: any[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  deckId?: string;
  isOwner?: boolean;
}) => {
  const [suggestCard, setSuggestCard] = useState<any>(null);
  const isMobile = useIsMobile();

  const virtualCards = useMemo(() => {
    if (!cards || cards.length === 0) return [];
    return buildVirtualCards(cards);
  }, [cards]);

  const initialVirtualIndex = useMemo(() => {
    if (virtualCards.length === 0) return 0;
    if (initialIndex < 0 || initialIndex >= cards.length) return 0;
    const targetCard = cards[initialIndex];
    if (!targetCard) return 0;
    const found = virtualCards.findIndex(vc => vc.card.id === targetCard.id);
    return found >= 0 ? found : 0;
  }, [initialIndex, cards, virtualCards]);

  const [index, setIndex] = useState(initialVirtualIndex);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setIndex(initialVirtualIndex); setRevealed(false); }, [initialVirtualIndex]);

  const safeIndex = virtualCards.length > 0 ? Math.min(index, virtualCards.length - 1) : 0;
  const vc = virtualCards.length > 0 ? virtualCards[safeIndex] : null;

  const goPrev = useCallback(() => {
    if (safeIndex > 0) { setIndex(i => i - 1); setRevealed(false); }
  }, [safeIndex]);

  const goNext = useCallback(() => {
    if (safeIndex < virtualCards.length - 1) { setIndex(i => i + 1); setRevealed(false); }
  }, [safeIndex, virtualCards.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setRevealed(r => !r); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext, onClose]);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  useEffect(() => {
    if (!open || !isMobile) return;
    const onTouchStart = (e: TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      swipedRef.current = false;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || swipedRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipedRef.current = true;
        if (dx > 0) goPrev(); else goNext();
      }
      touchStartRef.current = null;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [open, isMobile, goPrev, goNext]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !vc) return null;

  const isCloze = vc.card?.card_type === 'cloze';
  const clozeTarget = vc.clozeTarget;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-3 sm:px-5 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-card/80 shadow-sm" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border/50 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
            <span className="text-primary">{safeIndex + 1}</span>/{virtualCards.length}
          </span>
          {isCloze && clozeTarget && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              c{clozeTarget}
            </span>
          )}
        </div>
        {!isOwner && vc?.card && deckId ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-card/80 shadow-sm"
            onClick={() => setSuggestCard(vc.card)}
            title="Sugerir correção"
          >
            <Send className="h-4 w-4" />
          </Button>
        ) : (
          <div className="w-9" />
        )}
      </header>

      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0 px-4 sm:px-6">
        <Button
          variant="ghost" size="icon"
          className={`rounded-full bg-card/80 shadow-sm shrink-0 absolute left-2 sm:left-3 z-10 disabled:opacity-30 ${isMobile ? 'h-8 w-8' : 'h-10 w-10'}`}
          disabled={safeIndex === 0} onClick={goPrev}
        >
          <ChevronLeft className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
        </Button>

        <div className="w-full max-w-2xl mx-auto px-10 sm:px-14">
          <CardContent vc={vc} revealed={revealed} onClick={() => setRevealed(r => !r)} />
          {!revealed && (
            <p className="text-center text-xs text-muted-foreground mt-3 sm:mt-4 animate-pulse">
              Toque para revelar
            </p>
          )}
        </div>

        <Button
          variant="ghost" size="icon"
          className={`rounded-full bg-card/80 shadow-sm shrink-0 absolute right-2 sm:right-3 z-10 disabled:opacity-30 ${isMobile ? 'h-8 w-8' : 'h-10 w-10'}`}
          disabled={safeIndex === virtualCards.length - 1} onClick={goNext}
        >
          <ChevronRight className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
        </Button>
      </div>

      {suggestCard && deckId && (
        <SuggestCorrectionModal
          open={!!suggestCard}
          onOpenChange={(v) => { if (!v) setSuggestCard(null); }}
          card={{
            id: suggestCard.id,
            front_content: suggestCard.front_content,
            back_content: suggestCard.back_content,
            deck_id: deckId,
            card_type: suggestCard.card_type,
          }}
        />
      )}
    </div>
  );
};

/* ─── Card list item (exact same rendering as CardList in DeckDetail) ─── */
const CardListItem = ({ card, onClick }: { card: any; onClick: () => void }) => {
  const isCloze = card.card_type === 'cloze';
  const isMultiple = card.card_type === 'multiple_choice';
  const isOcclusion = card.card_type === 'image_occlusion';

  const typeLabel = isCloze ? 'CLOZE' : isMultiple ? 'MÚLTIPLA' : isOcclusion ? 'OCLUSÃO' : 'BÁSICO';
  const typeBadgeClass = isCloze
    ? 'bg-primary/15 text-primary border-primary/30'
    : isMultiple
    ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
    : isOcclusion
    ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400'
    : 'bg-muted text-muted-foreground border-border';

  let mcOptions: string[] = [];
  let mcCorrectIdx = -1;
  if (isMultiple && card.back_content) {
    try {
      const parsed = JSON.parse(card.back_content);
      if (parsed.options) mcOptions = parsed.options;
      if (typeof parsed.correctIndex === 'number') mcCorrectIdx = parsed.correctIndex;
    } catch {}
  }

  return (
    <div
      className="group rounded-xl border border-border/60 bg-card p-4 transition-colors cursor-pointer hover:border-border hover:shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium bg-muted/80 text-muted-foreground tracking-tight">
              #{card.id.replace(/-/g, '').slice(0, 13).toUpperCase()}
            </span>
          </div>
          {isCloze ? (
            <p className="text-sm font-semibold text-foreground leading-snug">
              {(() => {
                const plain = stripHtml(card.front_content);
                const parts: React.ReactNode[] = [];
                const regex = /\{\{c(\d+)::([^}]*)\}\}/g;
                let lastIdx = 0;
                let m;
                let k = 0;
                const BADGE_STYLE = 'bg-primary/15 text-primary border-b-2 border-primary/50 rounded';
                while ((m = regex.exec(plain)) !== null) {
                  if (m.index > lastIdx) parts.push(<span key={k++}>{plain.slice(lastIdx, m.index)}</span>);
                  const n = parseInt(m[1]);
                  parts.push(
                    <span key={k++} className={`inline-flex items-baseline gap-px px-1 py-0 text-xs font-semibold ${BADGE_STYLE}`}>
                      <span className="text-[7px] font-bold opacity-50 leading-none" style={{ verticalAlign: 'super' }}>{n}</span>
                      {m[2]}
                    </span>
                  );
                  lastIdx = m.index + m[0].length;
                }
                if (lastIdx < plain.length) parts.push(<span key={k++}>{plain.slice(lastIdx)}</span>);
                return parts;
              })()}
            </p>
          ) : isOcclusion ? (
            (() => {
              try {
                const data = JSON.parse(card.front_content);
                const rectCount = data.allRects?.length || 0;
                return (
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-14 rounded border border-border/50 bg-muted/50 overflow-hidden shrink-0">
                      {data.imageUrl && <img src={data.imageUrl} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{rectCount} área{rectCount !== 1 ? 's' : ''} oculta{rectCount !== 1 ? 's' : ''}</span>
                  </div>
                );
              } catch {
                return <p className="text-sm text-muted-foreground">Oclusão de imagem</p>;
              }
            })()
          ) : (
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {stripHtml(card.front_content)}
            </p>
          )}

          {isMultiple && mcOptions.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {mcOptions.map((opt, oi) => (
                <p key={oi} className={`text-xs leading-snug ${oi === mcCorrectIdx ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                  {oi === mcCorrectIdx ? '✓ ' : '  '}{opt}
                </p>
              ))}
            </div>
          ) : !isOcclusion && !isCloze && card.back_content ? (
            <p className="text-xs text-muted-foreground mt-1.5 leading-snug line-clamp-2">
              {stripHtml(card.back_content)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass}`}>
            {isCloze && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
              </svg>
            )}
            {typeLabel}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ─── Suggestion Card (AnkiHub-style) ─── */
interface Suggestion {
  id: string;
  status: string;
  rationale: string;
  created_at: string;
  suggester_name: string;
  card_id: string | null;
  suggested_content: Json;
  original_front: string | null;
  original_back: string | null;
}

const SuggestionCard = ({ suggestion }: { suggestion: Suggestion }) => {
  const content = suggestion.suggested_content as { front_content?: string; back_content?: string } | null;
  const suggestedFront = content?.front_content ?? '';
  const suggestedBack = content?.back_content ?? '';
  const originalFront = suggestion.original_front ?? '';
  const originalBack = suggestion.original_back ?? '';

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/20' },
    accepted: { label: 'Aceita', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    rejected: { label: 'Rejeitada', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };

  const status = statusConfig[suggestion.status] ?? statusConfig.pending;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
            {suggestion.suggester_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{suggestion.suggester_name}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatDistanceToNow(new Date(suggestion.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${status.className}`}>
          {status.label}
        </span>
      </div>

      {suggestion.rationale && (
        <div className="px-4 py-2 bg-muted/20 border-b border-border/30">
          <p className="text-xs text-muted-foreground italic">"{suggestion.rationale}"</p>
        </div>
      )}

      <div className="divide-y divide-border/30">
        {suggestedFront && originalFront !== suggestedFront && (
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Frente</p>
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive line-through">{stripHtml(originalFront)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{stripHtml(suggestedFront)}</p>
            </div>
          </div>
        )}

        {suggestedBack && originalBack !== suggestedBack && (
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Verso</p>
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive line-through">{stripHtml(originalBack)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{stripHtml(suggestedBack)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Community Suggestions Section ─── */
const CommunitySuggestions = ({ deckId }: { deckId: string }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['deck-suggestions-public', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deck_suggestions')
        .select('id, status, rationale, created_at, suggester_user_id, card_id, suggested_content')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map(s => s.suggester_user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.id, p.name]));

      const cardIds = data.map(s => s.card_id).filter(Boolean) as string[];
      const { data: cards } = cardIds.length > 0
        ? await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds)
        : { data: [] };
      const cardMap = new Map((cards ?? []).map(c => [c.id, c]));

      return data.map(s => ({
        ...s,
        suggester_name: nameMap.get(s.suggester_user_id) ?? 'Usuário',
        original_front: s.card_id ? cardMap.get(s.card_id)?.front_content ?? null : null,
        original_back: s.card_id ? cardMap.get(s.card_id)?.back_content ?? null : null,
      })) as Suggestion[];
    },
    enabled: !!deckId,
  });

  const filtered = filter === 'all' ? suggestions : suggestions.filter(s => s.status === filter);
  const counts = {
    all: suggestions.length,
    pending: suggestions.filter(s => s.status === 'pending').length,
    accepted: suggestions.filter(s => s.status === 'accepted').length,
    rejected: suggestions.filter(s => s.status === 'rejected').length,
  };

  const filters = [
    { value: 'all' as const, label: 'Todas' },
    { value: 'pending' as const, label: 'Pendentes' },
    { value: 'accepted' as const, label: 'Aceitas' },
    { value: 'rejected' as const, label: 'Rejeitadas' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              filter === f.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
            }`}
          >
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma sugestão {filter !== 'all' ? `${filters.find(f => f.value === filter)?.label.toLowerCase()}` : 'da comunidade'}.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Sugestões aparecem quando usuários propõem melhorias nos cards.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(suggestion => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Inline Card Previewer (embedded above card list) ─── */
const InlineCardPreviewer = ({ cards, onCardClick }: { cards: any[]; onCardClick: (idx: number) => void }) => {
  const isMobile = useIsMobile();
  const virtualCards = useMemo(() => buildVirtualCards(cards), [cards]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const safeIndex = virtualCards.length > 0 ? Math.min(index, virtualCards.length - 1) : 0;
  const vc = virtualCards.length > 0 ? virtualCards[safeIndex] : null;

  const goPrev = useCallback(() => {
    if (safeIndex > 0) { setIndex(i => i - 1); setRevealed(false); }
  }, [safeIndex]);

  const goNext = useCallback(() => {
    if (safeIndex < virtualCards.length - 1) { setIndex(i => i + 1); setRevealed(false); }
  }, [safeIndex, virtualCards.length]);

  // Swipe support
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  useEffect(() => {
    if (!isMobile) return;
    const container = document.getElementById('inline-previewer');
    if (!container) return;
    const onTouchStart = (e: TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      swipedRef.current = false;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || swipedRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipedRef.current = true;
        if (dx > 0) goPrev(); else goNext();
      }
      touchStartRef.current = null;
    };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile, goPrev, goNext]);

  if (!vc || virtualCards.length === 0) return null;

  const isCloze = vc.card?.card_type === 'cloze';
  const clozeTarget = vc.clozeTarget;

  return (
    <div id="inline-previewer" className="relative">
      {/* Counter + cloze badge */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="inline-flex items-center rounded-full border border-border/50 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm tabular-nums">
          <span className="text-primary">{safeIndex + 1}</span>/{virtualCards.length}
        </span>
        {isCloze && clozeTarget && (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            c{clozeTarget}
          </span>
        )}
      </div>

      {/* Card + arrows */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-card/80 shadow-sm shrink-0 h-8 w-8 disabled:opacity-30"
          disabled={safeIndex === 0} onClick={goPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <CardContent
            vc={vc}
            revealed={revealed}
            onClick={() => setRevealed(r => !r)}
            className=""
          />
          {!revealed && (
            <p className="text-center text-xs text-muted-foreground mt-2 animate-pulse">
              Toque para revelar
            </p>
          )}
        </div>

        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-card/80 shadow-sm shrink-0 h-8 w-8 disabled:opacity-30"
          disabled={safeIndex === virtualCards.length - 1} onClick={goNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

/* ─── Main Page ─── */
const PublicDeckPreview = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch deck info
  const { data: deck, isLoading: deckLoading } = useQuery({
    queryKey: ['public-deck-info', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decks')
        .select('id, name, is_public, updated_at, user_id')
        .eq('id', deckId!)
        .single();
      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', data.user_id)
        .single();

      return { ...data, owner_name: profile?.name ?? 'Criador' };
    },
    enabled: !!deckId,
  });

  // Fetch cards (with all fields needed by CardContent)
  const { data: allCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['public-deck-cards', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('deck_id', deckId!)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!deckId,
  });

  // Suggestion count for tab badge
  const { data: suggestionCount = 0 } = useQuery({
    queryKey: ['deck-suggestion-count', deckId],
    queryFn: async () => {
      const { count } = await supabase
        .from('deck_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', deckId!);
      return count ?? 0;
    },
    enabled: !!deckId,
  });

  // Find turma_deck entry to get turma context
  const { data: turmaDeck } = useQuery({
    queryKey: ['turma-deck-link', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turma_decks')
        .select('id, turma_id, subject_id, lesson_id, content_folder_id')
        .eq('deck_id', deckId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!deckId,
  });

  // Fetch files linked to same lesson as this deck
  const { data: deckFiles = [] } = useQuery({
    queryKey: ['turma-deck-files', turmaDeck?.lesson_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turma_lesson_files')
        .select('id, file_name, file_url, file_size, file_type, created_at')
        .eq('lesson_id', turmaDeck!.lesson_id!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!turmaDeck?.lesson_id,
  });

  // Fetch exams linked to same lesson as this deck
  const { data: deckExams = [] } = useQuery({
    queryKey: ['turma-deck-exams', turmaDeck?.turma_id, turmaDeck?.lesson_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turma_exams')
        .select('id, title, description, total_questions, time_limit_seconds, created_at, is_published')
        .eq('turma_id', turmaDeck!.turma_id)
        .eq('lesson_id', turmaDeck!.lesson_id!)
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!turmaDeck?.turma_id && !!turmaDeck?.lesson_id,
  });

  const isOwner = !!(user && deck && deck.user_id === user.id);

  // ── File upload for owner ──
  const getOrCreateLesson = async (): Promise<string> => {
    if (turmaDeck?.lesson_id) return turmaDeck.lesson_id;
    const { data, error } = await supabase.from('turma_lessons' as any).insert({
      turma_id: turmaDeck!.turma_id, subject_id: turmaDeck?.subject_id ?? null,
      name: deck?.name || 'Conteúdo', created_by: user!.id, is_published: true,
    } as any).select().single();
    if (error) throw error;
    // Update turma_deck to reference the new lesson
    await supabase.from('turma_decks').update({ lesson_id: (data as any).id }).eq('id', turmaDeck!.id);
    queryClient.invalidateQueries({ queryKey: ['turma-deck-link', deckId] });
    queryClient.invalidateQueries({ queryKey: ['turma-lessons'] });
    return (data as any).id;
  };

  const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-powerpoint',
  ];
  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt'];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length || !user || !turmaDeck) return;
    setUploading(true);
    try {
      const lessonId = await getOrCreateLesson();
      for (const file of Array.from(fileList)) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_FILE_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
          toast({ title: 'Tipo não permitido', description: 'Apenas PDF, DOCX e PPTX.', variant: 'destructive' });
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast({ title: 'Arquivo muito grande', description: 'Máximo 20MB.', variant: 'destructive' });
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${user.id}/${turmaDeck.turma_id}/${lessonId}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage.from('lesson-files').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('lesson-files').getPublicUrl(filePath);
        await supabase.from('turma_lesson_files' as any).insert({
          lesson_id: lessonId, turma_id: turmaDeck.turma_id, file_name: file.name,
          file_url: urlData.publicUrl, file_size: file.size, file_type: file.type, uploaded_by: user.id,
        } as any);
      }
      queryClient.invalidateQueries({ queryKey: ['turma-deck-files'] });
      toast({ title: 'Arquivo(s) enviado(s)!' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const handleDeleteFile = async (fileId: string) => {
    try {
      setDeletingFileId(fileId);
      const { error } = await supabase.from('turma_lesson_files' as any).delete().eq('id', fileId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['turma-deck-files'] });
      queryClient.invalidateQueries({ queryKey: ['turma-content-files'] });
      toast({ title: 'Arquivo removido' });
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingFileId(null);
    }
  };

  const totalPages = Math.ceil(allCards.length / PAGE_SIZE);
  const paginatedCards = allCards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Group cloze cards for display (same logic as CardList)
  const groupedCards = useMemo(() => {
    const groups: { cards: typeof paginatedCards; isClozeGroup: boolean }[] = [];
    const usedIds = new Set<string>();

    paginatedCards.forEach(card => {
      if (usedIds.has(card.id)) return;
      if (card.card_type === 'cloze') {
        const siblings = paginatedCards.filter(
          c => c.card_type === 'cloze' && c.front_content === card.front_content && !usedIds.has(c.id)
        );
        siblings.forEach(s => usedIds.add(s.id));
        groups.push({ cards: siblings, isClozeGroup: siblings.length > 1 });
      } else {
        usedIds.add(card.id);
        groups.push({ cards: [card], isClozeGroup: false });
      }
    });
    return groups;
  }, [paginatedCards]);

  if (deckLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Deck não encontrado</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-base sm:text-xl font-bold text-foreground truncate">
              {deck.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              por <span className="font-semibold text-foreground">{deck.owner_name}</span>
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Stats bar */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-foreground" />
            <span className="font-bold text-foreground">{allCards.length}</span> cards
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {formatDistanceToNow(new Date(deck.updated_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>

        {/* Hidden file input for owner uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Anexos section */}
        {(deckFiles.length > 0 || (isOwner && turmaDeck)) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Anexos
              </h3>
              {isOwner && turmaDeck && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  {uploading ? 'Enviando...' : 'Adicionar'}
                </Button>
              )}
            </div>
            {deckFiles.length > 0 && (
              <div className="space-y-1.5">
                {deckFiles.map(file => {
                  const ext = file.file_name.split('.').pop()?.toUpperCase() || 'FILE';
                  const sizeKb = file.file_size ? Math.round(file.file_size / 1024) : null;
                  const sizeLabel = sizeKb && sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : sizeKb ? `${sizeKb} KB` : '';
                  const isPdf = file.file_type?.includes('pdf');
                  const isImage = file.file_type?.startsWith('image/');
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-border hover:shadow-sm group"
                    >
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${
                          isPdf ? 'bg-destructive/10 text-destructive' : isImage ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {isPdf ? 'PDF' : isImage ? 'IMG' : ext.slice(0, 3)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                            {sizeLabel && <span>{sizeLabel}</span>}
                            <span>{formatDistanceToNow(new Date(file.created_at), { addSuffix: true, locale: ptBR })}</span>
                          </p>
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
                      </a>
                      {isOwner && (
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          disabled={deletingFileId === file.id}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Remover arquivo"
                        >
                          {deletingFileId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {deckFiles.length === 0 && isOwner && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum anexo ainda. Clique em "Adicionar" para enviar arquivos.</p>
            )}
          </div>
        )}

        {/* Provas section */}
        {(deckExams.length > 0 || (isOwner && turmaDeck)) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" /> Provas
              </h3>
              {isOwner && turmaDeck && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => navigate(`/exam/create?turma=${turmaDeck.turma_id}&subject=${turmaDeck.subject_id || ''}&deck=${deckId}`)}
                >
                  <Plus className="h-3 w-3" /> Criar prova
                </Button>
              )}
            </div>
            {deckExams.length > 0 && (
              <div className="space-y-1.5">
                {deckExams.map(exam => (
                  <div
                    key={exam.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-border hover:shadow-sm cursor-pointer"
                    onClick={() => navigate(`/turma-exam/${exam.id}`)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{exam.title}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{exam.total_questions} questões</span>
                        {exam.time_limit_seconds && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {Math.round(exam.time_limit_seconds / 60)} min
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            )}
            {deckExams.length === 0 && isOwner && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma prova ainda. Clique em "Criar prova" para adicionar.</p>
            )}
          </div>
        )}

        {/* Cards & Suggestions Tabs */}
        <Tabs defaultValue="cards" className="flex-1 flex flex-col">
          <TabsList className="w-full flex bg-transparent border-b border-border/50 rounded-none h-auto p-0">
            <TabsTrigger
              value="cards"
              className="flex-1 text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
            >
              <Layers className="h-3.5 w-3.5" /> Cards ({allCards.length})
            </TabsTrigger>
            <TabsTrigger
              value="suggestions"
              className="flex-1 text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Sugestões {suggestionCount > 0 && `(${suggestionCount})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="mt-4">
            {/* Owner warning + edit button */}
            {isOwner && (
              <div className="flex items-center gap-2 mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-xs text-muted-foreground flex-1">
                  Edições feitas aqui alteram o baralho original e a comunidade.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={() => setShowEditWarning(true)}
                >
                  <Pencil className="h-3 w-3" /> Editar cards
                </Button>
              </div>
            )}
            {cardsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : allCards.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-sm text-muted-foreground">Nenhum card neste baralho.</p>
                {isOwner && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowEditWarning(true)}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar cards
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <InlineCardPreviewer cards={allCards} onCardClick={(idx) => setPreviewIndex(idx)} />
                
                <div className="space-y-2.5">
                {groupedCards.map((group) => {
                  const card = group.cards[0];
                  return (
                    <div key={card.id} className="relative">
                      {group.isClozeGroup && (
                        <div className="absolute inset-x-1 -bottom-1 h-2 rounded-b-xl border border-t-0 border-border/40 bg-card/50" />
                      )}
                      <CardListItem
                        card={card}
                        onClick={() => {
                          const flatIdx = allCards.findIndex(c => c.id === card.id);
                          setPreviewIndex(flatIdx >= 0 ? flatIdx : 0);
                        }}
                      />
                    </div>
                  );
                })}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-3">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = totalPages <= 5 ? i : (
                        page < 3 ? i :
                        page > totalPages - 3 ? totalPages - 5 + i :
                        page - 2 + i
                      );
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`h-7 w-7 rounded-md text-xs font-semibold transition-colors ${
                            page === pageNum
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {pageNum + 1}
                        </button>
                      );
                    })}
                    {totalPages > 5 && (
                      <span className="text-xs text-muted-foreground">... {totalPages}</span>
                    )}
                  </div>
                )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="mt-3">
            <CommunitySuggestions deckId={deck.id} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Full-screen card preview (same as DeckDetail) */}
      <ReadOnlyPreviewSheet
        cards={allCards}
        initialIndex={previewIndex ?? 0}
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        deckId={deck?.id}
        isOwner={deck?.user_id === user?.id}
      />
      {/* Edit warning dialog */}
      <AlertDialog open={showEditWarning} onOpenChange={setShowEditWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Editar baralho
            </AlertDialogTitle>
            <AlertDialogDescription>
              As alterações feitas nos cards serão refletidas tanto no seu baralho pessoal quanto na comunidade. Todos os membros que importaram este deck receberão as atualizações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(`/decks/${deckId}/manage`)}>
              Entendi, editar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PublicDeckPreview;
