import { useState, useRef, lazy, Suspense } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQueryClient } from '@tanstack/react-query';
import { Snowflake, Pencil, Sparkles, Loader2, ArrowLeft, Plus, Trash2, MessageSquareText, CheckSquare, PenLine, MessageCircle, MoreVertical, Flag, ImageIcon, Shovel, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CardEditorDialog } from '@/components/manage-deck/CardEditorDialog';
import { freezeCard as freezeCardService, burySingleCard, patchCard } from '@/services/card/cardMutations';
import { fetchClozeSiblings } from '@/services/card/cardQueries';
import { enhanceCard } from '@/services/card/cardAI';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import { OCCLUSION_COLORS } from '@/lib/occlusionColors';
import * as cardService from '@/services/cardService';

interface StudyCardActionsProps {
  card: {
    id: string;
    front_content: string;
    back_content: string;
    card_type: string;
    deck_id: string;
  };
  isLiveDeck?: boolean;
  /** cardId is the card that was actually edited (uses the ID captured at open time, not the current card) */
  onCardUpdated: (cardId: string, updatedFields: { front_content: string; back_content: string }) => void;
  onCardFrozen: (cardId: string) => void;
  onCardBuried?: (cardId: string) => void;
  /** Called after cloze sibling edits so Study.tsx can update all siblings in localQueue */
  onSiblingsUpdated?: (updates: { id: string; front_content: string; back_content: string }[], deletedIds: string[]) => void;
  onOpenChat?: () => void;
  chatHasMessages?: boolean;
}

type EditorCardType = 'basic' | 'cloze' | 'image_occlusion';

const StudyCardActions = ({ card, isLiveDeck, onCardUpdated, onCardFrozen, onCardBuried, onSiblingsUpdated, onOpenChat, chatHasMessages }: StudyCardActionsProps) => {
  const queryClient = useQueryClient();
  const { energy, spendEnergy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  const [buryConfirmOpen, setBuryConfirmOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editorType, setEditorType] = useState<EditorCardType | null>('basic');
  const [mcOptions, setMcOptions] = useState<string[]>([]);
  const [mcCorrectIndex, setMcCorrectIndex] = useState(0);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConvertingMC, setIsConvertingMC] = useState(false);
  // Track if current card being edited is MC type
  const isEditingMCRef = useRef(false);

  // AI improve state
  const [isImproving, setIsImproving] = useState(false);
  const [improvePreview, setImprovePreview] = useState<{ front: string; back: string } | null>(null);
  const [improveModalOpen, setImproveModalOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  // Capture FULL card snapshot at edit-open time to prevent stale references
  const editCardIdRef = useRef<string>(card.id);
  const editCardDeckIdRef = useRef<string>(card.deck_id);
  const editCardTypeRef = useRef<string>(card.card_type);
  const editCardBackRef = useRef<string>(card.back_content);
  // Store original front_content to find siblings
  const originalFrontRef = useRef<string>('');

  const resetForm = () => {
    setFront(''); setBack('');
    setEditorType('basic');
    setMcOptions([]); setMcCorrectIndex(0);
    isEditingMCRef.current = false;
  };

  const openEdit = async () => {
    setEditLoading(true);
    // Capture full snapshot at click time — these refs are stable throughout the edit session
    editCardIdRef.current = card.id;
    editCardDeckIdRef.current = card.deck_id;
    editCardTypeRef.current = card.card_type;
    editCardBackRef.current = card.back_content;
    originalFrontRef.current = card.front_content;
    // Preload the RichEditor chunk
    try { await import('@/components/RichEditor'); } catch {}

    if (card.card_type === 'multiple_choice') {
      isEditingMCRef.current = true;
      setEditorType('basic');
      setFront(card.front_content);
      setMcOptions([]); // Don't pass MC options to editor — we show convert button instead
      setMcCorrectIndex(0);
      try {
        const data = JSON.parse(card.back_content);
        const correctAnswer = data.options?.[data.correctIndex ?? 0] || '';
        setBack(correctAnswer); // Show correct answer as the back content
      } catch {
        setBack(card.back_content);
      }
    } else if (card.card_type === 'cloze') {
      setEditorType('basic');
      setFront(card.front_content);
      try {
        const parsed = JSON.parse(card.back_content);
        if (typeof parsed.clozeTarget === 'number') {
          setBack(parsed.extra || '');
        } else {
          setBack(card.back_content);
        }
      } catch {
        setBack(card.back_content);
      }
    } else if (card.card_type === 'image_occlusion') {
      setEditorType('basic');
      // front is the JSON with imageUrl, allRects, etc. — pass as-is
      setFront(card.front_content);
      setBack(card.back_content);
    } else {
      setEditorType('basic');
      setFront(card.front_content);
      setBack(card.back_content);
    }
    setEditLoading(false);
    setEditOpen(true);
  };

  const handleFreeze = async () => {
    try {
      await freezeCardService(card.id);
      toast({ title: '❄️ Card congelado', description: 'Este card não aparecerá mais nas revisões.' });
      setFreezeConfirmOpen(false);
      onCardFrozen(card.id);
    } catch {
      toast({ title: 'Erro ao congelar card', variant: 'destructive' });
    }
  };

  const handleBury = async () => {
    try {
      await burySingleCard(card.id);
      toast({ title: '⛏️ Card enterrado', description: 'Ele voltará amanhã.' });
      setBuryConfirmOpen(false);
      onCardBuried?.(card.id);
    } catch {
      toast({ title: 'Erro ao enterrar card', variant: 'destructive' });
    }
  };

  const addMcOption = () => {
    if (mcOptions.length < 6) setMcOptions([...mcOptions, '']);
  };
  const removeMcOption = (idx: number) => {
    if (mcOptions.length <= 2) return;
    const newOpts = mcOptions.filter((_, i) => i !== idx);
    setMcOptions(newOpts);
    if (mcCorrectIndex >= newOpts.length) setMcCorrectIndex(newOpts.length - 1);
    else if (mcCorrectIndex === idx) setMcCorrectIndex(0);
    else if (mcCorrectIndex > idx) setMcCorrectIndex(mcCorrectIndex - 1);
  };

  /** Main save handler — handles all card types with proper sibling reconciliation */
  const handleSave = async (_addAnother: boolean) => {
    // Detect card type from content
    let hasOcclusionImage = false;
    let occlusionImageUrl = '';
    try {
      const d = JSON.parse(front);
      if (d && typeof d === 'object' && ('imageUrl' in d || 'allRects' in d)) {
        hasOcclusionImage = true;
        occlusionImageUrl = d.imageUrl || '';
      }
    } catch {}

    const plainText = front.replace(/<[^>]*>/g, '');
    const hasCloze = plainText.includes('{{c');
    const detectedType = hasOcclusionImage ? 'image_occlusion' : hasCloze ? 'cloze' : 'basic';

    if (detectedType === 'basic' && !front.trim()) {
      toast({ title: 'Preencha a pergunta', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (detectedType === 'image_occlusion') {
        await handleSaveImageOcclusion();
      } else if (detectedType === 'cloze') {
        await handleSaveCloze();
      } else {
        // Basic save — just update content, created_at is NOT touched
        await cardService.updateCard(editCardIdRef.current, front, back);
        onCardUpdated(editCardIdRef.current, { front_content: front, back_content: back });
      }
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      toast({ title: 'Cartão atualizado!' });
      setEditOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  /** Save image occlusion with sibling reconciliation */
  const handleSaveImageOcclusion = async () => {
    let frontData: Record<string, unknown>;
    try {
      frontData = JSON.parse(front);
    } catch {
      throw new Error('Dados de oclusão inválidos');
    }

    const allRects = (frontData.allRects as Array<{ id: string; color?: string }>) || [];
    if (!frontData.imageUrl || allRects.length === 0) {
      throw new Error('Adicione a imagem e pelo menos uma oclusão');
    }

    // Build color groups to determine unique cloze numbers
    const colorGroups: Record<string, string[]> = {};
    allRects.forEach((r) => {
      const color = r.color || OCCLUSION_COLORS[0].fill;
      if (!colorGroups[color]) colorGroups[color] = [];
      colorGroups[color].push(r.id);
    });

    const allNums = Object.keys(colorGroups).map((_, i) => i + 1);
    const userBack = back;

    // Also merge text cloze nums from frontText
    const frontText = (frontData as Record<string, unknown>).frontText as string | undefined;
    if (frontText) {
      const textPlain = frontText.replace(/<[^>]*>/g, '');
      const textNums = [...textPlain.matchAll(/\{\{c(\d+)::/g)].map(m => parseInt(m[1]));
      textNums.forEach(n => { if (!allNums.includes(n)) allNums.push(n); });
      allNums.sort((a, b) => a - b);
    }

    // Update frontData with colorGroups
    frontData.colorGroups = colorGroups;
    frontData.activeRectIds = allRects.map(r => r.id);
    const frontStr = JSON.stringify(frontData);

    // Fetch existing siblings
    const allSiblingCards = await fetchClozeSiblings([editCardDeckIdRef.current], originalFrontRef.current);
    const existingTargets = new Map<number, string>();
    allSiblingCards.forEach(c => {
      try {
        const parsed = JSON.parse(c.back_content);
        if (typeof parsed.clozeTarget === 'number') {
          existingTargets.set(parsed.clozeTarget, c.id);
          return;
        }
      } catch {}
      const assignedNum = allNums.find(n => !existingTargets.has(n)) ?? 1;
      existingTargets.set(assignedNum, c.id);
    });

    const existingNums = [...existingTargets.keys()];
    const numsToKeep = allNums.filter(n => existingTargets.has(n));
    const numsToAdd = allNums.filter(n => !existingTargets.has(n));
    const numsToRemove = existingNums.filter(n => !allNums.includes(n));

    const updatePromises = numsToKeep.map(n => {
      const cardId = existingTargets.get(n)!;
      return cardService.updateCard(cardId, frontStr, JSON.stringify({ clozeTarget: n, extra: userBack }));
    });
    const deletePromises = numsToRemove.map(n => {
      const cardId = existingTargets.get(n)!;
      return cardService.deleteCard(cardId);
    });

    await Promise.all([...updatePromises, ...deletePromises]);
    if (numsToAdd.length > 0) {
      await cardService.createCards(editCardDeckIdRef.current, numsToAdd.map(n => ({
        frontContent: frontStr,
        backContent: JSON.stringify({ clozeTarget: n, extra: userBack }),
        cardType: 'image_occlusion',
      })));
    }

    // Notify study queue
    const updatedSiblings = numsToKeep.map(n => ({
      id: existingTargets.get(n)!,
      front_content: frontStr,
      back_content: JSON.stringify({ clozeTarget: n, extra: userBack }),
    }));
    const deletedIds = numsToRemove.map(n => existingTargets.get(n)!);
    onCardUpdated(editCardIdRef.current, { front_content: frontStr, back_content: JSON.stringify({ clozeTarget: numsToKeep[0] ?? 1, extra: userBack }) });
    onSiblingsUpdated?.(updatedSiblings, deletedIds);
  };

  /** Save cloze with sibling reconciliation */
  const handleSaveCloze = async () => {
    const plainForNumbers = front.replace(/<[^>]*>/g, '');
    const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
    let uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

    // Also check for image occlusion colors in front JSON
    try {
      const parsed = JSON.parse(front);
      if (parsed.allRects) {
        const colorGroups: Record<string, string[]> = {};
        (parsed.allRects as Array<{ id: string; color?: string }>).forEach(r => {
          const color = r.color || OCCLUSION_COLORS[0].fill;
          if (!colorGroups[color]) colorGroups[color] = [];
          colorGroups[color].push(r.id);
        });
        Object.keys(colorGroups).forEach((_, i) => {
          if (!uniqueNums.includes(i + 1)) uniqueNums.push(i + 1);
        });
        uniqueNums.sort((a, b) => a - b);
      }
    } catch {}

    if (uniqueNums.length === 0) uniqueNums = [1];

    // Fetch all cloze siblings from DB
    const allSiblingCards = await fetchClozeSiblings([editCardDeckIdRef.current], originalFrontRef.current);

    const existingTargets = new Map<number, string>();
    allSiblingCards.forEach(c => {
      try {
        const parsed = JSON.parse(c.back_content);
        if (typeof parsed.clozeTarget === 'number') {
          existingTargets.set(parsed.clozeTarget, c.id);
          return;
        }
      } catch {}
      const assignedNum = uniqueNums.find(n => !existingTargets.has(n)) ?? 1;
      existingTargets.set(assignedNum, c.id);
    });

    const existingNums = [...existingTargets.keys()];
    const numsToKeep = uniqueNums.filter(n => existingTargets.has(n));
    const numsToAdd = uniqueNums.filter(n => !existingTargets.has(n));
    const numsToRemove = existingNums.filter(n => !uniqueNums.includes(n));

    // Update existing siblings with new front_content (created_at is NOT changed)
    const updatePromises = numsToKeep.map(n => {
      const cardId = existingTargets.get(n)!;
      return cardService.updateCard(cardId, front, JSON.stringify({ clozeTarget: n, extra: back }));
    });

    // Delete orphaned siblings — they lose their FSRS data
    const deletePromises = numsToRemove.map(n => {
      const cardId = existingTargets.get(n)!;
      return cardService.deleteCard(cardId);
    });

    await Promise.all([...updatePromises, ...deletePromises]);

    // Create new cards for added cloze numbers
    if (numsToAdd.length > 0) {
      await cardService.createCards(editCardDeckIdRef.current, numsToAdd.map(n => ({
        frontContent: front,
        backContent: JSON.stringify({ clozeTarget: n, extra: back }),
        cardType: 'cloze',
      })));
    }

    // Notify study queue about sibling changes
    const updatedSiblings = numsToKeep.map(n => ({
      id: existingTargets.get(n)!,
      front_content: front,
      back_content: JSON.stringify({ clozeTarget: n, extra: back }),
    }));
    const deletedIds = numsToRemove.map(n => existingTargets.get(n)!);

    // Update the current card being studied — use captured back_content from open time
    const currentBack = (() => {
      try {
        const parsed = JSON.parse(editCardBackRef.current);
        if (typeof parsed.clozeTarget === 'number') {
          return JSON.stringify({ clozeTarget: parsed.clozeTarget, extra: back });
        }
      } catch {}
      return JSON.stringify({ clozeTarget: 1, extra: back });
    })();
    onCardUpdated(editCardIdRef.current, { front_content: front, back_content: currentBack });
    onSiblingsUpdated?.(updatedSiblings, deletedIds);
  };

  // AI Improve
  const handleImprove = async () => {
    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    if (!strippedFront) {
      toast({ title: 'Escreva algo no card primeiro', variant: 'destructive' });
      return;
    }
    if (energy < 1) {
      toast({ title: 'Créditos insuficientes', description: 'Você precisa de 1 crédito IA.', variant: 'destructive' });
      return;
    }

    setIsImproving(true);
    try {
      const data = await enhanceCard({
        front, back, cardType: 'basic', aiModel: model, energyCost: 1,
      });

      if (data.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      if (data.unchanged) { toast({ title: '✨ Este card já está ótimo!', description: 'Não há melhorias a fazer.' }); return; }

      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setImprovePreview({ front: data.front, back: data.back });
      setImproveModalOpen(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast({ title: 'Erro ao melhorar card', description: msg, variant: 'destructive' });
    } finally {
      setIsImproving(false);
    }
  };

  const applyImprovement = async () => {
    if (!improvePreview) return;
    setFront(improvePreview.front);
    setBack(improvePreview.back);

    try {
      await patchCard(editCardIdRef.current, { front_content: improvePreview.front, back_content: improvePreview.back });
      onCardUpdated(editCardIdRef.current, { front_content: improvePreview.front, back_content: improvePreview.back });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch {
      // silent – editor still has values
    }

    setImproveModalOpen(false);
    setImprovePreview(null);
    toast({ title: 'Melhoria aplicada e salva!' });
  };

  /** Convert MC card to cloze using AI */
  const handleConvertMCToCloze = async () => {
    if (energy < 1) {
      toast({ title: 'Créditos insuficientes', description: 'Você precisa de 1 crédito IA.', variant: 'destructive' });
      return;
    }

    // Extract question and correct answer from current state
    const question = front.replace(/<[^>]*>/g, '').trim();
    const correctAnswer = back.replace(/<[^>]*>/g, '').trim();
    if (!question || !correctAnswer) {
      toast({ title: 'Card sem conteúdo suficiente', variant: 'destructive' });
      return;
    }

    setIsConvertingMC(true);
    try {
      const customPrompt = `Converta este cartão de múltipla escolha em um cartão CLOZE de alta qualidade.

INFORMAÇÕES DO CARTÃO:
- Pergunta: ${question}
- Resposta correta: ${correctAnswer}

REGRAS:
1. Use APENAS a pergunta e a resposta correta. NÃO use alternativas erradas.
2. Crie uma AFIRMAÇÃO DECLARATIVA COMPLETA que incorpore naturalmente a resposta como uma lacuna {{c1::resposta}}.
3. A frase deve fazer sentido quando lida por completo e ser respondível quando a lacuna está oculta.
4. A lacuna deve conter o CONCEITO-CHAVE (a resposta correta), nunca palavras triviais.
5. NÃO adicione informações que não estão no cartão original.
6. O campo "back" deve ficar VAZIO (será gerado automaticamente pelo sistema de cloze).
7. Use HTML simples se necessário.

Retorne o front com a sintaxe {{c1::resposta}} e back vazio.`;

      const data = await enhanceCard({
        front: question,
        back: correctAnswer,
        cardType: 'basic',
        aiModel: model,
        energyCost: 1,
        customPrompt,
      });

      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['profile'] });

      // Apply the cloze conversion
      const newFront = data.front || front;
      const newBack = ''; // Cloze back is managed by sibling system

      setFront(newFront);
      setBack(newBack);
      isEditingMCRef.current = false;

      // Save immediately — update card type to cloze
      await patchCard(editCardIdRef.current, {
        front_content: newFront,
        back_content: JSON.stringify({ clozeTarget: 1, extra: '' }),
        card_type: 'cloze',
      });
      onCardUpdated(editCardIdRef.current, {
        front_content: newFront,
        back_content: JSON.stringify({ clozeTarget: 1, extra: '' }),
      });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      toast({ title: '✨ Convertido para Cloze!' });
      setEditOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast({ title: 'Erro ao converter', description: msg, variant: 'destructive' });
    } finally {
      setIsConvertingMC(false);
    }
  };

  return (
    <>
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {onOpenChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenChat}
                className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  chatHasMessages
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                }`}
                aria-label="Chat com IA"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {chatHasMessages && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent><p>{chatHasMessages ? 'Ver explicação gerada' : 'Chat com IA'}</p></TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setBuryConfirmOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Enterrar card"
            >
              <Shovel className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Enterrar (pular hoje)</p></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setFreezeConfirmOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Congelar card"
            >
              <Snowflake className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Congelar card</p></TooltipContent>
        </Tooltip>

        {isLiveDeck ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSuggestOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label="Sugerir correção"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Sugerir correção</p></TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={openEdit}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label="Editar cartão"
                disabled={editLoading}
              >
                {editLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Editar cartão</p></TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Freeze confirm */}
      <AlertDialog open={freezeConfirmOpen} onOpenChange={setFreezeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>❄️ Congelar este card?</AlertDialogTitle>
            <AlertDialogDescription>
              O card não aparecerá mais nas sessões de estudo. Você pode descongelá-lo depois na página de gerenciamento do baralho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFreeze}>Congelar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bury confirm */}
      <AlertDialog open={buryConfirmOpen} onOpenChange={setBuryConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⛏️ Enterrar este card?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Enterrar</strong> significa pular o card por hoje. Ele será removido desta sessão e voltará amanhã automaticamente. É diferente de congelar — o card continua ativo no seu baralho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBury}>Enterrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Card Editor Dialog — uses the same standard layout as ManageDeck */}
      <CardEditorDialog
        editorOpen={editOpen}
        setEditorOpen={setEditOpen}
        editingId={editCardIdRef.current}
        editorType={editorType}
        setEditorType={setEditorType}
        front={front}
        setFront={setFront}
        back={back}
        setBack={setBack}
        mcOptions={mcOptions}
        setMcOptions={setMcOptions}
        mcCorrectIndex={mcCorrectIndex}
        setMcCorrectIndex={setMcCorrectIndex}
        isSaving={isSaving}
        isImproving={isImproving}
        occlusionModalOpen={occlusionModalOpen}
        setOcclusionModalOpen={setOcclusionModalOpen}
        resetForm={resetForm}
        handleSave={handleSave}
        handleImprove={handleImprove}
        addMcOption={addMcOption}
        removeMcOption={removeMcOption}
      />

      {/* AI Improve preview dialog */}
      <Dialog open={improveModalOpen} onOpenChange={setImproveModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Sugestão da IA
            </DialogTitle>
          </DialogHeader>
          {improvePreview && (
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Frente melhorada</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.front) }} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Verso melhorado</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.back) }} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImproveModalOpen(false); setImprovePreview(null); }}>Descartar</Button>
                <Button onClick={applyImprovement} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Aplicar Melhoria
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
};

export default StudyCardActions;
