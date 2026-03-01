import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LazyRichEditor from '@/components/LazyRichEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Flag } from 'lucide-react';

interface SuggestCorrectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: {
    id: string;
    front_content: string;
    back_content: string;
    deck_id: string;
    card_type: string;
  };
}

const SuggestCorrectionModal = ({ open, onOpenChange, card }: SuggestCorrectionModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [front, setFront] = useState(card.front_content);
  const [back, setBack] = useState(card.back_content);
  const [rationale, setRationale] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset when card changes
  const resetForm = () => {
    setFront(card.front_content);
    setBack(card.back_content);
    setRationale('');
  };

  const handleSubmit = async () => {
    if (!rationale.trim()) {
      toast({ title: 'Justificativa obrigatória', description: 'Explique o motivo da sugestão.', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      const suggestedContent = {
        front_content: front !== card.front_content ? front : undefined,
        back_content: back !== card.back_content ? back : undefined,
      };

      // Check if anything actually changed
      if (!suggestedContent.front_content && !suggestedContent.back_content) {
        toast({ title: 'Nenhuma alteração', description: 'Modifique o conteúdo do card antes de enviar.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase.from('deck_suggestions').insert({
        suggester_user_id: user.id,
        deck_id: card.deck_id,
        card_id: card.id,
        suggested_content: suggestedContent,
        rationale: rationale.trim(),
        status: 'pending',
      } as any);

      if (error) throw error;

      toast({ title: '✅ Sugestão enviada!', description: 'O criador do baralho será notificado.' });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar sugestão', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMultipleChoice = card.card_type === 'multiple_choice';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" /> Reportar / Sugerir Correção
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Frente (Pergunta)</Label>
            <LazyRichEditor content={front} onChange={setFront} placeholder="Frente do card..." />
          </div>

          {!isMultipleChoice && (
            <div>
              <Label className="mb-1.5 block">Verso (Resposta)</Label>
              <LazyRichEditor content={back} onChange={setBack} placeholder="Verso do card..." />
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">
              Justificativa <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Explique por que esta correção é necessária..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar Sugestão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SuggestCorrectionModal;
