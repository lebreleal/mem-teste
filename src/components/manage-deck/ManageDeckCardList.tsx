import React from 'react';
import { List, type RowComponentProps } from 'react-window';
import { getCardPreview, getCardBackText, getCardStatusBorder } from '@/lib/cardPreview';
import CardThumb from '@/components/cards/CardThumb';
import EmptyDeckState from '@/components/cards/EmptyDeckState';

import { Pencil, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';




/** Must stay in sync with CardList (deck detail) so both lists breathe alike. */
const ITEM_HEIGHT = 104;
const ROW_GAP = 10;


interface ManageDeckCardListProps {
  cards: any[];
  isLoading: boolean;
  isCommunityDeck: boolean;
  openNew: () => void;
  openEdit: (card: any) => void;
  setDeleteId: (id: string | null) => void;
  setSuggestCard: (card: any) => void;
}

interface CardRowData {
  cards: any[];
  isCommunityDeck: boolean;
  openEdit: (card: any) => void;
  setDeleteId: (id: string | null) => void;
  setSuggestCard: (card: any) => void;
}

const CardRow = ({ index, style, cards, isCommunityDeck, openEdit, setDeleteId, setSuggestCard }: RowComponentProps<CardRowData>): React.ReactElement | null => {
  const card = cards[index];
  if (!card) return null;

  // Same preview engine, thumbnail, colours and layout as the deck detail
  // list, so both screens look identical for every card type.
  const preview = getCardPreview(card.front_content, card.card_type);
  const backText = getCardBackText(card);

  return (
    <div style={{ ...style, paddingBottom: ROW_GAP }}>
      <div className={`group flex h-full items-center gap-3 overflow-hidden rounded-xl border border-border/50 border-l-4 ${getCardStatusBorder(card)} bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md`}>
        <div className="flex flex-1 min-w-0 items-start gap-2.5">
          {preview.imageUrl && <CardThumb src={preview.imageUrl} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-card-foreground leading-snug line-clamp-2">
              {preview.text || (preview.imageUrl ? '' : 'Sem conteúdo')}
            </p>
            {backText && (
              <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-1">{backText}</p>
            )}
          </div>
        </div>


        <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
    </div>
  );
};
CardRow.displayName = 'CardRow';


export const ManageDeckCardList = ({ cards, isLoading, isCommunityDeck, openNew, openEdit, setDeleteId, setSuggestCard }: ManageDeckCardListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
      </div>
    );
  }

  if (cards.length === 0) {
    return <EmptyDeckState onAdd={openNew} />;
  }


  const listHeight = Math.min(cards.length * ITEM_HEIGHT, 600);

  return (
    <List
      rowCount={cards.length}
      rowHeight={ITEM_HEIGHT}
      style={{ width: '100%', height: listHeight }}
      rowComponent={CardRow}
      rowProps={{ cards, isCommunityDeck, openEdit, setDeleteId, setSuggestCard }}
      overscanCount={5}
    />
  );
};
