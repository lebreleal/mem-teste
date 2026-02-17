import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDecks } from '@/hooks/useDecks';
import { useTurmaDecks } from '@/hooks/useTurmaHierarchy';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useStudyStats } from '@/hooks/useStudyStats';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Plus, Trash2, Save, Brain, Flame, Sparkles, PenLine, GripVertical,
  Eye, EyeOff, FileUp, Upload, Loader2, CheckCircle2, ChevronLeft, Clock, Zap, Image, Type, Crown,
} from 'lucide-react';
import AIModelSelector from '@/components/AIModelSelector';
import BuyCreditsDialog from '@/components/BuyCreditsDialog';
import { extractDocumentText } from '@/lib/docUtils';
import { extractPDFPages, splitTextIntoPages, type PDFPageData } from '@/lib/pdfUtils';

type CreationMode = 'manual' | 'ai' | 'file';
type QuestionType = 'written' | 'multiple_choice';

interface ManualQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  correctAnswer: string;
  options: string[];
  correctIndex: number;
  points: number;
}

interface PageItem {
  pageNumber: number;
  thumbnailUrl?: string;
  textContent: string;
  selected: boolean;
}

const createEmptyQuestion = (type: QuestionType): ManualQuestion => ({
  id: crypto.randomUUID(),
  type,
  questionText: '',
  correctAnswer: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  points: type === 'written' ? 2.5 : 1.5,
});

const TurmaExamCreate = () => {
  const { turmaId } = useParams<{ turmaId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { decks: userDecks } = useDecks();
  const { data: turmaDecks = [] } = useTurmaDecks(turmaId!);
  const { energy } = useEnergy();
  const { model, setModel, getCost } = useAIModel();
  const { data: studyStats } = useStudyStats();
  const [creditsOpen, setCreditsOpen] = useState(false);

  const [creationMode, setCreationMode] = useState<CreationMode>('manual');
  const [saving, setSaving] = useState(false);

  // Manual mode state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(0);
  const [isPublished, setIsPublished] = useState(true);
  const [subscribersOnly, setSubscribersOnly] = useState(false);
  const [optionsCount, setOptionsCount] = useState<4 | 5>(4);
  const [questions, setQuestions] = useState<ManualQuestion[]>([
    createEmptyQuestion('multiple_choice'),
    createEmptyQuestion('written'),
  ]);

  // AI mode state
  const [aiDeckId, setAiDeckId] = useState('');
  const [aiTitle, setAiTitle] = useState('');
  const [aiTotalQuestions, setAiTotalQuestions] = useState(10);
  const [aiWrittenCount, setAiWrittenCount] = useState(3);
  const [aiOptionsCount, setAiOptionsCount] = useState<4 | 5>(4);
  const [aiTimeLimit, setAiTimeLimit] = useState(0);

  // File mode state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePages, setFilePages] = useState<PageItem[]>([]);
  const [fileLoadProgress, setFileLoadProgress] = useState({ current: 0, total: 0 });
  const [fileStep, setFileStep] = useState<'upload' | 'loading' | 'pages' | 'config'>('upload');
  const [fileName, setFileName] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileTitle, setFileTitle] = useState('');
  const [fileTotalQuestions, setFileTotalQuestions] = useState(10);
  const [fileWrittenCount, setFileWrittenCount] = useState(3);
  const [fileOptionsCount, setFileOptionsCount] = useState<4 | 5>(4);
  const [fileTimeLimit, setFileTimeLimit] = useState(0);

  // Example reference state (shared by AI and File modes)
  const [exampleMode, setExampleMode] = useState<'none' | 'text' | 'image'>('none');
  const [exampleText, setExampleText] = useState('');
  const [exampleImageUrl, setExampleImageUrl] = useState('');
  const [exampleImageUploading, setExampleImageUploading] = useState(false);
  const exampleImageRef = useRef<HTMLInputElement>(null);

  const activeDecks = userDecks.filter(d => !d.is_archived);
  const aiMcCount = Math.max(0, aiTotalQuestions - aiWrittenCount);
  const totalCost = getCost(aiTotalQuestions * 2);
  const canAfford = energy >= totalCost;
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const selectedFilePages = filePages.filter(p => p.selected);
  const fileMcCount = Math.max(0, fileTotalQuestions - fileWrittenCount);
  const fileTotalCost = getCost(fileTotalQuestions * 2);
  const fileCanAfford = energy >= fileTotalCost;

  // All available decks (turma + personal)
  const allDecks = useMemo(() => {
    const tDecks = turmaDecks.map((td: any) => ({
      id: td.deck_id,
      name: `[Comunidade] ${td.deck_name || 'Baralho'}`,
      isTurma: true,
    }));
    const uDecks = activeDecks.map(d => ({ id: d.id, name: d.name, isTurma: false }));
    return [...tDecks, ...uDecks];
  }, [turmaDecks, activeDecks]);

  // Example image upload handler
  const handleExampleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Envie apenas imagens', variant: 'destructive' });
      return;
    }
    setExampleImageUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `exam-examples/${user!.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('card-images').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
      setExampleImageUrl(urlData.publicUrl);
      setExampleMode('image');
    } catch (err: any) {
      toast({ title: 'Erro ao enviar imagem', description: err.message, variant: 'destructive' });
    } finally {
      setExampleImageUploading(false);
      if (exampleImageRef.current) exampleImageRef.current.value = '';
    }
  };

  const handleExamplePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setExampleImageUploading(true);
        try {
          const ext = file.type.split('/')[1] || 'png';
          const path = `exam-examples/${user!.id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from('card-images').upload(path, file);
          if (error) throw error;
          const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
          setExampleImageUrl(urlData.publicUrl);
          setExampleMode('image');
        } catch (err: any) {
          toast({ title: 'Erro ao enviar imagem', description: err.message, variant: 'destructive' });
        } finally {
          setExampleImageUploading(false);
        }
        return;
      }
    }
  };

  const getExampleInstructions = () => {
    if (exampleMode === 'text' && exampleText.trim()) {
      return `\n\nO usuário forneceu o seguinte exemplo de enunciado e resposta como referência de estilo. Baseie o formato, tom e nível de detalhe das questões geradas neste exemplo:\n---\n${exampleText.trim()}\n---`;
    }
    if (exampleMode === 'image' && exampleImageUrl) {
      return `\n\nO usuário forneceu uma imagem de exemplo como referência de estilo para as questões. A imagem está disponível em: ${exampleImageUrl}. Baseie o formato e estilo das questões neste exemplo visual.`;
    }
    return '';
  };

  const updateQuestion = (id: string, updates: Partial<ManualQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const updateOption = (qId: string, optIdx: number, value: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const newOpts = [...q.options];
      newOpts[optIdx] = value;
      return { ...q, options: newOpts };
    }));
  };

  const removeQuestion = (id: string) => setQuestions(prev => prev.filter(q => q.id !== id));

  // --- File upload handler ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setFileName(file.name);
    setFileStep('loading');
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfPages = await extractPDFPages(file, (cur, tot) => setFileLoadProgress({ current: cur, total: tot }));
        setFilePages(pdfPages.map(p => ({ ...p, selected: true })));
        setFileStep('pages');
      } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
        const text = await file.text();
        const textPages = splitTextIntoPages(text);
        setFilePages(textPages.map(p => ({ ...p, selected: true })));
        setFileStep('pages');
      } else {
        const text = await extractDocumentText(file);
        const cleaned = text.trim();
        if (cleaned.length > 50) {
          const textPages = splitTextIntoPages(cleaned);
          setFilePages(textPages.map(p => ({ ...p, selected: true })));
          setFileStep('pages');
        } else {
          toast({ title: 'Conteúdo limitado', description: 'O arquivo possui pouco texto extraível.', variant: 'destructive' });
          setFileStep('upload');
        }
      }
    } catch (err: any) {
      toast({ title: 'Erro ao ler arquivo', description: err.message, variant: 'destructive' });
      setFileStep('upload');
    } finally {
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleFilePage = (idx: number) => {
    setFilePages(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
  };
  const selectAllFilePages = () => setFilePages(prev => prev.map(p => ({ ...p, selected: true })));
  const deselectAllFilePages = () => setFilePages(prev => prev.map(p => ({ ...p, selected: false })));

  // --- Manual save ---
  const handleManualSave = async () => {
    const valid = questions.filter(q => q.questionText.trim());
    if (!title.trim()) {
      toast({ title: 'Insira um título', variant: 'destructive' });
      return;
    }
    if (valid.length === 0) {
      toast({ title: 'Adicione pelo menos 1 questão', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: exam, error } = await supabase
        .from('turma_exams')
        .insert({
          turma_id: turmaId!,
          created_by: user!.id,
          title: title.trim(),
          description: description.trim() || null,
          time_limit_seconds: timeLimit > 0 ? timeLimit * 60 : null,
          is_published: isPublished,
          subscribers_only: subscribersOnly,
          total_questions: valid.length,
        } as any)
        .select()
        .single();
      if (error) throw error;

      const questionsToInsert = valid.map((q, idx) => {
        if (q.type === 'multiple_choice') {
          const opts = q.options.slice(0, optionsCount).filter(o => o.trim());
          return {
            exam_id: (exam as any).id,
            question_text: q.questionText,
            question_type: 'multiple_choice',
            options: opts,
            correct_answer: opts[q.correctIndex] || '',
            correct_indices: [q.correctIndex],
            points: q.points,
            sort_order: idx,
          };
        }
        return {
          exam_id: (exam as any).id,
          question_text: q.questionText,
          question_type: 'written',
          correct_answer: q.correctAnswer,
          points: q.points,
          sort_order: idx,
        };
      });

      const { error: qError } = await supabase.from('turma_exam_questions').insert(questionsToInsert as any);
      if (qError) throw qError;

      queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
      toast({ title: 'Prova criada com sucesso!' });
      navigate(`/turmas/${turmaId}`);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Erro ao criar prova', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // --- AI from deck ---
  const handleAIGenerate = async () => {
    if (!aiDeckId) {
      toast({ title: 'Selecione um baralho', variant: 'destructive' });
      return;
    }
    if (!canAfford) {
      toast({ title: 'Créditos IA insuficientes', variant: 'destructive' });
      return;
    }

    // Navigate back immediately, generate in background
    toast({ title: '🧠 Gerando prova...', description: 'Você será notificado quando estiver pronta.' });
    navigate(`/turmas/${turmaId}`);

    try {
      const { data: cards, error } = await supabase.from('cards').select('*').eq('deck_id', aiDeckId);
      if (error) throw error;
      if (!cards?.length) throw new Error('Baralho sem cards');

      const textContent = cards.map(c => {
        const front = c.front_content.replace(/<[^>]*>/g, '').trim();
        const back = c.back_content.replace(/<[^>]*>/g, '').trim();
        return `Q: ${front}\nA: ${back}`;
      }).join('\n\n');

      const exampleInstr = getExampleInstructions();

      const { data, error: fnError } = await supabase.functions.invoke('generate-deck', {
        body: {
          textContent,
          cardCount: aiTotalQuestions,
          detailLevel: 'standard',
          cardFormats: [...(aiMcCount > 0 ? ['multiple_choice'] : []), ...(aiWrittenCount > 0 ? ['qa'] : [])],
          customInstructions: `PROVA ACADÊMICA. Gere ${aiMcCount} questões de múltipla escolha (${aiOptionsCount} alternativas cada) e ${aiWrittenCount} dissertativas.
Cada questão DEVE ter um ENUNCIADO (caso clínico, situação-problema ou texto-base) na "front", separado da pergunta por "---".
Dissertativas: "front" = enunciado + pergunta, "back" = resposta completa.
Baseie-se APENAS no material fornecido. Varie a dificuldade.${exampleInstr}`,
          aiModel: model,
          energyCost: totalCost,
        },
      });

      if (fnError || data?.error) throw new Error(data?.error || 'Erro na geração');
      queryClient.invalidateQueries({ queryKey: ['energy'] });

      const generatedCards = data.cards as Array<{ front: string; back: string; type: string; options?: string[]; correctIndex?: number }>;
      const examTitle = aiTitle.trim() || `Prova - ${allDecks.find(d => d.id === aiDeckId)?.name || 'IA'}`;

      const { data: exam, error: examError } = await supabase
        .from('turma_exams')
        .insert({
          turma_id: turmaId!,
          created_by: user!.id,
          title: examTitle,
          time_limit_seconds: aiTimeLimit > 0 ? aiTimeLimit * 60 : null,
          is_published: isPublished,
          subscribers_only: subscribersOnly,
          total_questions: generatedCards.length,
        } as any)
        .select()
        .single();
      if (examError) throw examError;

      const questionsToInsert = generatedCards.map((card, idx) => {
        if (card.type === 'multiple_choice' && card.options) {
          return {
            exam_id: (exam as any).id,
            question_type: 'multiple_choice',
            question_text: card.front,
            options: card.options.slice(0, aiOptionsCount),
            correct_answer: card.options[card.correctIndex ?? 0] || '',
            correct_indices: [card.correctIndex ?? 0],
            points: 1.5,
            sort_order: idx,
          };
        }
        return {
          exam_id: (exam as any).id,
          question_type: 'written',
          question_text: card.front,
          correct_answer: card.back,
          points: 2.5,
          sort_order: idx,
        };
      });

      const { error: qError } = await supabase.from('turma_exam_questions').insert(questionsToInsert as any);
      if (qError) throw qError;

      queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
      toast({ title: '✅ Prova criada com IA!' });
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Erro ao gerar prova', description: err.message, variant: 'destructive' });
    }
  };

  // --- File-based AI generation ---
  const handleFileGenerate = async () => {
    const selected = filePages.filter(p => p.selected && p.textContent.trim().length > 0);
    if (selected.length === 0) {
      toast({ title: 'Nenhuma página com texto selecionada', variant: 'destructive' });
      return;
    }
    if (!fileCanAfford) {
      toast({ title: 'Créditos IA insuficientes', variant: 'destructive' });
      return;
    }

    const examTitle = fileTitle.trim() || `Prova - ${fileName}`;
    const fileText = selected.map(p => p.textContent).join('\n\n');
    const exampleInstr = getExampleInstructions();

    // Navigate back immediately, generate in background
    toast({ title: '🧠 Gerando prova...', description: 'Você será notificado quando estiver pronta.' });
    navigate(`/turmas/${turmaId}`);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-deck', {
        body: {
          textContent: fileText.slice(0, 50000),
          cardCount: fileTotalQuestions,
          detailLevel: 'standard',
          cardFormats: [...(fileMcCount > 0 ? ['multiple_choice'] : []), ...(fileWrittenCount > 0 ? ['qa'] : [])],
          customInstructions: `PROVA ACADÊMICA baseada em arquivo. Gere ${fileMcCount} questões de múltipla escolha (${fileOptionsCount} alternativas cada) e ${fileWrittenCount} dissertativas.
Cada questão DEVE ter um ENUNCIADO (caso clínico, situação-problema ou texto-base) na "front", separado da pergunta por "---".
Trate cada página como unidade temática independente. NÃO misture conteúdos de páginas diferentes. NÃO invente informações.
Dissertativas: "front" = enunciado + pergunta, "back" = resposta completa. Varie a dificuldade.${exampleInstr}`,
          aiModel: model,
          energyCost: fileTotalCost,
        },
      });

      if (fnError || data?.error) throw new Error(data?.error || 'Erro na geração');
      queryClient.invalidateQueries({ queryKey: ['energy'] });

      const generatedCards = data.cards as Array<{ front: string; back: string; type: string; options?: string[]; correctIndex?: number }>;

      const { data: exam, error: examError } = await supabase
        .from('turma_exams')
        .insert({
          turma_id: turmaId!,
          created_by: user!.id,
          title: examTitle,
          time_limit_seconds: fileTimeLimit > 0 ? fileTimeLimit * 60 : null,
          is_published: isPublished,
          subscribers_only: subscribersOnly,
          total_questions: generatedCards.length,
        } as any)
        .select()
        .single();
      if (examError) throw examError;

      const questionsToInsert = generatedCards.map((card, idx) => {
        if (card.type === 'multiple_choice' && card.options) {
          return {
            exam_id: (exam as any).id,
            question_type: 'multiple_choice',
            question_text: card.front,
            options: card.options.slice(0, fileOptionsCount),
            correct_answer: card.options[card.correctIndex ?? 0] || '',
            correct_indices: [card.correctIndex ?? 0],
            points: 1.5,
            sort_order: idx,
          };
        }
        return {
          exam_id: (exam as any).id,
          question_type: 'written',
          question_text: card.front,
          correct_answer: card.back,
          points: 2.5,
          sort_order: idx,
        };
      });

      const { error: qError } = await supabase.from('turma_exam_questions').insert(questionsToInsert as any);
      if (qError) throw qError;

      queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
      toast({ title: '✅ Prova criada com IA!' });
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Erro ao gerar prova', description: err.message, variant: 'destructive' });
    }
  };

  // --- Example Reference Component ---
  const ExampleReferenceSection = () => (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Exemplo de referência (opcional)</Label>
      <p className="text-[11px] text-muted-foreground -mt-1">Forneça um exemplo de enunciado e resposta para a IA se basear no estilo.</p>
      <div className="flex gap-2">
        {([
          { mode: 'none' as const, label: 'Nenhum', icon: null },
          { mode: 'text' as const, label: 'Texto', icon: Type },
          { mode: 'image' as const, label: 'Imagem', icon: Image },
        ]).map(({ mode: m, label, icon: Icon }) => (
          <button
            key={m}
            onClick={() => setExampleMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border-2 py-2 text-xs font-bold transition-all ${
              exampleMode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {exampleMode === 'text' && (
        <Textarea
          placeholder="Cole aqui um exemplo de enunciado e resposta para a IA usar como referência de estilo..."
          value={exampleText}
          onChange={e => setExampleText(e.target.value)}
          className="min-h-[100px] text-sm"
        />
      )}

      {exampleMode === 'image' && (
        <div className="space-y-2" onPaste={handleExamplePaste}>
          <input
            ref={exampleImageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleExampleImageUpload}
          />
          {exampleImageUrl ? (
            <div className="relative">
              <img src={exampleImageUrl} alt="Exemplo" className="w-full rounded-xl border border-border object-contain max-h-48" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => { setExampleImageUrl(''); setExampleMode('none'); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => exampleImageRef.current?.click()}
              disabled={exampleImageUploading}
              className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 transition-colors hover:bg-muted/50 hover:border-primary/30"
            >
              {exampleImageUploading ? (
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              ) : (
                <Image className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {exampleImageUploading ? 'Enviando...' : 'Envie ou cole (Ctrl+V) um print'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => {
              if (creationMode === 'file' && fileStep === 'config') { setFileStep('pages'); return; }
              if (creationMode === 'file' && fileStep === 'pages') { setFileStep('upload'); setFilePages([]); return; }
              navigate(`/turmas/${turmaId}`);
            }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-display text-base font-bold text-foreground">
                {creationMode === 'file' && fileStep === 'pages' ? 'Selecionar Páginas' : creationMode === 'file' && fileStep === 'config' ? 'Configurar Prova' : 'Nova Prova'}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {creationMode === 'file' && fileStep === 'pages' ? 'Escolha quais páginas usar' : 'Configure e crie sua prova'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/activity?tab=streak')} className="flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors hover:bg-muted/50" style={{ background: 'hsl(var(--warning) / 0.1)' }}>
              <Flame className="h-3.5 w-3.5" style={{ color: 'hsl(var(--warning))' }} />
              <span className="text-xs font-bold text-foreground tabular-nums">{studyStats?.streak ?? 0}</span>
            </button>
            <button onClick={() => setCreditsOpen(true)} className="flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors hover:bg-muted/50" style={{ background: 'hsl(var(--energy-purple) / 0.1)' }}>
              <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple))' }} />
              <span className="text-xs font-bold text-foreground tabular-nums">{energy}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="overflow-y-auto h-[calc(100vh-57px)]">
        <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6 pb-24">
          {/* Mode Tabs - only when file is at upload step */}
          {fileStep === 'upload' && (
            <div className="grid grid-cols-3 gap-2">
              {([
                { mode: 'ai' as const, icon: Sparkles, label: 'IA + Baralho', desc: 'Gera a partir de um deck' },
                { mode: 'file' as const, icon: FileUp, label: 'IA + Arquivo', desc: 'Gera a partir de PDF/DOCX' },
                { mode: 'manual' as const, icon: PenLine, label: 'Manual', desc: 'Crie suas questões' },
              ]).map(({ mode, icon: Icon, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => setCreationMode(mode)}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                    creationMode === mode
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                      : 'border-border bg-card hover:bg-muted/50 hover:border-border/80'
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    creationMode === mode ? 'bg-primary/15' : 'bg-muted'
                  }`}>
                    <Icon className={`h-5 w-5 ${creationMode === mode ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="text-center">
                    <span className={`text-xs font-bold block ${creationMode === mode ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                    <span className="text-[9px] text-muted-foreground leading-tight">{desc}</span>
                  </div>
                  {creationMode === mode && (
                    <div className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ===== MANUAL MODE ===== */}
          {creationMode === 'manual' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input placeholder="Ex: Prova de Anatomia" value={title} onChange={e => setTitle(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea placeholder="Descrição da prova..." value={description} onChange={e => setDescription(e.target.value)} className="mt-1.5" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tempo limite (min)</Label>
                    <Input type="number" min={0} value={timeLimit || ''} onChange={e => setTimeLimit(Number(e.target.value))} placeholder="Sem limite" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Alternativas por questão</Label>
                    <Select value={String(optionsCount)} onValueChange={v => setOptionsCount(Number(v) as 4 | 5)}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4 alternativas</SelectItem>
                        <SelectItem value="5">5 alternativas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                  onClick={() => setIsPublished(!isPublished)}
                >
                  <div className="flex items-center gap-2">
                    {isPublished ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-foreground font-medium">{isPublished ? 'Publicar imediatamente' : 'Salvar como rascunho'}</span>
                  </div>
                  <div className={`h-5 w-9 rounded-full transition-colors ${isPublished ? 'bg-success' : 'bg-muted'} relative`}>
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${isPublished ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </button>

                {/* Subscribers only toggle */}
                <button
                  type="button"
                  className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                  onClick={() => setSubscribersOnly(!subscribersOnly)}
                >
                  <div className="flex items-center gap-2">
                    <Crown className={`h-4 w-4 ${subscribersOnly ? 'text-[hsl(270,60%,55%)]' : 'text-muted-foreground'}`} />
                    <span className="text-foreground font-medium">{subscribersOnly ? 'Apenas para assinantes' : 'Disponível para todos'}</span>
                  </div>
                  <div className={`h-5 w-9 rounded-full transition-colors ${subscribersOnly ? 'bg-[hsl(270,60%,55%)]' : 'bg-muted'} relative`}>
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${subscribersOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              </div>

              {/* Questions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Questões ({questions.length}) · {totalPoints} pts
                  </h2>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setQuestions(prev => [...prev, createEmptyQuestion('multiple_choice')])} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Objetiva
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setQuestions(prev => [...prev, createEmptyQuestion('written')])} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Dissertativa
                    </Button>
                  </div>
                </div>

                {questions.map((q, idx) => (
                  <div key={q.id} className="rounded-xl border border-border/50 bg-card p-4 space-y-3" style={{ borderRadius: 'var(--radius)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        <span className="text-xs font-bold text-primary">{idx + 1}</span>
                        <Select value={q.type} onValueChange={v => updateQuestion(q.id, { type: v as QuestionType, points: v === 'written' ? 2.5 : 1.5 })}>
                          <SelectTrigger className="h-7 w-auto text-xs border-none bg-muted/50 px-2"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="multiple_choice">Objetiva</SelectItem>
                            <SelectItem value="written">Dissertativa</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="number" step="0.5" min={0} value={q.points} onChange={e => updateQuestion(q.id, { points: Number(e.target.value) })} className="h-7 w-16 text-xs" />
                        <span className="text-[10px] text-muted-foreground">pts</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeQuestion(q.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Textarea placeholder="Enunciado da questão" value={q.questionText} onChange={e => updateQuestion(q.id, { questionText: e.target.value })} className="min-h-[60px]" />

                    {q.type === 'written' ? (
                      <Textarea placeholder="Resposta esperada" value={q.correctAnswer} onChange={e => updateQuestion(q.id, { correctAnswer: e.target.value })} className="min-h-[60px] border-success/30" />
                    ) : (
                      <div className="space-y-2">
                        {Array.from({ length: optionsCount }).map((_, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuestion(q.id, { correctIndex: optIdx })}
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                                q.correctIndex === optIdx ? 'border-success bg-success text-white' : 'border-muted-foreground/30 hover:border-muted-foreground'
                              }`}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </button>
                            <Input
                              placeholder={`Alternativa ${String.fromCharCode(65 + optIdx)}`}
                              value={q.options[optIdx] || ''}
                              onChange={e => updateOption(q.id, optIdx, e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground">Clique na letra para marcar a alternativa correta</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button className="w-full gap-2 h-12" onClick={handleManualSave} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Prova'}
              </Button>
            </div>
          )}

          {/* ===== AI + DECK MODE ===== */}
          {creationMode === 'ai' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground">Configurar Prova IA</h2>
                    <p className="text-xs text-muted-foreground">Gerar questões a partir de um baralho</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold">Baralho base *</Label>
                    <Select value={aiDeckId} onValueChange={setAiDeckId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
                      <SelectContent>
                        {allDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Título (opcional)</Label>
                    <Input placeholder="Gerado automaticamente se vazio" value={aiTitle} onChange={e => setAiTitle(e.target.value)} className="mt-1.5" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold">Total de questões</Label>
                      <Input type="number" min={1} max={30} value={aiTotalQuestions} onChange={e => {
                        const v = Math.max(1, Math.min(30, parseInt(e.target.value) || 1));
                        setAiTotalQuestions(v);
                        if (aiWrittenCount > v) setAiWrittenCount(v);
                      }} className="mt-1.5" />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">Dissertativas</Label>
                      <Input type="number" min={0} max={aiTotalQuestions} value={aiWrittenCount} onChange={e => setAiWrittenCount(Math.max(0, Math.min(aiTotalQuestions, parseInt(e.target.value) || 0)))} className="mt-1.5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-2">{aiMcCount} múltipla escolha + {aiWrittenCount} dissertativas</p>

                  {aiMcCount > 0 && (
                    <div>
                      <Label className="text-sm font-semibold">Alternativas por questão</Label>
                      <div className="flex gap-2 mt-1.5">
                        {([4, 5] as const).map(n => (
                          <button key={n} onClick={() => setAiOptionsCount(n)} className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                            aiOptionsCount === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}>{n} opções</button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tempo limite (min)</Label>
                    <Input type="number" min={0} className="mt-1.5" placeholder="0 = sem limite" value={aiTimeLimit || ''} onChange={e => setAiTimeLimit(Math.max(0, parseInt(e.target.value) || 0))} />
                  </div>

                  <ExampleReferenceSection />

                  <div>
                    <Label className="text-sm font-semibold">Modelo de IA</Label>
                    <div className="mt-1.5">
                      <AIModelSelector model={model} onChange={setModel} baseCost={aiTotalQuestions * 2} />
                    </div>
                  </div>

                  {/* Publish toggle */}
                  <button
                    type="button"
                    className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                    onClick={() => setIsPublished(!isPublished)}
                  >
                    <div className="flex items-center gap-2">
                      {isPublished ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-foreground font-medium">{isPublished ? 'Publicar imediatamente' : 'Salvar como rascunho'}</span>
                    </div>
                    <div className={`h-5 w-9 rounded-full transition-colors ${isPublished ? 'bg-success' : 'bg-muted'} relative`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${isPublished ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </button>

                  {/* Subscribers only toggle */}
                  <button
                    type="button"
                    className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                    onClick={() => setSubscribersOnly(!subscribersOnly)}
                  >
                    <div className="flex items-center gap-2">
                      <Crown className={`h-4 w-4 ${subscribersOnly ? 'text-[hsl(270,60%,55%)]' : 'text-muted-foreground'}`} />
                      <span className="text-foreground font-medium">{subscribersOnly ? 'Apenas para assinantes' : 'Disponível para todos'}</span>
                    </div>
                    <div className={`h-5 w-9 rounded-full transition-colors ${subscribersOnly ? 'bg-[hsl(270,60%,55%)]' : 'bg-muted'} relative`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${subscribersOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </button>
                </div>
              </div>

              <div className={`rounded-2xl border px-5 py-4 ${canAfford ? 'border-primary/20 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Custo estimado</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${canAfford ? 'text-primary' : 'text-destructive'}`}>{totalCost} Créditos IA</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{aiTotalQuestions} questões × 2 créditos{model === 'pro' ? ' × 5' : ''}</p>
              </div>

              <Button className="w-full gap-2 h-12 text-base" size="lg" onClick={handleAIGenerate} disabled={saving || !canAfford || !aiDeckId}>
                <Sparkles className="h-5 w-5" /> {saving ? 'Gerando...' : 'Gerar Prova com IA'}
              </Button>

              {!canAfford && (
                <Button variant="outline" className="w-full gap-2" onClick={() => setCreditsOpen(true)}>
                  <Brain className="h-4 w-4" /> Obter mais créditos
                </Button>
              )}
            </div>
          )}

          {/* ===== FILE MODE ===== */}
          {creationMode === 'file' && (
            <div className="space-y-5">
              {fileStep === 'upload' && (
                <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
                      <FileUp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-foreground">Prova a partir de Arquivo</h2>
                      <p className="text-xs text-muted-foreground">Envie um PDF, PPTX, DOCX ou TXT</p>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.txt" className="hidden" onChange={handleFileUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={fileLoading}
                    className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 transition-colors hover:bg-muted/50 hover:border-primary/30"
                  >
                    {fileLoading ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{fileLoading ? 'Processando...' : 'Clique para enviar PDF, PPTX, DOCX ou TXT'}</span>
                  </button>
                </div>
              )}

              {fileStep === 'loading' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processando página {fileLoadProgress.current} de {fileLoadProgress.total}...</p>
                  {fileLoadProgress.total > 0 && <Progress value={(fileLoadProgress.current / fileLoadProgress.total) * 100} className="h-2 w-48" />}
                </div>
              )}

              {fileStep === 'pages' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">Selecione as páginas</p>
                      <p className="text-[11px] text-muted-foreground">{fileName}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={selectAllFilePages}>Todas</Button>
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={deselectAllFilePages}>Nenhuma</Button>
                    </div>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {filePages.map((page, idx) => (
                        <button
                          key={idx}
                          onClick={() => toggleFilePage(idx)}
                          className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                            page.selected ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border opacity-60 hover:opacity-80'
                          }`}
                        >
                          {page.thumbnailUrl ? (
                            <img src={page.thumbnailUrl} alt={`Página ${page.pageNumber}`} className="w-full aspect-[4/3] object-cover bg-white" />
                          ) : (
                            <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center p-2">
                              <p className="text-[8px] text-muted-foreground line-clamp-4 text-center leading-tight">{page.textContent.slice(0, 120)}...</p>
                            </div>
                          )}
                          {page.selected && (
                            <div className="absolute top-1.5 right-1.5">
                              <CheckCircle2 className="h-5 w-5 text-primary drop-shadow-md" fill="hsl(var(--background))" />
                            </div>
                          )}
                          <p className="text-center text-[10px] font-medium text-muted-foreground py-1">{page.pageNumber}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">{selectedFilePages.length}</span> páginas selecionadas
                    </div>
                    <Button onClick={() => setFileStep('config')} disabled={selectedFilePages.length === 0} className="gap-2">
                      Continuar <ChevronLeft className="h-4 w-4 rotate-180" />
                    </Button>
                  </div>
                </div>
              )}

              {fileStep === 'config' && (
                <>
                  <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
                        <FileUp className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-display text-lg font-bold text-foreground">Configurar Prova</h2>
                        <p className="text-xs text-muted-foreground">{selectedFilePages.length} páginas de "{fileName}"</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-semibold">Título (opcional)</Label>
                        <Input className="mt-1.5" placeholder="Ex: Prova de Anatomia" value={fileTitle} onChange={e => setFileTitle(e.target.value)} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm font-semibold">Total questões</Label>
                          <Input type="number" min={1} max={50} className="mt-1.5" value={fileTotalQuestions} onChange={e => {
                            const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
                            setFileTotalQuestions(v);
                            if (fileWrittenCount > v) setFileWrittenCount(v);
                          }} />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">Dissertativas</Label>
                          <Input type="number" min={0} max={fileTotalQuestions} className="mt-1.5" value={fileWrittenCount}
                            onChange={e => setFileWrittenCount(Math.max(0, Math.min(fileTotalQuestions, parseInt(e.target.value) || 0)))} />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground -mt-2">{fileMcCount} múltipla escolha + {fileWrittenCount} dissertativas</p>

                      {fileMcCount > 0 && (
                        <div>
                          <Label className="text-sm font-semibold">Alternativas por questão</Label>
                          <div className="flex gap-2 mt-1.5">
                            {([4, 5] as const).map(n => (
                              <button key={n} onClick={() => setFileOptionsCount(n)} className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                                fileOptionsCount === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
                              }`}>{n} opções</button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <Label className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tempo limite (min)</Label>
                        <Input type="number" min={0} className="mt-1.5" placeholder="0 = sem limite" value={fileTimeLimit || ''} onChange={e => setFileTimeLimit(Math.max(0, parseInt(e.target.value) || 0))} />
                      </div>

                      <ExampleReferenceSection />

                      <div>
                        <Label className="text-sm font-semibold">Modelo de IA</Label>
                        <div className="mt-1.5">
                          <AIModelSelector model={model} onChange={setModel} baseCost={fileTotalQuestions * 2} />
                        </div>
                      </div>

                      {/* Publish toggle */}
                      <button
                        type="button"
                        className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                        onClick={() => setIsPublished(!isPublished)}
                      >
                        <div className="flex items-center gap-2">
                          {isPublished ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                          <span className="text-foreground font-medium">{isPublished ? 'Publicar imediatamente' : 'Salvar como rascunho'}</span>
                        </div>
                        <div className={`h-5 w-9 rounded-full transition-colors ${isPublished ? 'bg-success' : 'bg-muted'} relative`}>
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${isPublished ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                      </button>

                      {/* Subscribers only toggle */}
                      <button
                        type="button"
                        className="flex items-center justify-between w-full rounded-lg border border-border/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                        onClick={() => setSubscribersOnly(!subscribersOnly)}
                      >
                        <div className="flex items-center gap-2">
                          <Crown className={`h-4 w-4 ${subscribersOnly ? 'text-[hsl(270,60%,55%)]' : 'text-muted-foreground'}`} />
                          <span className="text-foreground font-medium">{subscribersOnly ? 'Apenas para assinantes' : 'Disponível para todos'}</span>
                        </div>
                        <div className={`h-5 w-9 rounded-full transition-colors ${subscribersOnly ? 'bg-[hsl(270,60%,55%)]' : 'bg-muted'} relative`}>
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${subscribersOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-2xl border px-5 py-4 ${fileCanAfford ? 'border-primary/20 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">Custo estimado</span>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${fileCanAfford ? 'text-primary' : 'text-destructive'}`}>{fileTotalCost} Créditos IA</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{fileTotalQuestions} questões × 2 créditos{model === 'pro' ? ' × 5' : ''}</p>
                  </div>

                  <Button className="w-full gap-2 h-12 text-base" size="lg" onClick={handleFileGenerate} disabled={saving || selectedFilePages.length === 0 || !fileCanAfford}>
                    <Sparkles className="h-5 w-5" /> {saving ? 'Gerando...' : 'Gerar Prova com IA'}
                  </Button>

                  {!fileCanAfford && (
                    <Button variant="outline" className="w-full gap-2" onClick={() => setCreditsOpen(true)}>
                      <Brain className="h-4 w-4" /> Obter mais créditos
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <BuyCreditsDialog open={creditsOpen} onOpenChange={setCreditsOpen} currentBalance={energy} />
    </div>
  );
};

export default TurmaExamCreate;
