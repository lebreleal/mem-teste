import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useCards } from '@/hooks/useCards';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Pencil, Trash2, MessageSquareText, CheckSquare, PenLine, Image, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import RichEditor from '@/components/RichEditor';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

type EditorCardType = 'basic' | 'cloze' | 'multiple_choice' | 'image_occlusion';

const CARD_TYPES: { value: EditorCardType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'basic', label: 'Texto', icon: <MessageSquareText className="h-5 w-5 text-primary" />, desc: 'Pergunta na frente, resposta no verso' },
  { value: 'multiple_choice', label: 'Múltipla escolha', icon: <CheckSquare className="h-5 w-5 text-warning" />, desc: 'Pergunta com alternativas' },
  { value: 'cloze', label: 'Cloze', icon: <PenLine className="h-5 w-5 text-accent-foreground" />, desc: 'Texto com lacunas para preencher' },
  { value: 'image_occlusion', label: 'Oclusão de imagem', icon: <Image className="h-5 w-5 text-info" />, desc: 'Oculte partes de uma imagem' },
];

const ManageDeck = () => {
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

  // Multiple choice state
  const [mcOptions, setMcOptions] = useState<string[]>(['', '', '', '']);
  const [mcCorrectIndex, setMcCorrectIndex] = useState<number>(0);

  // AI improve state
  const [isImproving, setIsImproving] = useState(false);
  const [improvePreview, setImprovePreview] = useState<{ front: string; back: string } | null>(null);
  const [improveModalOpen, setImproveModalOpen] = useState(false);

  const resetForm = () => {
    setFront(''); setBack(''); setEditingId(null);
    setEditorType(null);
    setMcOptions(['', '', '', '']); setMcCorrectIndex(0);
  };

  const openNew = () => { resetForm(); setEditorOpen(true); };

  const openEdit = (card: { id: string; front_content: string; back_content: string; card_type: string }) => {
    setEditingId(card.id);
    setFront(card.front_content);

    if (card.card_type === 'multiple_choice') {
      setEditorType('multiple_choice');
      try {
        const data = JSON.parse(card.back_content);
        setMcOptions(data.options || ['', '', '', '']);
        setMcCorrectIndex(data.correctIndex ?? 0);
      } catch {
        setBack(card.back_content);
      }
    } else if (card.card_type === 'cloze') {
      setEditorType('cloze');
      setBack(card.back_content);
    } else if (card.card_type === 'image_occlusion') {
      setEditorType('image_occlusion');
      setBack(card.back_content);
    } else {
      setEditorType('basic');
      setBack(card.back_content);
    }
    setEditorOpen(true);
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

  const handleSave = (addAnother: boolean) => {
    if (!front.trim()) {
      toast({ title: 'Preencha a pergunta', variant: 'destructive' });
      return;
    }

    let cardType: string;
    let backContent: string;

    if (editorType === 'multiple_choice') {
      const filledOptions = mcOptions.filter(o => o.trim());
      if (filledOptions.length < 2) {
        toast({ title: 'Adicione pelo menos 2 opções', variant: 'destructive' });
        return;
      }
      cardType = 'multiple_choice';
      backContent = JSON.stringify({
        options: mcOptions.filter(o => o.trim()),
        correctIndex: mcCorrectIndex,
      });
    } else if (editorType === 'cloze') {
      if (!front.includes('{{c')) {
        toast({ title: 'Use a sintaxe {{c1::resposta}} para criar lacunas', variant: 'destructive' });
        return;
      }
      cardType = 'cloze';
      backContent = back;
    } else {
      cardType = editorType === 'image_occlusion' ? 'image_occlusion' : 'basic';
      backContent = back;
    }

    const onSuccess = () => {
      toast({ title: editingId ? 'Card atualizado!' : 'Card criado!' });
      if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
      else { setEditorOpen(false); resetForm(); }
    };

    if (editingId) {
      updateCard.mutate({ id: editingId, frontContent: front, backContent }, { onSuccess });
    } else {
      createCard.mutate({ frontContent: front, backContent, cardType }, { onSuccess });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteCard.mutate(deleteId, { onSuccess: () => { setDeleteId(null); toast({ title: 'Card excluído' }); } });
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
      let backToSend = back;
      if (editorType === 'multiple_choice') {
        backToSend = JSON.stringify({ options: mcOptions.filter(o => o.trim()), correctIndex: mcCorrectIndex });
      }

      const { data, error } = await supabase.functions.invoke('enhance-card', {
        body: { front, back: backToSend, cardType: editorType || 'basic', aiModel: model, energyCost: 1 },
      });

      if (error) throw error;
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      if (data.unchanged) {
        toast({ title: '✨ Este card já está ótimo!', description: 'Não há melhorias a fazer.' });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['energy'] });

      setImprovePreview({ front: data.front, back: data.back });
      setImproveModalOpen(true);
    } catch (e: any) {
      console.error('Improve error:', e);
      toast({ title: 'Erro ao melhorar card', description: e.message, variant: 'destructive' });
    } finally {
      setIsImproving(false);
    }
  };

  const applyImprovement = () => {
    if (!improvePreview) return;
    setFront(improvePreview.front);

    if (editorType === 'multiple_choice') {
      try {
        const data = JSON.parse(improvePreview.back);
        setMcOptions(data.options || mcOptions);
        setMcCorrectIndex(data.correctIndex ?? mcCorrectIndex);
      } catch {
        // keep existing if parse fails
      }
    } else {
      setBack(improvePreview.back);
    }

    setImproveModalOpen(false);
    setImprovePreview(null);
    toast({ title: 'Melhoria aplicada!' });
  };

  const getCardTypeBadge = (type: string) => {
    switch (type) {
      case 'cloze': return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary">Cloze</span>;
      case 'multiple_choice': return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-warning/40 bg-warning/10 text-warning">Múltipla</span>;
      case 'image_occlusion': return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-info/40 bg-info/10 text-info">Oclusão</span>;
      default: return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-border">Básico</span>;
    }
  };

  const isSaving = createCard.isPending || updateCard.isPending;
  const canImprove = editorType && editorType !== 'image_occlusion';

  // Type selection screen
  const renderTypeSelector = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Selecione o tipo do flashcard</p>
      <div className="grid grid-cols-1 gap-2">
        {CARD_TYPES.map(type => (
          <button
            key={type.value}
            onClick={() => setEditorType(type.value)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {type.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{type.label}</p>
              <p className="text-[11px] text-muted-foreground">{type.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Card editor form
  const renderEditor = () => (
    <div className="space-y-4">
      {!editingId && (
        <button
          onClick={() => setEditorType(null)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          {CARD_TYPES.find(t => t.value === editorType)?.icon}{' '}
          {CARD_TYPES.find(t => t.value === editorType)?.label}
        </button>
      )}

      {editorType === 'image_occlusion' ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-3">
          <span className="text-4xl">🖼️</span>
          <p className="text-sm font-medium text-foreground">Oclusão de Imagem</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Para criar cards de oclusão, use o editor de oclusão na página do baralho (botão "Oclusão de Imagem").
          </p>
          <Button variant="outline" onClick={() => { setEditorOpen(false); resetForm(); navigate(`/decks/${deckId}`); }}>
            Ir para o Baralho
          </Button>
        </div>
      ) : (
        <>
          <div>
            <Label className="mb-1.5 block">
              {editorType === 'multiple_choice' ? 'Pergunta' : editorType === 'cloze' ? 'Texto com lacunas' : 'Frente (Pergunta)'}
            </Label>
            <RichEditor
              content={front}
              onChange={setFront}
              placeholder={
                editorType === 'multiple_choice'
                  ? 'Qual organela é responsável pela produção de energia?'
                  : editorType === 'cloze'
                  ? 'A {{c1::mitocôndria}} é responsável pela respiração celular.'
                  : 'Qual é a capital da França?'
              }
            />
          </div>

          {editorType === 'multiple_choice' ? (
            <div className="space-y-2">
              <Label className="block">Opções</Label>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {mcOptions.map((opt, idx) => (
                  <div
                    key={idx}
                    onClick={() => setMcCorrectIndex(idx)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      mcCorrectIndex === idx ? 'bg-success/10' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                      mcCorrectIndex === idx ? 'border-success bg-success text-white' : 'border-muted-foreground/30'
                    }`}>
                      {mcCorrectIndex === idx && <span className="text-[10px] font-bold">✓</span>}
                    </div>
                    <Input
                      value={opt}
                      onChange={e => {
                        e.stopPropagation();
                        const newOpts = [...mcOptions];
                        newOpts[idx] = e.target.value;
                        setMcOptions(newOpts);
                      }}
                      onClick={e => e.stopPropagation()}
                      placeholder={`Opção ${idx + 1}`}
                      className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto py-0"
                    />
                    {mcOptions.length > 2 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => { e.stopPropagation(); removeMcOption(idx); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {mcOptions.length < 6 && (
                <Button variant="ghost" size="sm" onClick={addMcOption} className="gap-1 w-full text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" /> Adicionar opção
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">Clique na linha para marcar a resposta correta</p>
            </div>
          ) : editorType === 'cloze' ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Como usar</p>
              <p className="text-xs text-muted-foreground">
                Envolva a resposta com <code className="text-primary font-mono bg-primary/10 px-1 rounded">{'{{c1::resposta}}'}</code>
              </p>
              <p className="text-[11px] text-muted-foreground">O texto dentro da lacuna será ocultado durante o estudo.</p>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5 block">Verso (Resposta)</Label>
              <RichEditor content={back} onChange={setBack} placeholder="Paris" />
            </div>
          )}

          {/* AI Improve button */}
          {canImprove && (
            <Button
              variant="outline"
              onClick={handleImprove}
              disabled={isImproving}
              className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
            >
              {isImproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isImproving ? 'Melhorando...' : 'Melhorar com IA'}
              <span className="text-[10px] text-muted-foreground ml-auto">1 crédito</span>
            </Button>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEditorOpen(false); resetForm(); }}>Cancelar</Button>
            {!editingId && (
              <Button variant="secondary" onClick={() => handleSave(true)} disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar e Adicionar Outro'}
              </Button>
            )}
            <Button onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar e Fechar'}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  // Render improvement preview for the modal
  const renderImprovePreview = () => {
    if (!improvePreview) return null;

    if (editorType === 'multiple_choice') {
      let mcData: { options: string[]; correctIndex: number } | null = null;
      try { mcData = JSON.parse(improvePreview.back); } catch {}
      return (
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Pergunta melhorada</Label>
            <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: improvePreview.front }} />
          </div>
          {mcData && (
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Opções melhoradas</Label>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {mcData.options.map((opt, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 ${idx === mcData!.correctIndex ? 'bg-success/10' : ''}`}>
                    <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center ${idx === mcData!.correctIndex ? 'border-success bg-success text-white' : 'border-muted-foreground/30'}`}>
                      {idx === mcData!.correctIndex && <span className="text-[10px] font-bold">✓</span>}
                    </div>
                    <span className="text-sm">{opt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {editorType === 'cloze' ? 'Texto melhorado' : 'Frente melhorada'}
          </Label>
          <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: improvePreview.front }} />
        </div>
        {editorType !== 'cloze' && (
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Verso melhorado</Label>
            <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: improvePreview.back }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/decks/${deckId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-display text-xl font-bold text-foreground">Gerenciar Cards</h1>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo Card</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <h3 className="font-display text-lg font-semibold text-foreground">Nenhum card ainda</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adicione flashcards para começar a estudar.</p>
            <Button onClick={openNew} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Adicionar Card
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <div key={card.id} className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getCardTypeBadge(card.card_type)}
                  </div>
                  <div className="text-sm font-medium text-card-foreground line-clamp-1 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: card.front_content }} />
                  {card.card_type !== 'multiple_choice' && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-1 prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: card.back_content }} />
                  )}
                  {card.card_type === 'multiple_choice' && (() => {
                    try {
                      const mc = JSON.parse(card.back_content);
                      return <p className="mt-1 text-xs text-muted-foreground">{mc.options?.length || 0} opções · Resposta: {mc.options?.[mc.correctIndex]}</p>;
                    } catch { return null; }
                  })()}
                </div>
                <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(card)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(card.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Card Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={open => { if (!open) { setEditorOpen(false); resetForm(); } }}>
        <DialogContent className={`max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto ${editorType === 'image_occlusion' ? 'sm:max-w-4xl' : 'sm:max-w-2xl'}`}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingId ? 'Editar Card' : editorType ? CARD_TYPES.find(t => t.value === editorType)?.label : 'Novo Card'}
            </DialogTitle>
          </DialogHeader>
          {editorType === null ? renderTypeSelector() : renderEditor()}
        </DialogContent>
      </Dialog>

      {/* AI Improve Preview Modal */}
      <Dialog open={improveModalOpen} onOpenChange={setImproveModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Melhoria sugerida
            </DialogTitle>
          </DialogHeader>
          {renderImprovePreview()}
          <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
            <Button variant="outline" onClick={() => { setImproveModalOpen(false); setImprovePreview(null); }}>
              Descartar
            </Button>
            <Button onClick={applyImprovement} className="gap-2">
              Aplicar melhoria <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir card?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageDeck;
