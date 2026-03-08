/**
 * Hook that encapsulates all ExamCreate page state and handlers.
 * Keeps ExamCreate.tsx as a thin visual orchestrator.
 */

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useDecks } from '@/hooks/useDecks';
import { useExams, useExamDetail } from '@/hooks/useExams';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useExamNotifications } from '@/hooks/useExamNotifications';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

import { extractPDFPages, splitTextIntoPages } from '@/lib/pdfUtils';
import { fetchCards } from '@/services/cardService';
import { invokeGenerateExamQuestions } from '@/services/aiService';
import { createEmptyQuestion, type CreationMode, type ManualQuestion, type ManualQuestionType, type PageItem } from '@/components/exam-create/types';

export function useExamCreateFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { examId } = useParams<{ examId: string }>();
  const isEditing = !!examId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { decks } = useDecks();
  const { createExam, updateExam } = useExams();
  const { energy, spendEnergy } = useEnergy();
  const { model, setModel, getCost } = useAIModel();
  const { data: studyStats } = useStudyStats();
  const { addNotification, updateNotification } = useExamNotifications();
  const [creditsOpen, setCreditsOpen] = useState(false);

  const { exam: existingExam, questions: existingQuestions, isLoading: examLoading } = useExamDetail(examId ?? '');

  const preselectedDeckId = searchParams.get('deckId') || '';
  const [creationMode, setCreationMode] = useState<CreationMode>('manual');

  // AI mode state
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [title, setTitle] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [writtenCount, setWrittenCount] = useState(3);
  const [optionsCount, setOptionsCount] = useState<4 | 5>(4);
  const [timeLimit, setTimeLimit] = useState(0);

  // Manual mode state
  const [manualTitle, setManualTitle] = useState('');
  const [manualTimeLimit, setManualTimeLimit] = useState(0);
  const [manualQuestions, setManualQuestions] = useState<ManualQuestion[]>([
    createEmptyQuestion('multiple_choice'),
    createEmptyQuestion('written'),
  ]);
  const [manualOptionsCount, setManualOptionsCount] = useState<4 | 5>(4);
  const [isSaving, setIsSaving] = useState(false);

  // File mode state
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Example reference state
  const [exampleMode, setExampleMode] = useState<'none' | 'text' | 'image'>('none');
  const [exampleText, setExampleText] = useState('');
  const [exampleImageUrl, setExampleImageUrl] = useState('');
  const [exampleImageUploading, setExampleImageUploading] = useState(false);

  const activeDecks = decks.filter(d => !d.is_archived);
  const mcCount = Math.max(0, totalQuestions - writtenCount);
  const totalCost = getCost(totalQuestions * 2);
  const canAfford = energy >= totalCost;

  const fileMcCount = Math.max(0, fileTotalQuestions - fileWrittenCount);
  const fileTotalCost = getCost(fileTotalQuestions * 2);
  const fileCanAfford = energy >= fileTotalCost;

  const getExampleInstructions = () => {
    if (exampleMode === 'text' && exampleText.trim()) {
      return `\n\nO usuário forneceu o seguinte exemplo de enunciado e resposta como referência de estilo. Baseie o formato, tom e nível de detalhe das questões geradas neste exemplo:\n---\n${exampleText.trim()}\n---`;
    }
    if (exampleMode === 'image' && exampleImageUrl) {
      return `\n\nO usuário forneceu uma imagem de exemplo como referência de estilo para as questões. A imagem está disponível em: ${exampleImageUrl}. Baseie o formato e estilo das questões neste exemplo visual.`;
    }
    return '';
  };

  // Populate form when editing
  useEffect(() => {
    if (preselectedDeckId && !selectedDeckId) setSelectedDeckId(preselectedDeckId);
  }, [preselectedDeckId]);

  useEffect(() => {
    if (isEditing && existingExam && existingQuestions.length > 0) {
      setManualTitle(existingExam.title);
      setSelectedDeckId(existingExam.deck_id);
      setManualTimeLimit(existingExam.time_limit_seconds ? Math.floor(existingExam.time_limit_seconds / 60) : 0);
      setCreationMode('manual');

      const loaded: ManualQuestion[] = existingQuestions.map(q => {
        const opts = Array.isArray(q.options) ? q.options as string[] : ['', '', '', ''];
        return {
          id: q.id,
          type: q.question_type as ManualQuestionType,
          questionText: q.question_text,
          correctAnswer: q.correct_answer,
          options: [...opts, ...Array(4 - opts.length).fill('')].slice(0, 5),
          correctIndex: q.correct_indices?.[0] ?? 0,
          points: q.points,
        };
      });
      setManualQuestions(loaded);

      const firstMc = existingQuestions.find(q => q.question_type === 'multiple_choice');
      if (firstMc && Array.isArray(firstMc.options)) {
        setManualOptionsCount((firstMc.options as string[]).length >= 5 ? 5 : 4);
      }
    }
  }, [isEditing, existingExam, existingQuestions]);

  // --- AI Generation ---
  const handleAIGenerate = async () => {
    if (!selectedDeckId) { toast({ title: 'Selecione um baralho', variant: 'destructive' }); return; }
    if (!canAfford) { toast({ title: 'Créditos IA insuficientes', variant: 'destructive' }); return; }

    const notifId = crypto.randomUUID();
    const deck = activeDecks.find(d => d.id === selectedDeckId);
    const examTitle = title.trim() || `Prova - ${deck?.name || 'Sem nome'}`;

    addNotification({ id: notifId, title: examTitle, examId: '', status: 'generating', message: 'Gerando questões com IA...' });
    toast({ title: '🧠 Gerando prova...', description: 'Você será notificado quando estiver pronta.' });
    navigate('/exam/new');

    try {
      const cards = await fetchCards(selectedDeckId);
      if (!cards?.length) throw new Error('Baralho sem cards');

      const textContent = cards.map((c: any) => {
        const front = c.front_content.replace(/<[^>]*>/g, '').trim();
        const back = c.back_content.replace(/<[^>]*>/g, '').trim();
        return `Q: ${front}\nA: ${back}`;
      }).join('\n\n');

      const data = await invokeGenerateExamQuestions({
        textContent,
        cardCount: totalQuestions,
        detailLevel: 'standard',
        cardFormats: [...(mcCount > 0 ? ['multiple_choice'] : []), ...(writtenCount > 0 ? ['qa'] : [])],
        customInstructions: `PROVA ACADÊMICA. Gere ${mcCount} questões de múltipla escolha (${optionsCount} alternativas cada) e ${writtenCount} dissertativas.
PROIBIDO CLOZE: NÃO use formato cloze, NÃO use {{c1::...}} ou lacunas. Apenas "basic" (dissertativa) e "multiple_choice".
Cada questão DEVE ter um ENUNCIADO (caso clínico, situação-problema ou texto-base) na "front", separado da pergunta por "---".
Dissertativas: "front" = enunciado + pergunta, "back" = resposta completa.
Baseie-se APENAS no material fornecido. Varie a dificuldade.${getExampleInstructions()}`,
        aiModel: model,
        energyCost: totalCost,
      });

      queryClient.invalidateQueries({ queryKey: ['profile'] });

      const generatedCards = data.cards as Array<{ front: string; back: string; type: string; options?: string[]; correctIndex?: number }>;
      const questions = generatedCards.map((card, idx) => {
        if (card.type === 'multiple_choice' && card.options) {
          return {
            question_type: 'multiple_choice' as const,
            question_text: card.front,
            options: card.options.slice(0, optionsCount),
            correct_answer: card.options[card.correctIndex ?? 0] || '',
            correct_indices: [card.correctIndex ?? 0],
            points: 1.5,
            sort_order: idx,
          };
        }
        return { question_type: 'written' as const, question_text: card.front, correct_answer: card.back, points: 2.5, sort_order: idx };
      });

      const exam = await createExam.mutateAsync({
        deckId: selectedDeckId,
        title: examTitle,
        questions,
        timeLimitSeconds: timeLimit > 0 ? timeLimit * 60 : undefined,
      });

      updateNotification(notifId, { status: 'ready', examId: exam.id, message: 'Prova pronta!' });
    } catch (err: any) {
      console.error(err);
      updateNotification(notifId, { status: 'error', message: err.message || 'Erro ao gerar prova' });
    }
  };

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
        const { extractDocumentText } = await import('@/lib/docUtils');
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

  // --- File-based AI generation ---
  const handleFileGenerate = async () => {
    const selected = filePages.filter(p => p.selected && p.textContent.trim().length > 0);
    if (selected.length === 0) { toast({ title: 'Nenhuma página com texto selecionada', variant: 'destructive' }); return; }
    if (!fileCanAfford) { toast({ title: 'Créditos IA insuficientes', variant: 'destructive' }); return; }

    const notifId = crypto.randomUUID();
    const examTitle = fileTitle.trim() || `Prova - ${fileName}`;
    const deckId = selectedDeckId || activeDecks[0]?.id || '';
    const fileText = selected.map(p => p.textContent).join('\n\n');

    addNotification({ id: notifId, title: examTitle, examId: '', status: 'generating', message: 'Gerando questões com IA...' });
    toast({ title: '🧠 Gerando prova...', description: 'Você será notificado quando estiver pronta.' });
    navigate('/exam/new');

    try {
      const data = await invokeGenerateExamQuestions({
        textContent: fileText.slice(0, 50000),
        cardCount: fileTotalQuestions,
        detailLevel: 'standard',
        cardFormats: [...(fileMcCount > 0 ? ['multiple_choice'] : []), ...(fileWrittenCount > 0 ? ['qa'] : [])],
        customInstructions: `PROVA ACADÊMICA baseada em arquivo. Gere ${fileMcCount} questões de múltipla escolha (${fileOptionsCount} alternativas cada) e ${fileWrittenCount} dissertativas.
PROIBIDO CLOZE: NÃO use formato cloze, NÃO use {{c1::...}} ou lacunas. Apenas "basic" (dissertativa) e "multiple_choice".
Cada questão DEVE ter um ENUNCIADO (caso clínico, situação-problema ou texto-base) na "front", separado da pergunta por "---".
Trate cada página como unidade temática independente. NÃO misture conteúdos de páginas diferentes. NÃO invente informações.
Dissertativas: "front" = enunciado + pergunta, "back" = resposta completa. Varie a dificuldade.${getExampleInstructions()}`,
        aiModel: model,
        energyCost: fileTotalCost,
      });

      queryClient.invalidateQueries({ queryKey: ['energy'] });

      const generatedCards = data.cards as Array<{ front: string; back: string; type: string; options?: string[]; correctIndex?: number }>;
      const questions = generatedCards.map((card, idx) => {
        if (card.type === 'multiple_choice' && card.options) {
          return {
            question_type: 'multiple_choice' as const,
            question_text: card.front,
            options: card.options.slice(0, fileOptionsCount),
            correct_answer: card.options[card.correctIndex ?? 0] || '',
            correct_indices: [card.correctIndex ?? 0],
            points: 1.5,
            sort_order: idx,
          };
        }
        return { question_type: 'written' as const, question_text: card.front, correct_answer: card.back, points: 2.5, sort_order: idx };
      });

      const exam = await createExam.mutateAsync({
        deckId,
        title: examTitle,
        questions,
        timeLimitSeconds: fileTimeLimit > 0 ? fileTimeLimit * 60 : undefined,
      });

      updateNotification(notifId, { status: 'ready', examId: exam.id, message: 'Prova pronta!' });
    } catch (err: any) {
      console.error(err);
      updateNotification(notifId, { status: 'error', message: err.message || 'Erro ao gerar prova' });
    }
  };

  // --- Manual creation / edit ---
  const handleManualSave = async () => {
    const valid = manualQuestions.filter(q => q.questionText.trim());
    if (valid.length === 0) { toast({ title: 'Adicione pelo menos 1 questão', variant: 'destructive' }); return; }

    setIsSaving(true);
    try {
      const questions = valid.map((q, idx) => {
        if (q.type === 'multiple_choice') {
          const opts = q.options.slice(0, manualOptionsCount).filter(o => o.trim());
          return {
            question_type: 'multiple_choice' as const,
            question_text: q.questionText,
            options: opts,
            correct_answer: opts[q.correctIndex] || '',
            correct_indices: [q.correctIndex],
            points: q.points,
            sort_order: idx,
          };
        }
        return { question_type: 'written' as const, question_text: q.questionText, correct_answer: q.correctAnswer, points: q.points, sort_order: idx };
      });

      if (isEditing && examId) {
        await updateExam.mutateAsync({
          examId,
          title: manualTitle.trim() || 'Prova Manual',
          timeLimitSeconds: manualTimeLimit > 0 ? manualTimeLimit * 60 : null,
          questions,
        });
        toast({ title: 'Prova atualizada com sucesso!' });
      } else {
        await createExam.mutateAsync({
          deckId: selectedDeckId || activeDecks[0]?.id || '',
          title: manualTitle.trim() || 'Prova Manual',
          questions,
          timeLimitSeconds: manualTimeLimit > 0 ? manualTimeLimit * 60 : undefined,
        });
        toast({ title: 'Prova criada com sucesso!' });
      }
      navigate('/exam/new');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao salvar prova', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (creationMode === 'file' && fileStep === 'config') { setFileStep('pages'); return; }
    if (creationMode === 'file' && fileStep === 'pages') { setFileStep('upload'); setFilePages([]); return; }
    navigate('/exam/new');
  };

  return {
    // Meta
    isEditing, examLoading, user, navigate,
    creditsOpen, setCreditsOpen, energy,
    
    // Mode
    creationMode, setCreationMode, fileStep,
    
    // Deck selection
    selectedDeckId, setSelectedDeckId, activeDecks,
    
    // AI mode
    title, setTitle, totalQuestions, setTotalQuestions,
    writtenCount, setWrittenCount, optionsCount, setOptionsCount,
    timeLimit, setTimeLimit, model, setModel,
    totalCost, canAfford, mcCount,
    handleAIGenerate,
    
    // Manual mode
    manualTitle, setManualTitle, manualTimeLimit, setManualTimeLimit,
    manualQuestions, setManualQuestions, manualOptionsCount, setManualOptionsCount,
    isSaving, handleManualSave,
    
    // File mode
    filePages, setFilePages, fileLoadProgress, fileLoading, fileName,
    fileTitle, setFileTitle, fileTotalQuestions, setFileTotalQuestions,
    fileWrittenCount, setFileWrittenCount, fileOptionsCount, setFileOptionsCount,
    fileTimeLimit, setFileTimeLimit, fileInputRef, setFileStep,
    fileTotalCost, fileCanAfford, fileMcCount,
    handleFileUpload, handleFileGenerate,
    
    // Example reference
    exampleMode, setExampleMode, exampleText, setExampleText,
    exampleImageUrl, setExampleImageUrl,
    exampleImageUploading, setExampleImageUploading,
    
    // Stats
    studyStats,
    
    // Navigation
    handleBack,
  };
}
