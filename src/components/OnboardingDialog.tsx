import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { BookOpen, Plus, Trash2, Sparkles, Loader2, ChevronRight, ChevronDown, GraduationCap, FileText, Brain, Download } from 'lucide-react';

interface SubjectItem {
  name: string;
  lessons: string[];
}

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  onManualCreate?: (action: 'deck' | 'ai' | 'import') => void;
}

type Step = 'form' | 'loading' | 'review';

const OnboardingDialog = ({ open, onOpenChange, onComplete, onManualCreate }: OnboardingDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('form');
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState('');
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [creating, setCreating] = useState(false);
  const [correctedCourse, setCorrectedCourse] = useState(false);
  const [correctedSemester, setCorrectedSemester] = useState(false);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  

  const handleGenerate = async () => {
    if (!course.trim() || !semester.trim()) {
      toast({ title: 'Preencha o curso e o semestre', variant: 'destructive' });
      return;
    }

    setStep('loading');

    try {
      const { data, error } = await supabase.functions.invoke('generate-onboarding', {
        body: { course: course.trim(), semester: semester.trim(), aiModel: 'flash' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Apply corrected names
      const wasCourseFixed = data.corrected_course && data.corrected_course.toLowerCase() !== course.trim().toLowerCase();
      const wasSemesterFixed = data.corrected_semester && data.corrected_semester.toLowerCase() !== semester.trim().toLowerCase();
      
      if (wasCourseFixed) {
        setCourse(data.corrected_course);
        setCorrectedCourse(true);
      }
      if (wasSemesterFixed) {
        setSemester(data.corrected_semester);
        setCorrectedSemester(true);
      }

      // Map subjects with lessons
      const mappedSubjects: SubjectItem[] = (data.subjects || []).map((s: any) => ({
        name: s.name,
        lessons: s.lessons || [],
      }));
      setSubjects(mappedSubjects);
      setStep('review');
    } catch (err: any) {
      console.error('Onboarding AI error:', err);
      toast({ title: 'Erro ao gerar sugestões', description: err.message, variant: 'destructive' });
      setStep('form');
    }
  };

  const toggleSubjectExpand = (index: number) => {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const addSubject = () => {
    if (!newSubject.trim()) return;
    setSubjects(prev => [...prev, { name: newSubject.trim(), lessons: [] }]);
    setNewSubject('');
  };

  const removeSubject = (index: number) => {
    setSubjects(prev => prev.filter((_, i) => i !== index));
  };

  const updateSubjectName = (index: number, name: string) => {
    setSubjects(prev => prev.map((s, i) => i === index ? { ...s, name } : s));
  };

  const addLesson = (subjectIndex: number, lessonName: string) => {
    if (!lessonName.trim()) return;
    setSubjects(prev => prev.map((s, i) =>
      i === subjectIndex ? { ...s, lessons: [...s.lessons, lessonName.trim()] } : s
    ));
  };

  const removeLesson = (subjectIndex: number, lessonIndex: number) => {
    setSubjects(prev => prev.map((s, i) =>
      i === subjectIndex ? { ...s, lessons: s.lessons.filter((_, li) => li !== lessonIndex) } : s
    ));
  };

  const updateLesson = (subjectIndex: number, lessonIndex: number, value: string) => {
    setSubjects(prev => prev.map((s, i) =>
      i === subjectIndex ? { ...s, lessons: s.lessons.map((l, li) => li === lessonIndex ? value : l) } : s
    ));
  };

  const handleConfirm = async () => {
    if (!user || subjects.length === 0) return;
    setCreating(true);

    try {
      // Create main deck with course name
      const { data: mainDeck, error: mainError } = await supabase
        .from('decks')
        .insert({ name: course.trim(), user_id: user.id } as any)
        .select()
        .single();

      if (mainError) throw mainError;

      // Create semester sub-deck
      const { data: semesterDeck, error: semError } = await supabase
        .from('decks')
        .insert({ 
          name: semester.trim(),
          user_id: user.id, 
          parent_deck_id: (mainDeck as any).id,
        } as any)
        .select()
        .single();

      if (semError) throw semError;

      // Create subject sub-decks under semester, then lessons under each subject
      for (const subject of subjects) {
        const { data: subjectDeck, error: subError } = await supabase
          .from('decks')
          .insert({
            name: subject.name,
            user_id: user.id,
            parent_deck_id: (semesterDeck as any).id,
          } as any)
          .select()
          .single();

        if (subError) {
          console.error('Error creating subject deck:', subError);
          continue;
        }

        // Create lesson sub-decks under subject
        for (const lesson of subject.lessons) {
          const { error: lessonError } = await supabase
            .from('decks')
            .insert({
              name: lesson,
              user_id: user.id,
              parent_deck_id: (subjectDeck as any).id,
            } as any);
          if (lessonError) console.error('Error creating lesson deck:', lessonError);
        }
      }

      // Mark onboarding as completed
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true } as any)
        .eq('id', user.id);

      toast({ title: '🎉 Estrutura criada com sucesso!', description: 'Seus baralhos foram organizados. Agora é só adicionar cards!' });
      onComplete();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      console.error('Create error:', err);
      toast({ title: 'Erro ao criar estrutura', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const resetState = () => {
    setStep('form');
    setCourse('');
    setSemester('');
    setSubjects([]);
    setNewSubject('');
    setCorrectedCourse(false);
    setCorrectedSemester(false);
    setExpandedSubjects(new Set());
  };

  const handleManualAction = async (action: 'deck' | 'ai' | 'import') => {
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true } as any)
        .eq('id', user.id);
    }
    onOpenChange(false);
    resetState();
    onManualCreate?.(action);
  };

  const NewLessonInput = ({ subjectIndex }: { subjectIndex: number }) => {
    const [value, setValue] = useState('');
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <Plus className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nova aula..."
          className="h-5 text-[11px] flex-1 border-dashed"
          maxLength={100}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLesson(subjectIndex, value); setValue(''); } }}
        />
        <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => { addLesson(subjectIndex, value); setValue(''); }} disabled={!value.trim()}>
          +
        </Button>
      </div>
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetState(); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        {step === 'form' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Monte seus baralhos</DialogTitle>
                  <DialogDescription className="text-sm">
                    Diga seu curso e semestre — a IA cria os baralhos de cada matéria pra você
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="course">Qual seu curso?</Label>
                <Input
                  id="course"
                  placeholder="Ex: Medicina, Direito, Engenharia..."
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="semester">Qual semestre você está?</Label>
                <Input
                  id="semester"
                  placeholder="Ex: 6º Semestre, 3º Período..."
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  maxLength={50}
                />
              </div>

              <Button className="w-full gap-2" onClick={handleGenerate} disabled={!course.trim() || !semester.trim()}>
                <Sparkles className="h-4 w-4" />
                Gerar matérias
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="mx-auto block text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                    Prefiro criar manualmente
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="center">
                  <button onClick={() => handleManualAction('deck')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
                    <BookOpen className="h-4 w-4" /> Criar baralho
                  </button>
                  <button onClick={() => handleManualAction('ai')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
                    <Brain className="h-4 w-4 text-[hsl(var(--energy-purple))]" /> Criar com IA
                  </button>
                  <button onClick={() => handleManualAction('import')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
                    <Download className="h-4 w-4" /> Importar cartões
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando estrutura para <strong>{course}</strong>...</p>
          </div>
        )}

        {step === 'review' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">Confirme sua estrutura</DialogTitle>
              <DialogDescription className="text-sm">
                Edite, adicione ou remova matérias e aulas antes de criar
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 space-y-2">
              {/* Tree preview - compact */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-0.5 max-h-[45vh] overflow-y-auto">
                {/* Course */}
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{course}</span>
                  {correctedCourse && (
                    <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-primary/10 text-primary border-0">
                      corrigido
                    </Badge>
                  )}
                </div>

                {/* Semester */}
                <div className="ml-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                  <span>{semester}</span>
                  {correctedSemester && (
                    <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-primary/10 text-primary border-0">
                      corrigido
                    </Badge>
                  )}
                </div>

                {/* Subjects */}
                {subjects.map((sub, i) => {
                  const isExpanded = expandedSubjects.has(i);
                  return (
                    <div key={i} className="ml-7">
                      <Collapsible open={isExpanded} onOpenChange={() => toggleSubjectExpand(i)}>
                        <div className="flex items-center gap-1 group">
                          <CollapsibleTrigger asChild>
                            <button className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors">
                              {isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                            </button>
                          </CollapsibleTrigger>
                          <Input
                            value={sub.name}
                            onChange={(e) => updateSubjectName(i, e.target.value)}
                            className="h-6 text-xs flex-1 border-transparent bg-transparent hover:border-border focus:border-border transition-colors font-medium"
                            maxLength={100}
                          />
                          <span className="text-[9px] text-muted-foreground/40 shrink-0 tabular-nums">
                            {sub.lessons.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                            onClick={() => removeSubject(i)}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>

                        <CollapsibleContent>
                          <div className="ml-4 space-y-0">
                            {sub.lessons.map((lesson, li) => (
                              <div key={li} className="flex items-center gap-1 group/lesson">
                                <FileText className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
                                <Input
                                  value={lesson}
                                  onChange={(e) => updateLesson(i, li, e.target.value)}
                                  className="h-5 text-[11px] flex-1 border-transparent bg-transparent hover:border-border focus:border-border transition-colors"
                                  maxLength={100}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 opacity-0 group-hover/lesson:opacity-100 text-destructive shrink-0"
                                  onClick={() => removeLesson(i, li)}
                                >
                                  <Trash2 className="h-2 w-2" />
                                </Button>
                              </div>
                            ))}
                            <NewLessonInput subjectIndex={i} />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })}

                {/* Add subject */}
                <div className="ml-7 flex items-center gap-1 mt-1">
                  <Plus className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
                  <Input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Adicionar matéria..."
                    className="h-6 text-xs flex-1"
                    maxLength={100}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubject(); } }}
                  />
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={addSubject} disabled={!newSubject.trim()}>
                    +
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Criará: <strong>{course}</strong> → <strong>{semester}</strong> → matérias → aulas. Reorganize depois.
              </p>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setStep('form'); setCorrectedCourse(false); setCorrectedSemester(false); }}>
                  Voltar
                </Button>
                <Button size="sm" className="flex-1 gap-2" onClick={handleConfirm} disabled={creating || subjects.length === 0}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {creating ? 'Criando...' : 'Confirmar e criar'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};

export default OnboardingDialog;
