import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2, Copy, Plus, Loader2, Check, X } from 'lucide-react';
import { IconAIGradient } from '@/components/icons';
import AICreateDeckDialog from '@/components/AICreateDeckDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as cardService from '@/services/cardService';
import { invalidateDeckRelatedQueries } from '@/lib/queryKeys';
import { OCCLUSION_COLORS } from '@/lib/occlusionColors';

import { Button } from '@/components/ui/button';
import { CardContent as CardPreviewContent, buildVirtualCards } from '@/components/deck-detail/CardPreviewSheet';
import type { CardRow } from '@/types/deck';
import { useCards } from '@/hooks/useCards';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import LazyRichEditor from '@/components/LazyRichEditor';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import OcclusionEditor from '@/components/manage-deck/OcclusionEditor';
import AttachmentPreviewModal from '@/components/manage-deck/AttachmentPreviewModal';
import { enhanceCard } from '@/services/card/cardAI';
import { markdownToHtml } from '@/lib/markdownToHtml';
import type { ImageAttachment } from '@/components/RichEditor';

const ManageDeck = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cards, isLoading, createCard, updateCard, deleteCard } = useCards(deckId ?? '');
  const { energy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAICreating, setIsAICreating] = useState(false);
  const [aiDeckDialogOpen, setAIDeckDialogOpen] = useState(false);

  const { data: deckName } = useQuery({
    queryKey: ['deck-name', deckId],
    queryFn: async () => {
      const { data } = await supabase.from('decks').select('name').eq('id', deckId!).single();
      return data?.name ?? '';
    },
    enabled: !!deckId,
  });

  const initialCardId = searchParams.get('cardId');
  const hasAppliedInitialCardRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingNewCardId, setPendingNewCardId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Image attachments stored separately from text
  const [frontAttachedImages, setFrontAttachedImages] = useState<string[]>([]);
  const [backAttachedImages, setBackAttachedImages] = useState<string[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<{ attachment: ImageAttachment; allowOcclusion: boolean } | null>(null);

  // Image occlusion state
  const [occlusionImageUrl, setOcclusionImageUrl] = useState('');
  const [occlusionRects, setOcclusionRects] = useState<any[]>([]);
  const [occlusionCanvasSize, setOcclusionCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);
  const prevNumsKeyRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);

  const sortedCards = useMemo(() => [...(cards ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [cards]);
  const currentCard = sortedCards[selectedIndex] ?? null;
  const totalCards = sortedCards.length;

  // Sibling groups: consecutive cards with same front_content and type cloze/image_occlusion
  const siblingMap = useMemo(() => {
    // Maps each card index → array of all sibling indices (including itself)
    const indexToGroup = new Map<number, number[]>();
    let i = 0;
    while (i < sortedCards.length) {
      const card = sortedCards[i];
      const isSiblingType = card.card_type === 'cloze' || card.card_type === 'image_occlusion';
      if (isSiblingType) {
        const group = [i];
        let j = i + 1;
        while (j < sortedCards.length && sortedCards[j].front_content === card.front_content && (sortedCards[j].card_type === 'cloze' || sortedCards[j].card_type === 'image_occlusion')) {
          group.push(j);
          j++;
        }
        if (group.length > 1) {
          group.forEach(idx => indexToGroup.set(idx, group));
        }
        i = j;
      } else {
        i++;
      }
    }
    return indexToGroup;
  }, [sortedCards]);

  // Apply URL card only once
  useEffect(() => {
    if (pendingNewCardId && sortedCards.length > 0) {
      const idx = sortedCards.findIndex(c => c.id === pendingNewCardId);
      if (idx >= 0) { setSelectedIndex(idx); setPendingNewCardId(null); }
      return;
    }
    if (!hasAppliedInitialCardRef.current && initialCardId && sortedCards.length > 0) {
      const idx = sortedCards.findIndex(c => c.id === initialCardId);
      if (idx >= 0) setSelectedIndex(idx);
      hasAppliedInitialCardRef.current = true;
    }
  }, [initialCardId, pendingNewCardId, sortedCards]);

  // Helper: extract <img> URLs from HTML and return clean text
  const extractImages = (html: string): { text: string; images: string[] } => {
    const images: string[] = [];
    const regex = /<img[^>]+src="([^"]+)"[^>]*\/?>/g;
    let m;
    while ((m = regex.exec(html)) !== null) images.push(m[1]);
    const text = html.replace(/<img[^>]+\/?>/g, '').replace(/<p>\s*<\/p>$/g, '');
    return { text, images };
  };

  // Load card content when selection changes
  useEffect(() => {
    if (!currentCard) return;
    const ct = (currentCard.card_type ?? 'basic') as string;
    let needsAutoSave = false;
    const loadedNums = new Set<number>();

    const collectTextNums = (value: string) => {
      const plain = value.replace(/<[^>]*>/g, '');
      [...plain.matchAll(/\{\{c(\d+)::/g)].forEach((m) => loadedNums.add(parseInt(m[1])));
    };

    const strippedFront = currentCard.front_content.replace(/<[^>]*>/g, '').trim();
    const looksLikeOcclusionJson = /^\s*\{.*"imageUrl"\s*:/.test(strippedFront);
    const isOcclusionContent = ct === 'image_occlusion' || looksLikeOcclusionJson;

    if (isOcclusionContent) {
      try {
        let data: any;
        try { data = JSON.parse(currentCard.front_content); }
        catch { data = JSON.parse(strippedFront); }
        const rects = data.allRects || data.rects || [];
        setOcclusionImageUrl(data.imageUrl || '');
        setOcclusionRects(rects);
        setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
        const { text, images } = extractImages(data.frontText || '');
        setFront(text);
        setFrontAttachedImages(images);
        collectTextNums(data.frontText || '');
        const usedColors = new Set(rects.map((r: { color?: string }) => r.color || OCCLUSION_COLORS[0].fill));
        usedColors.forEach((color) => {
          const idx = OCCLUSION_COLORS.findIndex(c => c.fill === color);
          if (idx >= 0) loadedNums.add(idx + 1);
        });
      } catch {
        setFront('');
        setOcclusionImageUrl('');
        setOcclusionRects([]);
        setFrontAttachedImages([]);
      }
      let backRaw = currentCard.back_content || '';
      try { const p = JSON.parse(backRaw); if (p && typeof p.clozeTarget === 'number') backRaw = p.extra || ''; } catch {}
      const { text: backText, images: backImgs } = extractImages(backRaw);
      setBack(backText);
      setBackAttachedImages(backImgs);
    } else {
      let clozeExtra = '';
      let backRaw = currentCard.back_content || '';
      try { const p = JSON.parse(backRaw); if (p && typeof p.clozeTarget === 'number') { clozeExtra = p.extra || ''; backRaw = clozeExtra; } } catch {}
      const frontVal = currentCard.front_content || '';
      const backPlain = backRaw.replace(/<[^>]*>/g, '');
      const frontPlain = frontVal.replace(/<[^>]*>/g, '');
      const frontHasCloze = /\{\{c\d+::/.test(frontPlain);
      const backHasCloze = /\{\{c\d+::/.test(backPlain);
      collectTextNums(frontVal);
      collectTextNums(backRaw);
      if (backHasCloze && !frontHasCloze) {
        const { text, images } = extractImages(backRaw);
        setFront(text); setBack(frontVal && frontVal !== '<p></p>' ? frontVal : '');
        setFrontAttachedImages(images);
        setBackAttachedImages([]);
        needsAutoSave = true;
      } else if (frontHasCloze) {
        const { text, images } = extractImages(frontVal);
        const resolvedBack = clozeExtra || (backRaw !== currentCard.back_content ? '' : backRaw);
        const { text: bText, images: bImgs } = extractImages(resolvedBack);
        setFront(text); setBack(bText);
        setFrontAttachedImages(images);
        setBackAttachedImages(bImgs);
      } else {
        const { text, images } = extractImages(frontVal);
        const { text: bText, images: bImgs } = extractImages(backRaw);
        setFront(text); setBack(bText);
        setFrontAttachedImages(images);
        setBackAttachedImages(bImgs);
      }
      setOcclusionImageUrl(''); setOcclusionRects([]); setOcclusionCanvasSize(null);
    }
    setIsDirty(needsAutoSave);
    prevNumsKeyRef.current = [...loadedNums].sort((a, b) => a - b).join(',');
  }, [currentCard?.id]);

  const detectCardType = useCallback((): string => {
    if (occlusionImageUrl) return 'image_occlusion';
    if (/\{\{c\d+::/.test(front.replace(/<[^>]*>/g, ''))) return 'cloze';
    return 'basic';
  }, [front, occlusionImageUrl]);

  /** Collect all unique card nums from text clozes AND image occlusion colors */
  const collectAllNums = useCallback(() => {
    const nums = new Set<number>();
    // From text cloze
    const plainText = front.replace(/<[^>]*>/g, '');
    const clozeMatches = [...plainText.matchAll(/\{\{c(\d+)::/g)];
    clozeMatches.forEach(m => nums.add(parseInt(m[1])));
    // From image occlusion colors
    if (occlusionRects.length > 0) {
      const usedColors = new Set(occlusionRects.map((r: { color?: string }) => r.color || OCCLUSION_COLORS[0].fill));
      usedColors.forEach(color => {
        const idx = OCCLUSION_COLORS.findIndex(c => c.fill === color);
        if (idx >= 0) nums.add(idx + 1);
      });
    }
    return [...nums].sort((a, b) => a - b);
  }, [front, occlusionRects]);

  const buildSavePayload = useCallback(() => {
    const detectedType = detectCardType();
    // Merge attached images back as <img> tags
    const frontImgTags = frontAttachedImages.map(url => `<img src="${url}">`).join('');
    const backImgTags = backAttachedImages.map(url => `<img src="${url}">`).join('');
    const frontWithImages = front + frontImgTags;
    let frontContent = frontWithImages;
    let backContent = back + backImgTags;
    if (detectedType === 'image_occlusion') {
      // Reconstruct colorGroups from rects
      const colorGroups: Record<string, string[]> = {};
      occlusionRects.forEach((r: { id: string; color?: string }) => {
        const color = r.color || OCCLUSION_COLORS[0].fill;
        if (!colorGroups[color]) colorGroups[color] = [];
        colorGroups[color].push(r.id);
      });
      frontContent = JSON.stringify({
        imageUrl: occlusionImageUrl, frontText: frontWithImages, rects: occlusionRects, allRects: occlusionRects,
        canvasWidth: occlusionCanvasSize?.w ?? 0, canvasHeight: occlusionCanvasSize?.h ?? 0,
        colorGroups,
      });
    }
    // Set clozeTarget from unified nums
    const allNums = collectAllNums();
    if (allNums.length > 0) {
      backContent = JSON.stringify({ clozeTarget: allNums[0] || 1, extra: back + backImgTags });
    }
    return { frontContent, backContent, cardType: detectedType };
  }, [front, back, frontAttachedImages, backAttachedImages, occlusionImageUrl, occlusionRects, occlusionCanvasSize, detectCardType, collectAllNums]);

  const saveCurrentCard = useCallback(async () => {
    if (!currentCard || !isDirty) return;
    if (isSavingRef.current) return; // prevent concurrent saves
    isSavingRef.current = true;

    try {
      const { frontContent, backContent, cardType } = buildSavePayload();
      const uniqueNums = collectAllNums();

      if (uniqueNums.length > 0 && (cardType === 'cloze' || cardType === 'image_occlusion')) {
        // Get sibling card IDs from memory (siblingMap) instead of querying by front_content
        const group = siblingMap.get(selectedIndex);
        const siblingCardIds: { id: string; clozeTarget: number }[] = [];

        if (group) {
          group.forEach(idx => {
            const c = sortedCards[idx];
            if (!c) return;
            let target = 1;
            try {
              const parsed = JSON.parse(c.back_content);
              if (typeof parsed.clozeTarget === 'number') target = parsed.clozeTarget;
            } catch {}
            siblingCardIds.push({ id: c.id, clozeTarget: target });
          });
        } else {
          // Current card is alone (no group yet)
          let target = 1;
          try {
            const parsed = JSON.parse(currentCard.back_content);
            if (typeof parsed.clozeTarget === 'number') target = parsed.clozeTarget;
          } catch {}
          siblingCardIds.push({ id: currentCard.id, clozeTarget: target });
        }

        // Strategy: assign nums to existing cards by position, create/delete as needed
        // Sort existing siblings by their current clozeTarget for stable assignment
        const sortedSiblings = [...siblingCardIds].sort((a, b) => a.clozeTarget - b.clozeTarget);

        const updatePromises: Promise<unknown>[] = [];
        const deleteIds: string[] = [];

        // Assign uniqueNums to existing siblings in order
        for (let i = 0; i < Math.max(sortedSiblings.length, uniqueNums.length); i++) {
          if (i < sortedSiblings.length && i < uniqueNums.length) {
            // Update existing card with (possibly new) clozeTarget
            const cardId = sortedSiblings[i].id;
            const backJson = JSON.stringify({ clozeTarget: uniqueNums[i], extra: back });
            updatePromises.push(cardService.updateCard(cardId, frontContent, backJson));
          } else if (i >= uniqueNums.length && i < sortedSiblings.length) {
            // Extra sibling — delete
            deleteIds.push(sortedSiblings[i].id);
          }
          // i >= sortedSiblings.length && i < uniqueNums.length → handled below as numsToAdd
        }

        const numsToAdd = uniqueNums.slice(sortedSiblings.length);

        const deletePromises = deleteIds.map(id => cardService.deleteCard(id));
        await Promise.all([...updatePromises, ...deletePromises]);

        // Create new siblings for any additional nums
        if (numsToAdd.length > 0) {
          const newCards = numsToAdd.map(n => ({
            frontContent,
            backContent: JSON.stringify({ clozeTarget: n, extra: back }),
            cardType,
          }));
          const lastSiblingIdx = group ? group[group.length - 1] : selectedIndex;
          const lastSiblingTime = sortedCards[lastSiblingIdx]?.created_at;
          const nextNonSiblingCard = sortedCards[lastSiblingIdx + 1];
          let baseCreatedAt: string;
          if (lastSiblingTime && nextNonSiblingCard) {
            const lastT = new Date(lastSiblingTime).getTime();
            const nextT = new Date(nextNonSiblingCard.created_at).getTime();
            const gap = nextT - lastT;
            baseCreatedAt = new Date(lastT + Math.min(gap * 0.1, 0.5)).toISOString();
          } else if (lastSiblingTime) {
            baseCreatedAt = new Date(new Date(lastSiblingTime).getTime() + 0.01).toISOString();
          } else {
            baseCreatedAt = currentCard.created_at;
          }
          await cardService.createCards(deckId!, newCards, baseCreatedAt);
        }

        invalidateDeckRelatedQueries(queryClient, deckId!);
        setIsDirty(false);
      } else {
        updateCard.mutate({ id: currentCard.id, frontContent, backContent }, { onSuccess: () => setIsDirty(false) });
      }
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      isSavingRef.current = false;
    }
  }, [currentCard, isDirty, buildSavePayload, updateCard, front, back, deckId, queryClient, toast, collectAllNums, siblingMap, selectedIndex, sortedCards]);

  // Auto-reconcile siblings when the set of unique nums changes (new color/cloze added/removed)
  const numsKey = useMemo(() => collectAllNums().join(','), [collectAllNums]);
  useEffect(() => {
    if (!currentCard || !isDirty) return;
    const prev = prevNumsKeyRef.current;
    prevNumsKeyRef.current = numsKey;
    if (prev !== null && prev !== numsKey) {
      saveCurrentCard();
    }
  }, [numsKey]); // intentionally minimal deps — we read latest via closure

  const selectCard = useCallback((idx: number) => {
    if (idx < 0 || idx >= totalCards) return;
    if (isDirty) saveCurrentCard();
    // If clicking on a sibling, snap to the first card of the group
    const group = siblingMap.get(idx);
    setSelectedIndex(group ? group[0] : idx);
  }, [isDirty, saveCurrentCard, totalCards, siblingMap]);

  const handleBack = useCallback(() => {
    if (isDirty) saveCurrentCard();
    navigate(`/decks/${deckId}`);
  }, [isDirty, saveCurrentCard, navigate, deckId]);

  const handleDelete = useCallback(() => {
    if (!currentCard) return;
    deleteCard.mutate(currentCard.id, {
      onSuccess: () => {
        setDeleteConfirmOpen(false);
        toast({ title: 'Cartão excluído' });
        if (selectedIndex >= totalCards - 1 && selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
      },
    });
  }, [currentCard, deleteCard, selectedIndex, totalCards, toast]);

  const handleAddCard = useCallback(() => {
    // If selected card belongs to a sibling group, insert after the LAST sibling
    const group = siblingMap.get(selectedIndex);
    const insertAfterIndex = group ? group[group.length - 1] : selectedIndex;

    let createdAt: string | undefined;
    if (sortedCards.length > 0 && insertAfterIndex >= 0) {
      const currentTime = new Date(sortedCards[insertAfterIndex].created_at).getTime();
      const nextCard = sortedCards[insertAfterIndex + 1];
      if (nextCard) {
        const nextTime = new Date(nextCard.created_at).getTime();
        createdAt = new Date(currentTime + Math.floor((nextTime - currentTime) / 2)).toISOString();
      } else {
        createdAt = new Date(currentTime + 1).toISOString();
      }
    }
    createCard.mutate({ frontContent: '', backContent: '', cardType: 'basic', createdAt }, {
      onSuccess: (createdCard) => {
        if (!Array.isArray(createdCard) && createdCard?.id) setPendingNewCardId(createdCard.id);
        toast({ title: 'Novo cartão criado' });
      },
    });
  }, [createCard, toast, sortedCards, selectedIndex, siblingMap]);

  const handleDuplicate = useCallback(() => {
    if (!currentCard) return;
    createCard.mutate(
      { frontContent: currentCard.front_content, backContent: currentCard.back_content, cardType: currentCard.card_type },
      { onSuccess: () => { toast({ title: 'Cartão duplicado' }); setTimeout(() => setSelectedIndex(totalCards), 100); } }
    );
  }, [currentCard, createCard, totalCards, toast]);

  const handleAICreate = useCallback(async (templatePrompt: string) => {
    const strippedFront = front.replace(/<[^>]*>/g, '').trim();
    if (!strippedFront) { toast({ title: 'Escreva algo na frente primeiro', variant: 'destructive' }); return; }
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setIsAICreating(true);
    try {
      const data = await enhanceCard({ front, back, cardType: 'basic', aiModel: model, energyCost: 1, customPrompt: templatePrompt });
      if (data?.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (data?.front) { setFront(markdownToHtml(data.front)); setIsDirty(true); }
      if (data?.back) { setBack(markdownToHtml(data.back)); setIsDirty(true); }
      toast({ title: '✨ Cartão gerado com IA!' });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar', description: e.message, variant: 'destructive' });
    } finally { setIsAICreating(false); }
  }, [front, back, energy, model, queryClient, toast]);

  // Build image attachments array for the thumbnail row
  const frontImageAttachments = useMemo(() => {
    const atts: ImageAttachment[] = [];
    frontAttachedImages.forEach(url => atts.push({ url, isOcclusion: false, hasOcclusionRects: false }));
    if (occlusionImageUrl) {
      atts.push({ url: occlusionImageUrl, isOcclusion: true, hasOcclusionRects: occlusionRects.length > 0 });
    }
    return atts;
  }, [frontAttachedImages, occlusionImageUrl, occlusionRects]);

  const backImageAttachments = useMemo(() => {
    return backAttachedImages.map(url => ({ url, isOcclusion: false, hasOcclusionRects: false }));
  }, [backAttachedImages]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      {/* Header — clean & minimal */}
      <header className="shrink-0 border-b border-border/40 bg-background">
        <div className="flex items-center justify-between px-3 py-2.5 mx-auto max-w-2xl">
          <button onClick={handleBack} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>

          {totalCards > 0 && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => selectCard(selectedIndex - 1)} disabled={selectedIndex === 0} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-foreground tabular-nums min-w-[56px] text-center">
                {selectedIndex + 1}/{totalCards}
              </span>
              <button onClick={() => selectCard(selectedIndex + 1)} disabled={selectedIndex >= totalCards - 1} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            {totalCards > 0 && (
              <button
                onClick={() => { if (isDirty) saveCurrentCard(); setPreviewOpen(true); }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Preview"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                  <path d="M15 6H9v12h6zM9 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM5 8v8a1 1 0 1 1-2 0V8a1 1 0 0 1 2 0M21 8v8a1 1 0 1 1-2 0V8a1 1 0 1 1 2 0" />
                </svg>
              </button>
            )}
            {isDirty && (
              <button
                onClick={saveCurrentCard}
                disabled={updateCard.isPending}
                className="h-8 px-3 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 gap-1"
              >
                {updateCard.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content — cards take full space */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {currentCard ? (
          <div className="mx-auto max-w-2xl flex h-full p-3 sm:p-5 gap-1.5">

            {/* Left sidebar — card index numbers (vertical) */}
            <div className="shrink-0 flex flex-col items-center gap-0 overflow-y-auto no-scrollbar py-1">
              {sortedCards.map((card, idx) => {
                const group = siblingMap.get(idx);
                const isInGroup = !!group;
                const isFirst = isInGroup && group![0] === idx;
                const isLast = isInGroup && group![group!.length - 1] === idx;
                const selectedGroup = siblingMap.get(selectedIndex);
                const isGroupHighlighted = isInGroup && selectedGroup && group![0] === selectedGroup[0];

                return (
                  <div key={card.id} className="flex items-stretch">
                    {/* Sibling connector bar */}
                    <div className="w-1 mr-0.5 flex flex-col items-center">
                      {isInGroup ? (
                        <div className={`w-0.5 flex-1 ${isGroupHighlighted ? 'bg-primary/40' : 'bg-border'} ${isFirst ? 'rounded-t-full mt-2' : ''} ${isLast ? 'rounded-b-full mb-2' : ''}`} />
                      ) : <div className="w-0.5 flex-1" />}
                    </div>
                    <button
                      onClick={() => selectCard(idx)}
                      className={`shrink-0 h-7 w-7 my-0.5 rounded-full text-[12px] font-medium transition-all flex items-center justify-center ${
                        idx === selectedIndex
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : isGroupHighlighted
                            ? 'bg-accent/60 text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Center — card editors */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {/* Front card */}
              <div className="flex-1 min-h-[100px] rounded-xl border border-border/60 bg-card overflow-hidden relative flex flex-col">
                {(!front || front === '<p></p>') && !occlusionImageUrl && frontAttachedImages.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-muted-foreground/30 text-base font-medium">Frente</span>
                  </div>
                ) : null}

                <LazyRichEditor
                  content={front}
                  onChange={(v) => { setFront(v); setIsDirty(true); }}
                  placeholder=""
                  chromeless
                  hideCloze={false}
                  imageAttachments={frontImageAttachments}
                  onImageAttached={(url) => {
                    setFrontAttachedImages(prev => [...prev, url]);
                    setIsDirty(true);
                  }}
                  onRemoveAttachment={(url) => {
                    if (url === occlusionImageUrl) {
                      setOcclusionImageUrl('');
                      setOcclusionRects([]);
                      setOcclusionCanvasSize(null);
                    } else {
                      setFrontAttachedImages(prev => prev.filter(u => u !== url));
                    }
                    setIsDirty(true);
                  }}
                  onClickAttachment={(att) => {
                    if (att.isOcclusion && att.hasOcclusionRects) {
                      setOcclusionModalOpen(true);
                    } else {
                      setPreviewAttachment({ attachment: att, allowOcclusion: true });
                    }
                  }}
                  onOcclusionImageReady={(imageUrl) => {
                    setOcclusionImageUrl(imageUrl);
                    setOcclusionRects([]);
                    setOcclusionCanvasSize(null);
                    setOcclusionModalOpen(true);
                    setIsDirty(true);
                  }}
                  onAICreate={handleAICreate}
                  isAICreating={isAICreating}
                />
              </div>

              {/* Back card */}
              <div className="flex-1 min-h-[100px] rounded-xl border border-border/60 bg-card overflow-hidden relative flex flex-col">
                {!back || back === '<p></p>' ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-muted-foreground/30 text-base font-medium">Verso</span>
                  </div>
                ) : null}
                <LazyRichEditor
                  content={back}
                  onChange={(v) => { setBack(v); setIsDirty(true); }}
                  placeholder=""
                  chromeless
                  hideCloze
                  imageAttachments={backImageAttachments}
                  onImageAttached={(url) => {
                    setBackAttachedImages(prev => [...prev, url]);
                    setIsDirty(true);
                  }}
                  onRemoveAttachment={(url) => {
                    setBackAttachedImages(prev => prev.filter(u => u !== url));
                    setIsDirty(true);
                  }}
                  onClickAttachment={(att) => {
                    setPreviewAttachment({ attachment: att, allowOcclusion: false });
                  }}
                  onAICreate={handleAICreate}
                  isAICreating={isAICreating}
                />
              </div>
            </div>

            {/* Right sidebar — action buttons (vertical) */}
            <div className="shrink-0 flex flex-col items-center gap-1 py-1">
              <button onClick={handleAddCard} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Novo cartão">
                <Plus className="h-4.5 w-4.5" />
              </button>
              <button onClick={() => setAIDeckDialogOpen(true)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Gerar com IA">
                <IconAIGradient className="h-4.5 w-4.5" />
              </button>
              <button onClick={handleDuplicate} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Duplicar">
                <Copy className="h-4 w-4" />
              </button>
              <button onClick={() => setDeleteConfirmOpen(true)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Excluir">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
            <p className="text-muted-foreground mb-1 text-sm">Nenhum cartão neste baralho</p>
            <Button onClick={handleAddCard} size="sm" className="gap-1.5 rounded-xl">
              <Plus className="h-4 w-4" /> Adicionar cartão
            </Button>
            <Button onClick={() => setAIDeckDialogOpen(true)} size="sm" variant="outline" className="gap-1.5 rounded-xl">
              <IconAIGradient className="h-4 w-4" /> Gerar com IA
            </Button>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <ManageDeckPreview cards={sortedCards} initialIndex={selectedIndex} open={previewOpen} onClose={() => setPreviewOpen(false)} />

      {/* Occlusion Editor — centered modal overlay */}
      {occlusionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-5">
          <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl max-h-[85dvh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col">
          <OcclusionEditor
            initialFront={occlusionImageUrl ? JSON.stringify({
              imageUrl: occlusionImageUrl, rects: occlusionRects, allRects: occlusionRects,
              canvasWidth: occlusionCanvasSize?.w ?? 0, canvasHeight: occlusionCanvasSize?.h ?? 0,
            }) : ''}
            externalUsedColorIndices={(() => {
              const indices = new Set<number>();
              const matches = front.matchAll(/\{\{c(\d+)::/g);
              for (const m of matches) indices.add(parseInt(m[1]) - 1);
              return indices;
            })()}
            onSave={(frontContent) => {
              try {
                const data = JSON.parse(frontContent);
                setOcclusionImageUrl(data.imageUrl || '');
                setOcclusionRects(data.allRects || data.rects || []);
                setOcclusionCanvasSize(data.canvasWidth ? { w: data.canvasWidth, h: data.canvasHeight } : null);
                setIsDirty(true);
              } catch {}
              setOcclusionModalOpen(false);
            }}
            
            onCancel={() => setOcclusionModalOpen(false)}
            isSaving={false}
          />
          </div>
        </div>
      )}

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        open={!!previewAttachment}
        imageUrl={previewAttachment?.attachment.url ?? null}
        canConvertToOcclusion={previewAttachment?.allowOcclusion ?? false}
        onClose={() => setPreviewAttachment(null)}
        onAddOcclusion={() => {
          if (previewAttachment) {
            const url = previewAttachment.attachment.url;
            setFrontAttachedImages(prev => prev.filter(u => u !== url));
            setOcclusionImageUrl(url);
            setOcclusionRects([]);
            setOcclusionCanvasSize(null);
            setPreviewAttachment(null);
            setOcclusionModalOpen(true);
            setIsDirty(true);
          }
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Create Cards Dialog */}
      <AICreateDeckDialog
        open={aiDeckDialogOpen}
        onOpenChange={setAIDeckDialogOpen}
        existingDeckId={deckId}
        existingDeckName={deckName ?? ''}
      />
    </div>
  );
};

/* ─── Preview modal ─── */
function ManageDeckPreview({ cards, initialIndex, open, onClose }: {
  cards: CardRow[]; initialIndex: number; open: boolean; onClose: () => void;
}) {
  const virtualCards = useMemo(() => buildVirtualCards(cards), [cards]);
  const [index, setIndex] = useState(initialIndex);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { if (open) { setIndex(initialIndex); setRevealed(false); } }, [open, initialIndex]);

  const safeIndex = virtualCards.length > 0 ? Math.min(index, virtualCards.length - 1) : 0;
  const vc = virtualCards[safeIndex] ?? null;

  // Build sibling map for preview sidebar
  const previewSiblingMap = useMemo(() => {
    const indexToGroup = new Map<number, number[]>();
    let i = 0;
    while (i < virtualCards.length) {
      const card = virtualCards[i].card;
      const isSiblingType = card.card_type === 'cloze' || card.card_type === 'image_occlusion';
      if (isSiblingType) {
        const group = [i];
        let j = i + 1;
        while (j < virtualCards.length && virtualCards[j].card.front_content === card.front_content && (virtualCards[j].card.card_type === 'cloze' || virtualCards[j].card.card_type === 'image_occlusion')) {
          group.push(j);
          j++;
        }
        if (group.length > 1) {
          group.forEach(idx => indexToGroup.set(idx, group));
        }
        i = j;
      } else {
        i++;
      }
    }
    return indexToGroup;
  }, [virtualCards]);

  const goPrev = useCallback(() => { if (safeIndex > 0) { setIndex(i => i - 1); setRevealed(false); } }, [safeIndex]);
  const goNext = useCallback(() => { if (safeIndex < virtualCards.length - 1) { setIndex(i => i + 1); setRevealed(false); } }, [safeIndex, virtualCards.length]);

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

  const touchRef = useRef<{ x: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onTS = (e: TouchEvent) => { touchRef.current = { x: e.touches[0].clientX }; };
    const onTE = (e: TouchEvent) => {
      if (!touchRef.current) return;
      const dx = e.changedTouches[0].clientX - touchRef.current.x;
      if (Math.abs(dx) > 60) { dx > 0 ? goPrev() : goNext(); }
      touchRef.current = null;
    };
    window.addEventListener('touchstart', onTS, { passive: true });
    window.addEventListener('touchend', onTE, { passive: true });
    return () => { window.removeEventListener('touchstart', onTS); window.removeEventListener('touchend', onTE); };
  }, [open, goPrev, goNext]);

  if (!open || !vc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <span className="text-xs font-semibold text-foreground tabular-nums">
          <span className="text-primary">{safeIndex + 1}</span>/{virtualCards.length}
        </span>
        <div className="w-9" />
      </header>
      <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0">
        <div className="w-full max-w-lg flex gap-1.5">
          {/* Left sidebar — card index with sibling connectors */}
          <div className="shrink-0 flex flex-col items-center gap-0 overflow-y-auto no-scrollbar py-1 max-h-[70vh]">
            {virtualCards.map((vCard, idx) => {
              const group = previewSiblingMap.get(idx);
              const isInGroup = !!group;
              const isFirst = isInGroup && group![0] === idx;
              const isLast = isInGroup && group![group!.length - 1] === idx;
              const selectedGroup = previewSiblingMap.get(safeIndex);
              const isGroupHighlighted = isInGroup && selectedGroup && group![0] === selectedGroup[0];

              return (
                <div key={`${vCard.card.id}-${idx}`} className="flex items-stretch">
                  <div className="w-1 mr-0.5 flex flex-col items-center">
                    {isInGroup ? (
                      <div className={`w-0.5 flex-1 ${isGroupHighlighted ? 'bg-primary/40' : 'bg-border'} ${isFirst ? 'rounded-t-full mt-2' : ''} ${isLast ? 'rounded-b-full mb-2' : ''}`} />
                    ) : <div className="w-0.5 flex-1" />}
                  </div>
                  <button
                    onClick={() => { setIndex(idx); setRevealed(false); }}
                    className={`shrink-0 h-7 w-7 my-0.5 rounded-full text-[12px] font-medium transition-all flex items-center justify-center ${
                      idx === safeIndex
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : isGroupHighlighted
                          ? 'bg-accent/60 text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {idx + 1}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Center — card content */}
          <div className="flex-1 min-w-0">
            <CardPreviewContent vc={vc} revealed={revealed} onClick={() => setRevealed(r => !r)} />
          </div>

          {/* Right sidebar — action buttons */}
          <div className="shrink-0 flex flex-col items-center gap-1 py-1">
            <button className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Duplicar">
              <Copy className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Excluir">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManageDeck;
