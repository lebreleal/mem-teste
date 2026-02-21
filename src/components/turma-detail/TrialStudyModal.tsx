import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RotateCcw, CheckCircle2 } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize';

interface TrialStudyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
}

const ratingButtons = [
  { label: 'Errei', colorClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' },
  { label: 'Difícil', colorClass: 'bg-warning hover:bg-warning/90 text-warning-foreground' },
  { label: 'Bom', colorClass: 'bg-success hover:bg-success/90 text-success-foreground' },
  { label: 'Fácil', colorClass: 'bg-info hover:bg-info/90 text-info-foreground' },
];

const TrialStudyModal = ({ open, onOpenChange, deckId, deckName }: TrialStudyModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['trial-cards', deckId],
    queryFn: async () => {
      const { data } = await supabase.from('cards').select('id, front_content, back_content, card_type').eq('deck_id', deckId);
      return data ?? [];
    },
    enabled: open && !!deckId,
  });

  const shuffled = useMemo(() => {
    if (!cards.length) return [];
    return [...cards].sort(() => Math.random() - 0.5);
  }, [cards]);

  const current = shuffled[currentIndex];

  const handleRate = () => {
    if (currentIndex < shuffled.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setRevealed(false);
    } else {
      setFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setRevealed(false);
    setFinished(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setCurrentIndex(0);
      setRevealed(false);
      setFinished(false);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-full h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{deckName}</p>
          </div>
          <Badge variant="outline" className="text-[10px] border-warning text-warning shrink-0">
            Modo Teste
          </Badge>
          {!finished && shuffled.length > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {currentIndex + 1}/{shuffled.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Carregando cards...</span>
            </div>
          ) : shuffled.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum card neste baralho.</p>
          ) : finished ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <div>
                <h3 className="font-display text-lg font-bold">Sessão concluída!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Você revisou {shuffled.length} card{shuffled.length > 1 ? 's' : ''} no modo teste.
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Nenhum progresso foi salvo.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={handleRestart}>
                  <RotateCcw className="h-4 w-4" /> Refazer
                </Button>
                <Button onClick={handleClose}>Voltar</Button>
              </div>
            </div>
          ) : current ? (
            <div className="w-full max-w-md space-y-4">
              {/* Front */}
              <div
                className="card-premium w-full border border-border/40 bg-card p-5 cursor-pointer min-h-[120px]"
                style={{ borderRadius: 'var(--radius)' }}
                onClick={() => setRevealed(true)}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 block">Frente</span>
                <div
                  className="prose prose-sm max-w-none text-card-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.front_content) }}
                />
                {!revealed && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">Toque para revelar</p>
                )}
              </div>

              {/* Back */}
              {revealed && (
                <div
                  className="card-premium w-full border border-border/40 bg-card p-5 animate-fade-in"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-success mb-2 block">Verso</span>
                  <div
                    className="prose prose-sm max-w-none text-card-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.back_content) }}
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Rating buttons */}
        {!finished && revealed && shuffled.length > 0 && (
          <div className="shrink-0 px-4 py-3 border-t border-border/50">
            <div className="grid grid-cols-4 gap-2">
              {ratingButtons.map(btn => (
                <Button
                  key={btn.label}
                  size="sm"
                  className={`text-xs font-semibold ${btn.colorClass}`}
                  onClick={handleRate}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              Modo teste — nenhum progresso será salvo
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TrialStudyModal;
