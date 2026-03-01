import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LazyRichEditor from '@/components/LazyRichEditor';
import { TagInput } from '@/components/TagInput';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDeckTags } from '@/hooks/useTags';
import { Loader2, Flag, Tag as TagIcon, Plus, Shuffle } from 'lucide-react';
import type { Tag } from '@/types/tag';

const CARD_TYPE_OPTIONS = [
  { value: 'basic', label: 'Pergunta / Resposta' },
  { value: 'cloze', label: 'Preencha o espaço (Cloze)' },
  { value: 'multiple_choice', label: 'Múltipla escolha' },
  { value: 'image_occlusion', label: 'Oclusão de imagem' },
] as const;

interface SuggestCorrectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card?: {
    id: string;
    front_content: string;
    back_content: string;
    deck_id: string;
    card_type: string;
  };
  deckId: string;
  deckName?: string;
}

const SuggestCorrectionModal = ({ open, onOpenChange, card, deckId, deckName }: SuggestCorrectionModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [front, setFront] = useState(card?.front_content ?? '');
  const [back, setBack] = useState(card?.back_content ?? '');
  const [rationale, setRationale] = useState('');
  const [suggestedCardType, setSuggestedCardType] = useState(card?.card_type ?? 'basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<Tag[]>([]);
  const [suggestNewCard, setSuggestNewCard] = useState(false);
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');

  const { data: currentDeckTags = [] } = useDeckTags(deckId);

  const isDeckLevel = !card;

  useEffect(() => {
    if (open) {
      setFront(card?.front_content ?? '');
      setBack(card?.back_content ?? '');
      setRationale('');
      setSuggestedCardType(card?.card_type ?? 'basic');
      setSuggestedTags(currentDeckTags);
      setSuggestNewCard(false);
      setNewCardFront('');
      setNewCardBack('');
    }
  }, [open, card?.front_content, card?.back_content]);

  useEffect(() => {
    if (open && currentDeckTags.length > 0 && suggestedTags.length === 0) {
      setSuggestedTags(currentDeckTags);
    }
  }, [currentDeckTags, open]);

  const handleSubmit = async () => {
    if (!rationale.trim()) {
      toast({ title: 'Descreva sua sugestão', description: 'Explique as razões para a mudança sugerida.', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      let suggestedContent: any = {};
      let suggestedTagsPayload: any = null;

      if (card) {
        if (front !== card.front_content) suggestedContent.front_content = front;
        if (back !== card.back_content) suggestedContent.back_content = back;
        if (suggestedCardType !== card.card_type) suggestedContent.card_type = suggestedCardType;
      }

      if (isDeckLevel && suggestNewCard) {
        if (!newCardFront.trim()) {
          toast({ title: 'Preencha a frente do card', variant: 'destructive' });
          setIsSubmitting(false);
          return;
        }
        suggestedContent.new_card = {
          front_content: newCardFront,
          back_content: newCardBack,
        };
      }

      const currentTagIds = new Set(currentDeckTags.map(t => t.id));
      const suggestedTagIds = new Set(suggestedTags.map(t => t.id));
      const addedTags = suggestedTags.filter(t => !currentTagIds.has(t.id));
      const removedTags = currentDeckTags.filter(t => !suggestedTagIds.has(t.id));

      if (addedTags.length > 0 || removedTags.length > 0) {
        suggestedTagsPayload = {
          added: addedTags.map(t => ({ id: t.id, name: t.name })),
          removed: removedTags.map(t => ({ id: t.id, name: t.name })),
        };
      }

      if (card && !suggestedContent.front_content && !suggestedContent.back_content && !suggestedContent.card_type && !suggestedTagsPayload) {
        toast({ title: 'Nenhuma alteração', description: 'Modifique o conteúdo, formato ou as tags antes de enviar.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      if (isDeckLevel && !suggestedTagsPayload && !suggestedContent.new_card) {
        toast({ title: 'Nenhuma alteração', description: 'Sugira um novo card ou modifique as tags.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase.from('deck_suggestions').insert({
        suggester_user_id: user.id,
        deck_id: deckId,
        card_id: card?.id ?? null,
        suggested_content: Object.keys(suggestedContent).length > 0 ? suggestedContent : {},
        suggested_tags: suggestedTagsPayload,
        suggestion_type: isDeckLevel ? 'deck' : 'card',
        rationale: rationale.trim(),
        status: 'pending',
        content_status: Object.keys(suggestedContent).length > 0 ? 'pending' : 'none',
        tags_status: suggestedTagsPayload ? 'pending' : 'none',
      } as any);

      if (error) throw error;

      toast({ title: '✅ Sugestão enviada!', description: 'O criador do baralho será notificado.' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar sugestão', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMultipleChoice = card?.card_type === 'multiple_choice';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            {isDeckLevel ? `Sugestão — ${deckName || 'Deck'}` : 'Sugestão de Correção'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {card && (
            <>
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

              {/* Card format suggestion */}
              <div>
                <Label className="mb-1.5 block flex items-center gap-1.5">
                  <Shuffle className="h-3.5 w-3.5" />
                  Formato do card
                </Label>
                <Select value={suggestedCardType} onValueChange={setSuggestedCardType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suggestedCardType !== card.card_type && (
                  <p className="text-[10px] text-primary mt-1">
                    Atual: {CARD_TYPE_OPTIONS.find(o => o.value === card.card_type)?.label ?? card.card_type}
                  </p>
                )}
              </div>
            </>
          )}

          {isDeckLevel && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Sugerir novo card
                </Label>
                <Switch checked={suggestNewCard} onCheckedChange={setSuggestNewCard} />
              </div>

              {suggestNewCard && (
                <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div>
                    <Label className="mb-1.5 block text-xs">Frente (Pergunta)</Label>
                    <LazyRichEditor content={newCardFront} onChange={setNewCardFront} placeholder="Pergunta do novo card..." />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Verso (Resposta)</Label>
                    <LazyRichEditor content={newCardBack} onChange={setNewCardBack} placeholder="Resposta do novo card..." />
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="mb-1.5 block flex items-center gap-1.5">
              <TagIcon className="h-3.5 w-3.5" />
              Tags sugeridas
            </Label>
            <TagInput
              tags={suggestedTags}
              onAdd={(tag) => {
                if (typeof tag === 'string') return;
                setSuggestedTags(prev => [...prev, tag]);
              }}
              onRemove={(tagId) => setSuggestedTags(prev => prev.filter(t => t.id !== tagId))}
              placeholder="Adicionar ou remover tags..."
            />
            {currentDeckTags.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Tags atuais: {currentDeckTags.map(t => t.name).join(', ')}
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block">
              Razões para a mudança <span className="text-destructive">*</span>
            </Label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Descreva as razões da sua sugestão..."
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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
