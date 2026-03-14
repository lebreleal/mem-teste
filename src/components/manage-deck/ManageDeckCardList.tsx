import { sanitizeHtml } from '@/lib/sanitize';
import { Pencil, Trash2, Send, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTagsInline } from './CardTagWidgets';

function getCardBorderColor(card: any): string {
  // State 0 = new (never reviewed)
  if (card.state === 0) return 'border-l-muted-foreground/40';
  // Reviewed cards: color by difficulty (proxy for last rating)
  const d = card.difficulty ?? 5;
  if (d <= 3) return 'border-l-[#1679CA]';   // Fácil
  if (d <= 5) return 'border-l-emerald-500';  // Bom
  if (d <= 7) return 'border-l-orange-500';   // Difícil
  return 'border-l-destructive';              // Errei
}

interface ManageDeckCardListProps {
  cards: any[];
  isLoading: boolean;
  isCommunityDeck: boolean;
  openNew: () => void;
  openEdit: (card: any) => void;
  setDeleteId: (id: string | null) => void;
  setSuggestCard: (card: any) => void;
}

export const ManageDeckCardList = ({ cards, isLoading, isCommunityDeck, openNew, openEdit, setDeleteId, setSuggestCard }: ManageDeckCardListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
        <h3 className="font-display text-lg font-semibold text-foreground">Nenhum card ainda</h3>
        <p className="mt-1 text-sm text-muted-foreground">Adicione flashcards para começar a estudar.</p>
        <Button onClick={openNew} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Adicionar Card</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map(card => (
        <div key={card.id} className={`group flex items-center gap-4 rounded-xl border border-border/50 border-l-4 ${getCardBorderColor(card)} bg-card p-4 shadow-sm transition-shadow hover:shadow-md`}>
          <div className="flex-1 min-w-0">
            {card.card_type === 'image_occlusion' ? (() => {
              try {
                const data = JSON.parse(card.front_content);
                const rectCount = data.allRects?.length || 0;
                return (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="h-10 w-14 rounded border border-border/50 bg-muted/50 overflow-hidden shrink-0">
                      {data.imageUrl && <img src={data.imageUrl} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{rectCount} área{rectCount !== 1 ? 's' : ''} oculta{rectCount !== 1 ? 's' : ''}</span>
                  </div>
                );
              } catch { return <p className="text-sm text-muted-foreground">Oclusão de imagem</p>; }
            })() : (
              <>
                <div className="text-sm font-medium text-card-foreground line-clamp-1 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front_content) }} />
                {card.card_type !== 'multiple_choice' && (
                  <div className="mt-1 text-xs text-muted-foreground line-clamp-1 prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back_content) }} />
                )}
              </>
            )}
            {card.card_type === 'multiple_choice' && (() => {
              try {
                const mc = JSON.parse(card.back_content);
                return <p className="mt-1 text-xs text-muted-foreground">{mc.options?.length || 0} opções · Resposta: {mc.options?.[mc.correctIndex]}</p>;
              } catch { return null; }
            })()}
            <CardTagsInline cardId={card.id} />
          </div>
          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {isCommunityDeck ? (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setSuggestCard(card)} title="Sugerir correção">
                <Send className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(card)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(card.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
