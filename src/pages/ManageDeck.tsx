import { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useCards } from '@/hooks/useCards';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Pencil, Trash2, MessageSquareText, CheckSquare, PenLine, Image, Sparkles, Loader2, ArrowRight, Send, Upload, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import LazyRichEditor from '@/components/LazyRichEditor';
import SuggestCorrectionModal from '@/components/SuggestCorrectionModal';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUtils';

/* ─── Occlusion Editor Component ─── */

interface OcclusionRect {
  x: number; y: number; w: number; h: number; id: string;
}

interface OcclusionEditorProps {
  initialFront: string;
  onSave: (front: string, back: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const OcclusionEditor = ({ initialFront, onSave, onCancel, isSaving }: OcclusionEditorProps) => {
  const [imageUrl, setImageUrl] = useState('');
  const [rects, setRects] = useState<OcclusionRect[]>([]);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingNaturalRects = useRef<OcclusionRect[] | null>(null);

  useEffect(() => {
    if (initialFront) {
      try {
        const data = JSON.parse(initialFront);
        if (data.imageUrl) setImageUrl(data.imageUrl);
        if (data.allRects) pendingNaturalRects.current = data.allRects;
      } catch {}
    }
  }, [initialFront]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0, img.naturalWidth * imageScale, img.naturalHeight * imageScale);

    rects.forEach((r, i) => {
      ctx.fillStyle = selectedId === r.id ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.75)';
      ctx.strokeStyle = selectedId === r.id ? '#facc15' : 'rgba(59,130,246,1)';
      ctx.lineWidth = selectedId === r.id ? 3 : 2;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, r.x + r.w / 2, r.y + r.h / 2);
    });

    if (currentRect) {
      ctx.fillStyle = 'rgba(59,130,246,0.25)';
      ctx.strokeStyle = 'rgba(59,130,246,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }, [rects, currentRect, imageScale, zoom, selectedId]);

  const loadImage = useCallback((url: string) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const maxW = container.clientWidth;
      const maxH = 400;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setImageScale(s);
      canvas.width = Math.round(img.naturalWidth * s * zoom);
      canvas.height = Math.round(img.naturalHeight * s * zoom);
      // Rescale pending natural rects to canvas coordinates
      if (pendingNaturalRects.current) {
        const scaled = pendingNaturalRects.current.map(r => ({
          ...r,
          x: r.x * s,
          y: r.y * s,
          w: r.w * s,
          h: r.h * s,
        }));
        setRects(scaled);
        pendingNaturalRects.current = null;
      }
    };
    img.src = url;
  }, [zoom]);

  useEffect(() => { if (imageUrl) loadImage(imageUrl); }, [imageUrl, loadImage]);
  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = Math.round(img.naturalWidth * imageScale * zoom);
    canvas.height = Math.round(img.naturalHeight * imageScale * zoom);
    drawCanvas();
  }, [zoom, imageScale, drawCanvas]);

  const toCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * (canvas.width / rect.width)) / zoom,
      y: ((e.clientY - rect.top) * (canvas.height / rect.height)) / zoom,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = toCanvasCoords(e);
    const hit = [...rects].reverse().find(r => pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h);
    if (hit) { setSelectedId(hit.id); return; }
    setSelectedId(null);
    setDrawing(true);
    setStartPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) return;
    const pos = toCanvasCoords(e);
    setCurrentRect({
      x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x), h: Math.abs(pos.y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (!drawing || !currentRect) { setDrawing(false); return; }
    if (currentRect.w > 10 && currentRect.h > 10) {
      setRects(prev => [...prev, { ...currentRect, id: crypto.randomUUID() }]);
    }
    setDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setRects(prev => prev.filter(r => r.id !== selectedId));
    setSelectedId(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'webp';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('card-images').upload(path, compressed);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      setRects([]);
    } catch (err: any) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl || rects.length === 0) return;
    // Normalize rects from scaled coordinates to natural image coordinates
    const scale = imageScale || 1;
    const normalizedRects = rects.map(r => ({
      ...r,
      x: r.x / scale,
      y: r.y / scale,
      w: r.w / scale,
      h: r.h / scale,
    }));
    const frontContent = JSON.stringify({
      imageUrl,
      allRects: normalizedRects,
      activeRectIds: normalizedRects.map(r => r.id),
    });
    onSave(frontContent, '');
  };

  if (!imageUrl) {
    return (
      <div className="space-y-4">
        {!initialFront && (
          <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            <Image className="h-4 w-4" /> Oclusão de imagem
          </button>
        )}
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center space-y-3">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Envie uma imagem</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Selecione a imagem e depois marque as áreas que serão ocultadas durante o estudo.
          </p>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <span className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Enviando...' : 'Escolher imagem'}
            </span>
          </label>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!initialFront && (
        <button onClick={() => { setImageUrl(''); setRects([]); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" />
          <Image className="h-4 w-4" /> Trocar imagem
        </button>
      )}

      <div className="flex items-center gap-1 flex-wrap rounded-lg border border-border bg-muted/30 p-1.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.3, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
        <span className="text-xs text-muted-foreground w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
        <div className="h-5 w-px bg-border mx-1" />
        {selectedId && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={deleteSelected}><Trash2 className="h-4 w-4" /></Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setRects([]); setSelectedId(null); }} className="gap-1 text-xs h-8 ml-auto">
          <RotateCcw className="h-3 w-3" /> Limpar
        </Button>
      </div>

      <div ref={containerRef} className="relative rounded-lg border border-border overflow-auto bg-muted/30 max-h-[400px]">
        <canvas ref={canvasRef} className="block" style={{ cursor: 'crosshair' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (drawing) { setDrawing(false); setStartPos(null); setCurrentRect(null); } }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {rects.length} área(s) marcada(s). Desenhe retângulos sobre as partes que deseja ocultar.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={isSaving || rects.length === 0}>
          {isSaving ? 'Salvando...' : `Salvar (${rects.length} área${rects.length !== 1 ? 's' : ''})`}
        </Button>
      </div>
    </div>
  );
};

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
  const [occlusionModalOpen, setOcclusionModalOpen] = useState(false);
  const [suggestCard, setSuggestCard] = useState<{ id: string; front_content: string; back_content: string; deck_id: string; card_type: string } | null>(null);

  // Detect if this is a community deck (has source_turma_deck_id or source_listing_id)
  const { data: deckMeta } = useQuery({
    queryKey: ['deck-meta', deckId],
    queryFn: async () => {
      const { data } = await supabase.from('decks').select('source_turma_deck_id, source_listing_id').eq('id', deckId!).single();
      return data as { source_turma_deck_id: string | null; source_listing_id: string | null } | null;
    },
    enabled: !!deckId,
  });
  const isCommunityDeck = !!(deckMeta?.source_turma_deck_id || deckMeta?.source_listing_id);

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
      // Parse JSON back_content with clozeTarget
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
      setEditorType('image_occlusion');
      // Extract frontText from occlusion JSON if present
      try {
        const occData = JSON.parse(card.front_content);
        // Don't overwrite front — keep the full JSON; the editor will extract frontText
      } catch {}
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
      // Extract unique cloze numbers
      const plainForNumbers = front.replace(/<[^>]*>/g, '');
      const clozeNumMatches = [...plainForNumbers.matchAll(/\{\{c(\d+)::/g)];
      const uniqueNums = [...new Set(clozeNumMatches.map(m => parseInt(m[1])))].sort((a, b) => a - b);

      if (editingId) {
        // When editing, update the single card (keep simple for edits)
        const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
        updateCard.mutate({ id: editingId, frontContent: front, backContent: backJson }, {
          onSuccess: () => {
            toast({ title: 'Card atualizado!' });
            if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
            else { setEditorOpen(false); resetForm(); }
          },
        });
      } else {
        // Create one card per cloze number
        if (uniqueNums.length <= 1) {
          const backJson = JSON.stringify({ clozeTarget: uniqueNums[0] || 1, extra: back });
          createCard.mutate({ frontContent: front, backContent: backJson, cardType: 'cloze' }, {
            onSuccess: () => {
              toast({ title: 'Card criado!' });
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
              toast({ title: `${uniqueNums.length} cards criados!` });
              if (addAnother) { setFront(''); setBack(''); setEditingId(null); setMcOptions(['', '', '', '']); setMcCorrectIndex(0); }
              else { setEditorOpen(false); resetForm(); }
            },
          });
        }
      }
      return;
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
            onClick={() => {
              setEditorType(type.value);
              if (type.value === 'image_occlusion') setOcclusionModalOpen(true);
            }}
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
        <>
          <div>
            <Label className="mb-1.5 block">Frente (Pergunta)</Label>
            <LazyRichEditor
              content={(() => { try { const d = JSON.parse(front); return d.frontText || ''; } catch { return front; } })()}
              onChange={(v) => {
                // Store frontText inside the occlusion JSON
                try {
                  const d = JSON.parse(front);
                  d.frontText = v;
                  setFront(JSON.stringify(d));
                } catch {
                  // No occlusion data yet, just store as text
                  setFront(v);
                }
              }}
              placeholder="Pergunta ou contexto (opcional)"
              hideCloze
            />
            {/* Occlusion image thumbnail */}
            {(() => {
              let occData: { imageUrl?: string; allRects?: any[] } | null = null;
              try { occData = JSON.parse(front); } catch {}

              if (occData?.imageUrl) {
                return (
                  <div className="mt-2 inline-flex">
                    <button
                      type="button"
                      onClick={() => setOcclusionModalOpen(true)}
                      className="relative group inline-block rounded-lg overflow-hidden border border-border"
                    >
                      <img src={occData.imageUrl} alt="Oclusão" className="h-14 w-14 object-cover rounded-lg" />
                      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-primary/80 py-0.5">
                        <Image className="h-3 w-3 text-primary-foreground" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFront(''); }}
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground/80 text-background flex items-center justify-center text-[10px] font-bold hover:bg-destructive transition-colors"
                      >
                        ×
                      </button>
                    </button>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() => setOcclusionModalOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" /> Enviar imagem para oclusão
                </button>
              );
            })()}
          </div>

          <div>
            <Label className="mb-1.5 block">Verso</Label>
            <LazyRichEditor content={back} onChange={setBack} placeholder="Resposta / nota extra" hideCloze />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEditorOpen(false); resetForm(); }}>Cancelar</Button>
            {!editingId && (
              <Button variant="secondary" onClick={() => handleSave(true)} disabled={isSaving || !front}>
                {isSaving ? 'Salvando...' : 'Salvar e Adicionar Outro'}
              </Button>
            )}
            <Button onClick={() => handleSave(false)} disabled={isSaving || !front}>
              {isSaving ? 'Salvando...' : 'Salvar e Fechar'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <Label className="mb-1.5 block">
              {editorType === 'multiple_choice' ? 'Pergunta' : editorType === 'cloze' ? 'Texto com lacunas' : 'Frente (Pergunta)'}
            </Label>
            <LazyRichEditor
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
            <div className="space-y-3">
              {/* Visual cloze preview */}
              {(() => {
                const plainText = front.replace(/<[^>]*>/g, '');
                const clozeRegex = /\{\{c(\d+)::([^}]*)\}\}/g;
                const clozeNumbers = new Set<number>();
                let match;
                while ((match = clozeRegex.exec(plainText)) !== null) {
                  clozeNumbers.add(parseInt(match[1]));
                }
                const sortedNumbers = Array.from(clozeNumbers).sort((a, b) => a - b);

                if (sortedNumbers.length > 0) {
                  const CLOZE_COLORS = [
                    'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40',
                    'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40',
                    'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
                    'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
                    'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40',
                  ];
                  const DOT_COLORS = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

                  // Build highlighted preview
                  const renderHighlighted = () => {
                    const parts: React.ReactNode[] = [];
                    let lastIndex = 0;
                    const regex2 = /\{\{c(\d+)::([^}]*)\}\}/g;
                    let m;
                    let key = 0;
                    while ((m = regex2.exec(plainText)) !== null) {
                      if (m.index > lastIndex) {
                        parts.push(<span key={key++}>{plainText.slice(lastIndex, m.index)}</span>);
                      }
                      const num = parseInt(m[1]);
                      const colorIdx = sortedNumbers.indexOf(num) % CLOZE_COLORS.length;
                      parts.push(
                        <span key={key++} className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 border font-medium ${CLOZE_COLORS[colorIdx]}`}>
                          <span className="text-[9px] font-bold opacity-70">{num}</span>
                          {m[2]}
                        </span>
                      );
                      lastIndex = m.index + m[0].length;
                    }
                    if (lastIndex < plainText.length) {
                      parts.push(<span key={key++}>{plainText.slice(lastIndex)}</span>);
                    }
                    return parts;
                  };

                  return (
                    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                      <div className="p-3 text-sm leading-relaxed">{renderHighlighted()}</div>
                      <div className="border-t border-border bg-muted/30 px-3 py-2 flex items-center gap-2 flex-wrap">
                        {sortedNumbers.map((n, i) => (
                          <span key={n} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <span className={`h-2 w-2 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
                            Cloze {n}
                          </span>
                        ))}
                        {sortedNumbers.length > 1 && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {sortedNumbers.length} cards vinculados
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Como usar</p>
                <p className="text-xs text-muted-foreground">
                  Selecione o texto e clique em <code className="text-primary font-mono bg-primary/10 px-1 rounded">{'{ }'}</code> na barra de ferramentas
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Mesmo número (c1, c1) = mesma lacuna. Números diferentes (c1, c2) = cards separados vinculados.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5 block">Verso (Resposta)</Label>
              <LazyRichEditor content={back} onChange={setBack} placeholder="Paris" hideCloze />
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
            <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.front) }} />
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
          <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.front) }} />
        </div>
        {editorType !== 'cloze' && (
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Verso melhorado</Label>
            <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.back) }} />
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
            <h1 className="font-display text-xl font-bold text-foreground">
              {isCommunityDeck ? 'Cards do Deck' : 'Gerenciar Cards'}
            </h1>
          </div>
          {!isCommunityDeck && (
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Card</span>
            </Button>
          )}
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
                  {card.card_type === 'image_occlusion' ? (() => {
                    try {
                      const data = JSON.parse(card.front_content);
                      const rectCount = data.allRects?.length || 0;
                      return (
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="h-10 w-14 rounded border border-border/50 bg-muted/50 overflow-hidden shrink-0">
                            {data.imageUrl && <img src={data.imageUrl} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <span className="text-xs text-muted-foreground">{rectCount} área{rectCount !== 1 ? 's' : ''} oculta{rectCount !== 1 ? 's' : ''}</span>
                        </div>
                      );
                    } catch {
                      return <p className="text-sm text-muted-foreground">Oclusão de imagem</p>;
                    }
                  })() : (
                    <>
                      <div className="text-sm font-medium text-card-foreground line-clamp-1 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front_content) }} />
                      {card.card_type !== 'multiple_choice' && (
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-1 prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back_content) }} />
                      )}
                    </>
                  )}
                  {card.card_type === 'multiple_choice' && (() => {
                    try {
                      const mc = JSON.parse(card.back_content);
                      return <p className="mt-1 text-xs text-muted-foreground">{mc.options?.length || 0} opções · Resposta: {mc.options?.[mc.correctIndex]}</p>;
                    } catch { return null; }
                  })()}
                </div>
                <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {isCommunityDeck ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setSuggestCard(card)} title="Sugerir correção">
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(card)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(card.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Card Editor Dialog */}
      <Dialog open={editorOpen && !occlusionModalOpen} onOpenChange={open => { if (!open) { setEditorOpen(false); resetForm(); } }}>
        <DialogContent className="max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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

      {/* Occlusion Editor Modal */}
      <Dialog open={occlusionModalOpen} onOpenChange={(open) => { setOcclusionModalOpen(open); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Image className="h-5 w-5 text-primary" />
              Oclusão de Imagem
            </DialogTitle>
          </DialogHeader>
          <OcclusionEditor
            initialFront={front}
            onSave={(frontContent) => {
              // Preserve frontText from existing front state
              try {
                const existing = JSON.parse(front);
                if (existing.frontText) {
                  const newData = JSON.parse(frontContent);
                  newData.frontText = existing.frontText;
                  setFront(JSON.stringify(newData));
                } else {
                  setFront(frontContent);
                }
              } catch {
                setFront(frontContent);
              }
              setOcclusionModalOpen(false);
            }}
            onCancel={() => setOcclusionModalOpen(false)}
            isSaving={false}
          />
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

      {/* Suggest Correction Modal for community decks */}
      {suggestCard && (
        <SuggestCorrectionModal
          open={!!suggestCard}
          onOpenChange={(open) => { if (!open) setSuggestCard(null); }}
          card={suggestCard}
        />
      )}
    </div>
  );
};

export default ManageDeck;
