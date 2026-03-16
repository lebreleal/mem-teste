import { useState, useCallback } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useCards } from '@/hooks/useCards';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeHtml } from '@/lib/sanitize';

export type EditorCardType = 'basic' | 'cloze' | 'image_occlusion';

export const CARD_TYPES: { value: EditorCardType; label: string; desc: string }[] = [
  { value: 'basic', label: 'Texto', desc: 'Pergunta na frente, resposta no verso' },
  { value: 'cloze', label: 'Oclusão de Texto e Imagem', desc: 'Lacunas de texto e/ou oclusão de imagem' },
];

export function useManageDeck() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { cards, isLoading, createCard, updateCard, deleteCard } = useCards(deckId ?? '');
  const { energy, spendEnergy } = useEnergy();
  const { model } = useAIModel();
  const { toast } = useToast();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editorType, setEditorType] = useState<EditorCardType | null>(null);
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);
  const [suggestCard, setSuggestCard] = useState<{ id: string; front_content: string; back_content: string; deck_id: string; card_type: string } | null>(null);
  const [mcOptions, setMcOptions] = useState<string[]>(['', '', '', '']);
  const [mcCorrectIndex, setMcCorrectIndex] = useState<number>(0);
  const [isImproving, setIsImproving] = useState(false);
  const [improvePreview, setImprovePreview] = useState<{ front: string; back: string } | null>(null);
  const [improveModalOpen, setImproveModalOpen] = useState(false);

  const { data: deckMeta } = useQuery({
    queryKey: ['deck-meta', deckId],
    queryFn: async () => {
      const { data } = await supabase.from('decks').select('source_turma_deck_id, source_listing_id').eq('id', deckId!).single();
      return data as { source_turma_deck_id: string | null; source_listing_id: string | null } | null;
    },
    enabled: !!deckId,
  });
  const isCommunityDeck = !!(deckMeta?.source_turma_deck_id || deckMeta?.source_listing_id);

  const resetForm = useCallback(() => {
    setFront(''); setBack(''); setEditingId(null);
    setEditorType(null);
    setMcOptions(['', '', '', '']); setMcCorrectIndex(0);
  }, []);

  const openNew = useCallback(() => { resetForm(); setEditorOpen(true); }, [resetForm]);

  const openEdit = useCallback((card: { id: string; front_content: string; back_content: string; card_type: string }) => {
    setEditingId(card.id);
    if (card.card_type === 'cloze') {
      // If front_content is image-occlusion JSON, extract frontText only
      try {
        const parsed = JSON.parse(card.front_content);
        if (parsed && typeof parsed === 'object' && 'imageUrl' in parsed) {
          setFront(parsed.frontText || '');
        } else {
          setFront(card.front_content);
        }
      } catch { setFront(card.front_content); }
      setEditorType('cloze');
      try {
        const parsed = JSON.parse(card.back_content);
        setBack(typeof parsed.clozeTarget === 'number' ? (parsed.extra || '') : card.back_content);
      } catch { setBack(card.back_content); }
    } else if (card.card_type === 'image_occlusion') {
      setEditorType('image_occlusion');
      setFront(card.front_content);
      try { JSON.parse(card.front_content); } catch {}
      setBack(card.back_content);
    } else {
      // For basic cards, also extract frontText if it's occlusion JSON
      try {
        const parsed = JSON.parse(card.front_content);
        if (parsed && typeof parsed === 'object' && 'imageUrl' in parsed) {
          setFront(parsed.frontText || '');
        } else {
          setFront(card.front_content);
        }
      } catch { setFront(card.front_content); }
      setEditorType('basic');
      setBack(card.back_content);
    }
    setEditorOpen(true);
  }, []);

  const addMcOption = useCallback(() => {
    if (mcOptions.length < 6) setMcOptions(prev => [...prev, '']);
  }, [mcOptions.length]);

  const removeMcOption = useCallback((idx: number) => {
    if (mcOptions.length <= 2) return;
    const newOpts = mcOptions.filter((_, i) => i !== idx);
    setMcOptions(newOpts);
    if (mcCorrectIndex >= newOpts.length) setMcCorrectIndex(newOpts.length - 1);
    else if (mcCorrectIndex === idx) setMcCorrectIndex(0);
    else if (mcCorrectIndex > idx) setMcCorrectIndex(mcCorrectIndex - 1);
  }, [mcOptions, mcCorrectIndex]);

  const handleSave = useCallback((addAnother: boolean) => {
    if (!front.trim()) {
      toast({ title: 'Preencha a pergunta', variant: 'destructive' });
      return;
    }
    let cardType: string;
    let backContent: string;

    if (editorType === 'cloze') {
      if (!front.includes('{{c')) {
        toast({ title: 'Use a sintaxe {{c1::resposta}} para criar lacunas', variant: 'destructive' });
        return;
      }
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
      if (editingId) {
        const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
        updateCard.mutate({ id: editingId, frontContent: front, backContent: backJson }, {
          onSuccess: () => {
            toast({ title: 'Cartão atualizado!' });
            if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
            else { setEditorOpen(false); resetForm(); }
          },
        });
      } else {
        if (uniqueNums.length <= 1) {
          const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
          createCard.mutate({ frontContent: front, backContent: backJson, cardType: 'cloze' }, {
            onSuccess: () => {
              toast({ title: 'Cartão criado!' });
              if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
              else { setEditorOpen(false); resetForm(); }
            },
          });
        } else {
          const cards = uniqueNums.map(n => ({
            frontContent: front,
            backContent: JSON.stringify({ clozeTarget: n, extra: back }),
            cardType: 'cloze',
          }));
          createCard.mutate({ cards }, {
            onSuccess: () => {
              toast({ title: `${uniqueNums.length} cartões criados!` });
              if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
              else { setEditorOpen(false); resetForm(); }
            },
          });
        }
      }
      return;
    } else if (editorType === 'image_occlusion') {
      // Check if frontText contains cloze markers
      let frontText = '';
      try { frontText = JSON.parse(front)?.frontText || ''; } catch {}
      const plainFrontText = frontText.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainFrontText.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

      if (uniqueNums.length > 0) {
        // Image occlusion + cloze: create one card per cloze number
        const onSuccess = () => {
          toast({ title: editingId ? 'Cartão atualizado!' : `${Math.max(1, uniqueNums.length)} cartão(ões) criado(s)!` });
          if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
          else { setEditorOpen(false); resetForm(); }
        };
        if (editingId) {
          const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
          updateCard.mutate({ id: editingId, frontContent: front, backContent: backJson }, { onSuccess });
        } else if (uniqueNums.length <= 1) {
          const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
          createCard.mutate({ frontContent: front, backContent: backJson, cardType: 'image_occlusion' }, { onSuccess });
        } else {
          const cards = uniqueNums.map(n => ({
            frontContent: front,
            backContent: JSON.stringify({ clozeTarget: n, extra: back }),
            cardType: 'image_occlusion',
          }));
          createCard.mutate({ cards }, { onSuccess });
        }
        return;
      }

      cardType = 'image_occlusion';
      backContent = back;
    } else {
      cardType = 'basic';
      backContent = back;
    }
    const onSuccess = () => {
      toast({ title: editingId ? 'Cartão atualizado!' : 'Cartão criado!' });
      if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
      else { setEditorOpen(false); resetForm(); }
    };
    if (editingId) {
      updateCard.mutate({ id: editingId, frontContent: front, backContent }, { onSuccess });
    } else {
      createCard.mutate({ frontContent: front, backContent, cardType }, { onSuccess });
    }
  }, [front, back, editorType, mcOptions, mcCorrectIndex, editingId, createCard, updateCard, toast, resetForm]);

  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteCard.mutate(deleteId, { onSuccess: () => { setDeleteId(null); toast({ title: 'Cartão excluído' }); } });
  }, [deleteId, deleteCard, toast]);

  const handleImprove = useCallback(async () => {
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
      let backToSend = back;
      const { data, error } = await supabase.functions.invoke('enhance-card', {
        body: { front, back: backToSend, cardType: editorType || 'basic', aiModel: model, energyCost: 1 },
      });
      if (error) throw error;
      if (data.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      if (data.unchanged) { toast({ title: '✨ Este card já está ótimo!', description: 'Não há melhorias a fazer.' }); return; }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setImprovePreview({ front: data.front, back: data.back });
      setImproveModalOpen(true);
    } catch (e: any) {
      console.error('Improve error:', e);
      toast({ title: 'Erro ao melhorar card', description: e.message, variant: 'destructive' });
    } finally {
      setIsImproving(false);
    }
  }, [front, back, editorType, mcOptions, mcCorrectIndex, energy, model, queryClient, toast]);

  const applyImprovement = useCallback(() => {
    if (!improvePreview) return;
    setFront(improvePreview.front);
    setBack(improvePreview.back);
    setImproveModalOpen(false);
    setImprovePreview(null);
    toast({ title: 'Melhoria aplicada!' });
  }, [improvePreview, toast]);

  return {
    deckId, navigate, cards, isLoading, isCommunityDeck,
    editorOpen, setEditorOpen, editingId, front, setFront, back, setBack,
    deleteId, setDeleteId, editorType, setEditorType,
    occlusionModalOpen, setOcclusionModalOpen,
    suggestCard, setSuggestCard,
    mcOptions, setMcOptions, mcCorrectIndex, setMcCorrectIndex,
    isImproving, improvePreview, improveModalOpen, setImproveModalOpen,
    isSaving: createCard.isPending || updateCard.isPending,
    resetForm, openNew, openEdit, addMcOption, removeMcOption,
    handleSave, handleDelete, handleImprove, applyImprovement,
  };
}
