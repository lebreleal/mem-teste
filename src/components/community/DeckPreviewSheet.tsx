import { useState, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, Link2, Layers, Type, CheckCircle2, CircleDot, ChevronDown } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DeckPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
  cardCount: number;
  alreadyLinked: boolean;
  alreadyOwns: boolean;
  allowDownload: boolean;
  onAddToCollection: () => void;
  onDownload: () => void;
  isAdding: boolean;
  isDownloading: boolean;
}

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

/* ─── SVG Icons ─── */
/** Stacked cards icon — group of layered cards */
const BasicCardIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="16" height="12" rx="2" />
    <path d="M6 6V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2" />
  </svg>
);

/** Dashed rectangle — cloze blank */
const ClozeIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
    <line x1="7" y1="12" x2="17" y2="12" opacity="0.5" />
  </svg>
);

/** ABC multiple choice icon */
const OptionIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="6" r="2.5" />
    <line x1="10" y1="6" x2="20" y2="6" />
    <circle cx="5" cy="12" r="2.5" fill="currentColor" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <circle cx="5" cy="18" r="2.5" />
    <line x1="10" y1="18" x2="20" y2="18" />
  </svg>
);

/* ─── Cloze Card (study-screen style) ─── */
const ClozeCardPreview = ({ front }: { front: string }) => {
  const [revealed, setRevealed] = useState(false);
  const text = stripHtml(front);

  const renderContent = () => {
    return text.replace(/\{\{c\d+::(.+?)\}\}/g, (_, answer) => {
      if (revealed) return `<span class="cloze-revealed">${answer}</span>`;
      return `<span class="cloze-blank">[...]</span>`;
    });
  };

  return (
    <button
      className="w-full rounded-xl border border-border/50 bg-card overflow-hidden text-left transition-all hover:shadow-sm"
      onClick={() => setRevealed(!revealed)}
    >
      <div className="p-4">
        <p
          className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderContent()) }}
        />
      </div>
      <div className="px-4 py-1.5 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground/50">
          Toque para {revealed ? 'ocultar' : 'revelar'} lacunas
        </p>
      </div>
    </button>
  );
};

/* ─── Basic (Front/Back) Card ─── */
const BasicCardPreview = ({ front, back }: { front: string; back: string }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      className="w-full rounded-xl border border-border/50 bg-card overflow-hidden text-left transition-all hover:shadow-sm"
      onClick={() => setFlipped(!flipped)}
    >
      <div className="grid grid-cols-2 divide-x divide-border/50">
        <div className={`p-4 transition-opacity ${flipped ? 'opacity-40' : ''}`}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5 block">Frente</span>
          <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap">{stripHtml(front)}</p>
        </div>
        <div className={`p-4 transition-all ${!flipped ? 'opacity-30 blur-[3px]' : ''}`}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Verso</span>
          <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap">{stripHtml(back)}</p>
        </div>
      </div>
      <div className="px-4 py-1.5 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground/50">Toque para {flipped ? 'ocultar' : 'revelar'} verso</p>
      </div>
    </button>
  );
};

/* ─── Multiple Choice Card ─── */
const OptionCardPreview = ({ front, back }: { front: string; back: string }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  let options: string[] = [];
  let correctIndex = -1;
  try {
    const parsed = JSON.parse(back);
    if (parsed.options && Array.isArray(parsed.options)) {
      options = parsed.options;
      correctIndex = typeof parsed.correct === 'number' ? parsed.correct : (typeof parsed.correctIndex === 'number' ? parsed.correctIndex : -1);
    }
  } catch {
    return <BasicCardPreview front={front} back={back} />;
  }

  if (options.length === 0) return <BasicCardPreview front={front} back={back} />;

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const handleSelect = (i: number) => {
    setSelected(i);
    setShowAnswer(true);
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="p-4 border-b border-border/30">
        <p className="text-sm font-medium text-foreground whitespace-pre-wrap">{stripHtml(front)}</p>
      </div>
      <div className="p-2.5 space-y-1.5">
        {options.map((opt, i) => {
          const isCorrect = i === correctIndex;
          const isSelected = selected === i;
          let ringClass = 'border-border/40';
          let bgClass = 'bg-card hover:bg-muted/40';
          let textClass = 'text-foreground';
          let letterBg = 'bg-muted text-muted-foreground';

          if (showAnswer && isCorrect) {
            ringClass = 'border-success/40';
            bgClass = 'bg-success/5';
            textClass = 'text-success';
            letterBg = 'bg-success/15 text-success';
          } else if (showAnswer && isSelected && !isCorrect) {
            ringClass = 'border-destructive/40';
            bgClass = 'bg-destructive/5';
            textClass = 'text-destructive';
            letterBg = 'bg-destructive/15 text-destructive';
          }

          return (
            <button
              key={i}
              className={`w-full text-left rounded-lg px-3 py-2.5 text-sm flex items-center gap-3 transition-all border ${ringClass} ${bgClass}`}
              onClick={() => handleSelect(i)}
              disabled={showAnswer}
            >
              <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${letterBg}`}>
                {letters[i]}
              </span>
              <span className={`line-clamp-2 ${textClass}`}>{opt}</span>
              {showAnswer && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 ml-auto text-success" />}
            </button>
          );
        })}
      </div>
      {!showAnswer && (
        <div className="px-4 py-1.5 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground/50">Selecione uma alternativa</p>
        </div>
      )}
    </div>
  );
};

/* ─── Card type detector + router ─── */
const CardPreview = ({ front, back, type }: { front: string; back: string; type: string }) => {
  const isCloze = type === 'cloze' || front.includes('{{c');

  let isOption = false;
  try {
    const parsed = JSON.parse(back);
    if (parsed.options && Array.isArray(parsed.options) && parsed.options.length >= 2) {
      isOption = true;
    }
  } catch {}

  if (isCloze) return <ClozeCardPreview front={front} />;
  if (isOption) return <OptionCardPreview front={front} back={back} />;
  return <BasicCardPreview front={front} back={back} />;
};

type AddFilter = 'all' | 'basic' | 'cloze' | 'option';

const PreviewContent = ({
  deckId, deckName, cardCount, alreadyLinked, alreadyOwns, allowDownload,
  onAddToCollection, onDownload, isAdding, isDownloading,
}: Omit<DeckPreviewSheetProps, 'open' | 'onOpenChange'>) => {
  const [addFilter, setAddFilter] = useState<AddFilter>('all');

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['preview-cards', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('id, front_content, back_content, card_type')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!deckId,
  });

  const grouped = useMemo(() => {
    const basic: typeof cards = [];
    const cloze: typeof cards = [];
    const option: typeof cards = [];
    cards.forEach(c => {
      if (c.card_type === 'cloze' || c.front_content.includes('{{c')) {
        cloze.push(c);
      } else {
        let isOpt = false;
        try {
          const parsed = JSON.parse(c.back_content);
          if (parsed.options && Array.isArray(parsed.options) && parsed.options.length >= 2) isOpt = true;
        } catch {}
        if (isOpt) option.push(c);
        else basic.push(c);
      }
    });
    return { basic, cloze, option };
  }, [cards]);

  const typeCount = [grouped.basic.length > 0, grouped.cloze.length > 0, grouped.option.length > 0].filter(Boolean).length;

  const renderCards = (list: typeof cards) => (
    <div className="space-y-3">
      {list.map(card => (
        <CardPreview key={card.id} front={card.front_content} back={card.back_content} type={card.card_type} />
      ))}
    </div>
  );

  const defaultTab = grouped.basic.length > 0 ? 'basic' : grouped.cloze.length > 0 ? 'cloze' : 'option';

  const filterLabels: Record<AddFilter, string> = {
    all: `Todos (${cards.length})`,
    basic: `Básico (${grouped.basic.length})`,
    cloze: `Cloze (${grouped.cloze.length})`,
    option: `Múlt. Escolha (${grouped.option.length})`,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with type stats */}
      <div className="pb-3 border-b border-border/30">
        <h3 className="font-display font-semibold text-foreground truncate">{deckName}</h3>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-muted-foreground">{cardCount} cards</span>
          <div className="flex items-center gap-2">
            {grouped.basic.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-primary border border-primary/20">
                <BasicCardIcon className="h-3.5 w-3.5" /> {grouped.basic.length}
              </span>
            )}
            {grouped.cloze.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-info border border-info/20">
                <ClozeIcon className="h-3.5 w-3.5" /> {grouped.cloze.length}
              </span>
            )}
            {grouped.option.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-warning border border-warning/20">
                <OptionIcon className="h-3.5 w-3.5" /> {grouped.option.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cards content */}
      <ScrollArea className="flex-1 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Nenhum card neste baralho.</p>
        ) : typeCount > 1 ? (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="w-full grid bg-transparent border-b border-border/50 rounded-none h-auto p-0" style={{ gridTemplateColumns: `repeat(${typeCount}, 1fr)` }}>
              {grouped.basic.length > 0 && (
                <TabsTrigger value="basic" className="text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
                  <BasicCardIcon className="h-3.5 w-3.5" /> Básico
                </TabsTrigger>
              )}
              {grouped.cloze.length > 0 && (
                <TabsTrigger value="cloze" className="text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
                  <ClozeIcon className="h-3.5 w-3.5" /> Cloze
                </TabsTrigger>
              )}
              {grouped.option.length > 0 && (
                <TabsTrigger value="option" className="text-xs gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
                  <OptionIcon className="h-3.5 w-3.5" /> Escolha
                </TabsTrigger>
              )}
            </TabsList>
            {grouped.basic.length > 0 && <TabsContent value="basic">{renderCards(grouped.basic)}</TabsContent>}
            {grouped.cloze.length > 0 && <TabsContent value="cloze">{renderCards(grouped.cloze)}</TabsContent>}
            {grouped.option.length > 0 && <TabsContent value="option">{renderCards(grouped.option)}</TabsContent>}
          </Tabs>
        ) : (
          renderCards(cards)
        )}
      </ScrollArea>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 pt-3 border-t border-border/30 space-y-2 bg-background pb-1">
        {alreadyOwns ? (
          <Button className="w-full gap-2" disabled>
            <Link2 className="h-4 w-4" /> Já na sua coleção
          </Button>
        ) : alreadyLinked ? (
          <Button className="w-full gap-2" onClick={onAddToCollection} disabled={isAdding}>
            <Copy className="h-4 w-4" /> {isAdding ? 'Sincronizando...' : 'Sincronizar cards faltantes'}
          </Button>
        ) : (
          <>
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" onClick={onAddToCollection} disabled={isAdding}>
                <Copy className="h-4 w-4" /> {isAdding ? 'Adicionando...' : 'Adicionar à coleção'}
              </Button>
              {typeCount > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {Object.entries(filterLabels).map(([key, label]) => {
                      if (key === 'basic' && grouped.basic.length === 0) return null;
                      if (key === 'cloze' && grouped.cloze.length === 0) return null;
                      if (key === 'option' && grouped.option.length === 0) return null;
                      return (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => setAddFilter(key as AddFilter)}
                          className="gap-2"
                        >
                          {key === 'all' && <Layers className="h-3.5 w-3.5" />}
                          {key === 'basic' && <BasicCardIcon className="h-3.5 w-3.5" />}
                          {key === 'cloze' && <ClozeIcon className="h-3.5 w-3.5" />}
                          {key === 'option' && <OptionIcon className="h-3.5 w-3.5" />}
                          <span className="text-xs">{label}</span>
                          {addFilter === key && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {addFilter !== 'all' && (
              <p className="text-[10px] text-center text-muted-foreground">
                Filtrando: apenas <strong>{filterLabels[addFilter]}</strong>
              </p>
            )}
            {allowDownload && (
              <Button variant="outline" className="w-full gap-2" onClick={onDownload} disabled={isDownloading}>
                <Download className="h-4 w-4" /> {isDownloading ? 'Baixando...' : 'Baixar cópia independente'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const DeckPreviewSheet = (props: DeckPreviewSheetProps) => {
  const isMobile = useIsMobile();
  const { open, onOpenChange, ...rest } = props;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{rest.deckName}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-2 pb-4 flex flex-col" style={{ maxHeight: '85vh' }}>
            <PreviewContent {...rest} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>{rest.deckName}</SheetTitle>
        </SheetHeader>
        <PreviewContent {...rest} />
      </SheetContent>
    </Sheet>
  );
};

export default DeckPreviewSheet;
