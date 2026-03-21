import { useState, useRef, lazy, Suspense } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, Sparkles, Loader2, ArrowLeft, Plus, Trash2, MessageSquareText, CheckSquare, PenLine, MessageCircle, MoreVertical, Flag, ImageIcon, Clock, StickyNote } from 'lucide-react';
import { IconAIGradient } from '@/components/icons';
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
  onSiblingsUpdated?: (
    updates: { id: string; front_content: string; back_content: string }[],
    deletedIds: string[],
    replacementForActiveCard?: { id: string; front_content: string; back_content: string } | null,
  ) => void;
  onOpenChat?: () => void;
  chatHasMessages?: boolean;
}

type EditorCardType = 'basic' | 'cloze' | 'image_occlusion';

function parseClozeTarget(backContent: string): number {
  try {
    const parsed = JSON.parse(backContent);
    return typeof parsed.clozeTarget === 'number' ? parsed.clozeTarget : 1;
  } catch {
    return 1;
  }
}

const BURY_DISMISS_KEY = 'memo_bury_dismiss_until';
const FREEZE_DISMISS_KEY = 'memo_freeze_dismiss_until';

function isDismissed(key: string): boolean {
  const val = localStorage.getItem(key);
  if (!val) return false;
  return Date.now() < parseInt(val, 10);
}

function dismiss(key: string) {
  localStorage.setItem(key, String(Date.now() + 30 * 86400000));
}

const StudyCardActions = ({ card, isLiveDeck, onCardUpdated, onCardFrozen, onCardBuried, onSiblingsUpdated, onOpenChat, chatHasMessages }: StudyCardActionsProps) => {
  const queryClient = useQueryClient();
  const { energy, spendEnergy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  const [buryConfirmOpen, setBuryConfirmOpen] = useState(false);
  const [buryDismissCheck, setBuryDismissCheck] = useState(false);
  const [freezeDismissCheck, setFreezeDismissCheck] = useState(false);
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
      toast({ title: 'Cartão suspenso', description: 'Ele não entrará na fila de estudo até ser reativado.' });
      setFreezeConfirmOpen(false);
      if (freezeDismissCheck) dismiss(FREEZE_DISMISS_KEY);
      onCardFrozen(card.id);
    } catch {
      toast({ title: 'Erro ao suspender card', variant: 'destructive' });
    }
  };

  const handleBury = async () => {
    try {
      await burySingleCard(card.id);
      toast({ title: 'Cartão enterrado', description: 'Retorna pra sua fila de estudo amanhã.' });
      setBuryConfirmOpen(false);
      if (buryDismissCheck) dismiss(BURY_DISMISS_KEY);
      onCardBuried?.(card.id);
    } catch {
      toast({ title: 'Erro ao enterrar card', variant: 'destructive' });
    }
  };

  const handleBuryClick = () => {
    if (isDismissed(BURY_DISMISS_KEY)) {
      handleBury();
    } else {
      setBuryDismissCheck(false);
      setBuryConfirmOpen(true);
    }
  };

  const handleFreezeClick = () => {
    if (isDismissed(FREEZE_DISMISS_KEY)) {
      handleFreeze();
    } else {
      setFreezeDismissCheck(false);
      setFreezeConfirmOpen(true);
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
    let normalizedFront = front;
    let hasOcclusionImage = false;
    try {
      const d = JSON.parse(front);
      if (d && typeof d === 'object' && ('imageUrl' in d || 'allRects' in d)) {
        const imageUrl = typeof d.imageUrl === 'string' ? d.imageUrl : '';
        const rects = Array.isArray(d.allRects)
          ? d.allRects
          : Array.isArray(d.rects)
            ? d.rects
            : [];
        const frontText = typeof d.frontText === 'string' ? d.frontText : '';

        if (imageUrl && rects.length > 0) {
          hasOcclusionImage = true;
        } else {
          normalizedFront = `${frontText}${imageUrl ? `<img src="${imageUrl}">` : ''}`;
        }
      }
    } catch {}

    const plainText = normalizedFront.replace(/<[^>]*>/g, '');
    const hasCloze = plainText.includes('{{c');
    const detectedType = hasOcclusionImage ? 'image_occlusion' : hasCloze ? 'cloze' : 'basic';

    if (detectedType === 'basic' && !plainText.trim()) {
      toast({ title: 'Preencha a pergunta', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (detectedType === 'image_occlusion') {
        await handleSaveImageOcclusion(front, back);
      } else if (detectedType === 'cloze') {
        await handleSaveCloze(normalizedFront, back);
      } else {
        await handleSaveBasic(normalizedFront, back);
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

  const handleSaveBasic = async (frontContent: string, backContent: string) => {
    if (editCardTypeRef.current === 'cloze' || editCardTypeRef.current === 'image_occlusion') {
      const allSiblingCards = await fetchClozeSiblings([editCardDeckIdRef.current], originalFrontRef.current);
      const deleteIds = allSiblingCards
        .filter(c => c.id !== editCardIdRef.current)
        .map(c => c.id);

      await Promise.all([
        patchCard(editCardIdRef.current, {
          front_content: frontContent,
          back_content: backContent,
          card_type: 'basic',
        }),
        ...deleteIds.map(id => cardService.deleteCardWithReviewLogs(id)),
      ]);

      onCardUpdated(editCardIdRef.current, { front_content: frontContent, back_content: backContent });
      onSiblingsUpdated?.([
        { id: editCardIdRef.current, front_content: frontContent, back_content: backContent },
      ], deleteIds, null);
      return;
    }

    await patchCard(editCardIdRef.current, {
      front_content: frontContent,
      back_content: backContent,
      card_type: 'basic',
    });
    onCardUpdated(editCardIdRef.current, { front_content: frontContent, back_content: backContent });
  };

  /** Save image occlusion with sibling reconciliation */
  const handleSaveImageOcclusion = async (frontContent: string, userBack: string) => {
    let frontData: Record<string, unknown>;
    try {
      frontData = JSON.parse(frontContent);
    } catch {
      throw new Error('Dados de oclusão inválidos');
    }

    const allRects = (frontData.allRects as Array<{ id: string; color?: string }>) || [];
    if (!frontData.imageUrl || allRects.length === 0) {
      throw new Error('Adicione a imagem e pelo menos uma oclusão');
    }

    // Build color groups and preserve permanent color → cloze mapping
    const colorGroups: Record<string, string[]> = {};
    const imageNums = new Set<number>();
    allRects.forEach((r) => {
      const color = r.color || OCCLUSION_COLORS[0].fill;
      if (!colorGroups[color]) colorGroups[color] = [];
      colorGroups[color].push(r.id);
      const colorIndex = OCCLUSION_COLORS.findIndex(c => c.fill === color);
      imageNums.add(colorIndex >= 0 ? colorIndex + 1 : 1);
    });

    const allNums = [...imageNums].sort((a, b) => a - b);

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
    const baseCreatedAt = allSiblingCards.find(c => c.id === editCardIdRef.current)?.created_at;
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
    const activeCardId = editCardIdRef.current;
    const activeTarget = parseClozeTarget(editCardBackRef.current);

    // Build updated siblings — prefer keeping the active card alive by reassigning
    const updatedSiblings: { id: string; front_content: string; back_content: string }[] = [];
    let replacementForActiveCard: { id: string; front_content: string; back_content: string } | null = null;
    const remainingNumsToAdd = [...numsToAdd];

    if (numsToRemove.includes(activeTarget)) {
      if (remainingNumsToAdd.length > 0) {
        const reassignedTarget = remainingNumsToAdd.shift()!;
        updatedSiblings.push({
          id: activeCardId,
          front_content: frontStr,
          back_content: JSON.stringify({ clozeTarget: reassignedTarget, extra: userBack }),
        });
      } else {
        const survivingTarget = numsToKeep.find(n => existingTargets.get(n) !== activeCardId);
        if (survivingTarget) {
          replacementForActiveCard = {
            id: existingTargets.get(survivingTarget)!,
            front_content: frontStr,
            back_content: JSON.stringify({ clozeTarget: survivingTarget, extra: userBack }),
          };
        }
      }
    }

    for (const n of numsToKeep) {
      const cardId = existingTargets.get(n)!;
      if (updatedSiblings.some(u => u.id === cardId)) continue;
      updatedSiblings.push({
        id: cardId,
        front_content: frontStr,
        back_content: JSON.stringify({ clozeTarget: n, extra: userBack }),
      });
    }

    const deleteIds = numsToRemove
      .map(n => existingTargets.get(n)!)
      .filter(id => !updatedSiblings.some(update => update.id === id));

    const updatePromises = updatedSiblings.map(update =>
      cardService.updateCard(update.id, update.front_content, update.back_content)
    );
    const deletePromises = deleteIds.map(id => cardService.deleteCardWithReviewLogs(id));

    await Promise.all([...updatePromises, ...deletePromises]);
    if (remainingNumsToAdd.length > 0) {
      await cardService.createCards(editCardDeckIdRef.current, remainingNumsToAdd.map(n => ({
        frontContent: frontStr,
        backContent: JSON.stringify({ clozeTarget: n, extra: userBack }),
        cardType: 'image_occlusion',
      })), baseCreatedAt);
    }

    const activeUpdate = updatedSiblings.find(update => update.id === activeCardId);
    if (activeUpdate) {
      onCardUpdated(activeUpdate.id, {
        front_content: activeUpdate.front_content,
        back_content: activeUpdate.back_content,
      });
    }

    onSiblingsUpdated?.(updatedSiblings, deleteIds, replacementForActiveCard);
  };

  /** Save cloze with sibling reconciliation */
  const handleSaveCloze = async (frontContent: string, userBack: string) => {
    const plainForNumbers = frontContent.replace(/<[^>]*>/g, '');
    const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
    let uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

    // Also check for image occlusion colors in front JSON
    try {
      const parsed = JSON.parse(frontContent);
      if (parsed.allRects) {
        const imageNums = new Set<number>();
        (parsed.allRects as Array<{ id: string; color?: string }>).forEach(r => {
          const color = r.color || OCCLUSION_COLORS[0].fill;
          const colorIndex = OCCLUSION_COLORS.findIndex(c => c.fill === color);
          imageNums.add(colorIndex >= 0 ? colorIndex + 1 : 1);
        });
        imageNums.forEach(n => {
          if (!uniqueNums.includes(n)) uniqueNums.push(n);
        });
        uniqueNums.sort((a, b) => a - b);
      }
    } catch {}

    if (uniqueNums.length === 0) uniqueNums = [1];

    // Fetch all cloze siblings from DB
    const allSiblingCards = await fetchClozeSiblings([editCardDeckIdRef.current], originalFrontRef.current);
    const baseCreatedAt = allSiblingCards.find(c => c.id === editCardIdRef.current)?.created_at;

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
    const activeCardId = editCardIdRef.current;
    const activeTarget = parseClozeTarget(editCardBackRef.current);

    // Build updated siblings list — prefer keeping the active card alive by reassigning its target
    const updatedSiblings: { id: string; front_content: string; back_content: string }[] = [];
    let replacementForActiveCard: { id: string; front_content: string; back_content: string } | null = null;
    const remainingNumsToAdd = [...numsToAdd];

    if (numsToRemove.includes(activeTarget)) {
      // Active card's target is being removed — reassign it to a surviving or new target
      // First, try to reassign to a target that would otherwise need a NEW card
      if (remainingNumsToAdd.length > 0) {
        const reassignedTarget = remainingNumsToAdd.shift()!;
        updatedSiblings.push({
          id: activeCardId,
          front_content: frontContent,
          back_content: JSON.stringify({ clozeTarget: reassignedTarget, extra: userBack }),
        });
      } else {
        // No new targets available — the active card's color was merged into an existing one
        // Find the surviving sibling to use as replacement
        const survivingTarget = numsToKeep.find(n => existingTargets.get(n) !== activeCardId);
        if (survivingTarget) {
          replacementForActiveCard = {
            id: existingTargets.get(survivingTarget)!,
            front_content: frontContent,
            back_content: JSON.stringify({ clozeTarget: survivingTarget, extra: userBack }),
          };
        }
      }
    }

    // Add all surviving targets (excluding active card if already handled)
    for (const n of numsToKeep) {
      const cardId = existingTargets.get(n)!;
      if (updatedSiblings.some(u => u.id === cardId)) continue; // already handled
      updatedSiblings.push({
        id: cardId,
        front_content: frontContent,
        back_content: JSON.stringify({ clozeTarget: n, extra: userBack }),
      });
    }

    const deleteIds = numsToRemove
      .map(n => existingTargets.get(n)!)
      .filter(id => !updatedSiblings.some(update => update.id === id));

    // Update existing siblings with new front_content (created_at is NOT changed)
    const updatePromises = updatedSiblings.map(update =>
      cardService.updateCard(update.id, update.front_content, update.back_content)
    );

    // Delete orphaned siblings — they lose their FSRS data
    const deletePromises = deleteIds.map(id => cardService.deleteCardWithReviewLogs(id));

    await Promise.all([...updatePromises, ...deletePromises]);

    // Create new cards for added cloze numbers
    if (remainingNumsToAdd.length > 0) {
      await cardService.createCards(editCardDeckIdRef.current, remainingNumsToAdd.map(n => ({
        frontContent: frontContent,
        backContent: JSON.stringify({ clozeTarget: n, extra: userBack }),
        cardType: 'cloze',
      })), baseCreatedAt);
    }

    const activeUpdate = updatedSiblings.find(update => update.id === activeCardId);
    if (activeUpdate) {
      onCardUpdated(activeUpdate.id, {
        front_content: activeUpdate.front_content,
        back_content: activeUpdate.back_content,
      });
    }

    onSiblingsUpdated?.(updatedSiblings, deleteIds, replacementForActiveCard);
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
      const customPrompt = `Converta este cartão de múltipla escolha em um EXCELENTE cartão CLOZE, aplicando os princípios de formulação do conhecimento.

INFORMAÇÕES DO CARTÃO:
- Pergunta: ${question}
- Resposta correta: ${correctAnswer}

REGRAS OBRIGATÓRIAS:
1. Crie uma AFIRMAÇÃO DECLARATIVA COMPLETA e AUTOCONTIDA — nunca uma pergunta. A frase deve ser um fato que se sustenta sozinho.
2. A lacuna {{c1::resposta}} deve conter APENAS o conceito-chave (a resposta correta). Nunca oculte palavras triviais como artigos, preposições ou verbos auxiliares.
3. A frase deve fornecer CONTEXTO SUFICIENTE para que haja UMA ÚNICA resposta possível quando a lacuna está oculta. Se necessário, adicione contexto mínimo (ex: área do conhecimento, relação causal).
4. PROIBIDO copiar a pergunta original e simplesmente inserir a resposta. REFORMULE completamente em uma afirmação declarativa natural.
5. A frase completa (com a lacuna preenchida) deve soar como uma sentença de livro-texto — clara, direta, sem ambiguidade.
6. O campo "back" deve ficar VAZIO.
7. Use HTML simples (<b>, <i>) apenas se realmente necessário.

EXEMPLOS DE CONVERSÃO:
- Pergunta: "Qual hormônio regula a glicemia?" / Resposta: "Insulina"
  → Cloze: "O hormônio produzido pelas células beta do pâncreas que reduz a glicemia é a {{c1::insulina}}."

- Pergunta: "Qual a capital da França?" / Resposta: "Paris"
  → Cloze: "A capital da França é {{c1::Paris}}."

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
      const newBackContent = JSON.stringify({ clozeTarget: 1, extra: '' });
      await patchCard(editCardIdRef.current, {
        front_content: newFront,
        back_content: newBackContent,
        card_type: 'cloze',
      });
      onCardUpdated(editCardIdRef.current, {
        front_content: newFront,
        back_content: newBackContent,
      });
      // Also update siblings so the study queue reflects the change
      onSiblingsUpdated?.([
        { id: editCardIdRef.current, front_content: newFront, back_content: newBackContent },
      ], [], null);
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
              onClick={handleBuryClick}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Enterrar card"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Enterrar (pular hoje)</p></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleFreezeClick}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Suspender card"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Suspender card</p></TooltipContent>
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
        extraContent={isEditingMCRef.current ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Este cartão é de <span className="font-semibold text-foreground">múltipla escolha</span>. 
              Converta-o para <span className="font-semibold text-foreground">cloze</span> para melhor memorização.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConvertMCToCloze}
              disabled={isConvertingMC}
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              {isConvertingMC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IconAIGradient className="h-3.5 w-3.5" />}
              {isConvertingMC ? 'Convertendo...' : 'Converter para Cloze com IA'}
              <span className="text-[10px] text-muted-foreground ml-auto">1 crédito</span>
            </Button>
          </div>
        ) : undefined}
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
