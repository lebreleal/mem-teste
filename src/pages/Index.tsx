import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import MemoCardsLogo from '@/components/MemoCardsLogo';
import {
  ChevronDown, Plus, GraduationCap, Globe, Stethoscope, Scale,
  Star, Download, Users, Brain, FileText, ClipboardList, Sparkles,
  BarChart3, Layers, ImageIcon, RefreshCw, BookOpen, Shield, Zap,
} from 'lucide-react';

/* ─── Placeholder image block ─── */
const Placeholder = ({ label, className = '' }: { label: string; className?: string }) => (
  <div className={`flex items-center justify-center rounded-2xl bg-muted border border-border ${className}`}>
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <ImageIcon className="h-10 w-10" />
      <span className="text-xs font-medium text-center px-2">{label}</span>
    </div>
  </div>
);

/* ─── FAQ Item ─── */
const FaqItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen(!open)} className="w-full text-left border-b border-border py-5">
      <div className="flex items-center justify-between gap-4">
        <span className="font-bold text-base md:text-lg text-foreground">{q}</span>
        <Plus className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </div>
      {open && <p className="mt-3 text-sm text-muted-foreground leading-relaxed pr-8">{a}</p>}
    </button>
  );
};

/* ─── Testimonial card ─── */
const TestimonialCard = ({ name, handle, text }: { name: string; handle: string; text: string }) => (
  <div className="rounded-2xl border border-border bg-card p-5 space-y-3 text-sm">
    <p className="text-muted-foreground leading-relaxed">{text}</p>
    <div>
      <p className="font-bold text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">{handle}</p>
    </div>
  </div>
);

/* ─── Objective tabs ─── */
const objectives = [
  {
    key: 'exam', label: 'Preparação para exames', icon: GraduationCap,
    title: 'Preparação para exames',
    text: 'Crie flashcards a partir dos seus materiais e deixe o FSRS-6 garantir que tudo esteja na ponta da língua no dia da prova. Com simulados integrados, você treina questões e acompanha seu desempenho.',
    quote: 'Uso o MemoCards para estudar patologia e nunca mais esqueci nenhum conceito na hora da prova.',
    author: 'Estudante de Medicina',
    cards: '3.155 cartões',
  },
  {
    key: 'idiomas', label: 'Aprendizado de idiomas', icon: Globe,
    title: 'Aprendizado de idiomas',
    text: 'Domine vocabulário e gramática com flashcards inteligentes. O algoritmo FSRS-6 apresenta as palavras no momento exato para fixar na memória de longo prazo.',
    quote: 'Aprendi mais vocabulário em 3 meses com MemoCards do que em 1 ano com outros apps.',
    author: 'Estudante de Inglês',
    cards: '1.240 cartões',
  },
  {
    key: 'concurso', label: 'Concursos', icon: Scale,
    title: 'Concursos públicos',
    text: 'Organize seus estudos por matéria, crie simulados e acompanhe sua evolução. Ideal para quem precisa memorizar leis, jurisprudência e conteúdo extenso.',
    quote: 'As comunidades do MemoCards me deram acesso a baralhos incríveis feitos por outros concurseiros.',
    author: 'Concurseiro aprovado',
    cards: '4.320 cartões',
  },
  {
    key: 'saude', label: 'Área da saúde', icon: Stethoscope,
    title: 'Área da saúde',
    text: 'Anatomia, farmacologia, patologia — tudo organizado em baralhos com suporte a imagens, oclusão e cloze. Estude como nos melhores programas de residência.',
    quote: 'A oclusão de imagem para estudar anatomia é perfeita. Consigo criar cards a partir dos meus atlas em segundos!',
    author: 'Acadêmico de Medicina',
    cards: '5.880 cartões',
  },
];

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeObj, setActiveObj] = useState('exam');

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (user) return null;

  const obj = objectives.find(o => o.key === activeObj)!;

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ══════════ NAVBAR ══════════ */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <MemoCardsLogo size={32} />
            <span className="font-extrabold text-lg text-foreground tracking-tight">MemoCards</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Recursos</a>
            <a href="#community" className="hover:text-foreground transition-colors">Comunidade</a>
            <a href="#objectives" className="hover:text-foreground transition-colors">Objetivos</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>Entrar</Button>
            <Button size="sm" className="rounded-full px-5" onClick={() => navigate('/auth')}>Começar grátis</Button>
          </div>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[480px] md:h-[520px] bg-gradient-to-b from-[hsl(12,90%,95%)] to-background dark:from-[hsl(12,30%,12%)] dark:to-background" />

        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-8 md:pt-20 md:pb-12">
          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <div className="flex-1 text-center md:text-left">
              <h1 className="font-extrabold text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground leading-[1.1]">
                MemoCards:<br />
                <span className="text-primary">Aprenda Mais,</span><br />
                <span className="text-primary">Estresse Menos</span>
              </h1>
              <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
                Arrase nas provas, domine matérias difíceis e muito mais com a mágica da{' '}
                <strong className="text-foreground">repetição espaçada</strong>, respaldada pela ciência. Junte-se à nossa comunidade!
              </p>
              <Button
                size="lg"
                className="mt-6 rounded-full text-lg font-bold px-10 py-6 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                onClick={() => navigate('/auth')}
              >
                Começar a aprender
              </Button>
            </div>
            <div className="flex-1 max-w-md w-full">
              <Placeholder label="Imagem hero — app screenshot" className="aspect-square w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ SOCIAL PROOF BAR ══════════ */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-10 flex flex-col md:flex-row items-center gap-6 md:gap-12">
          <div className="flex-1">
            <p className="text-lg md:text-xl font-extrabold text-foreground">
              Estudantes que usam <span className="text-primary">repetição espaçada</span> melhoram suas notas significativamente
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              De acordo com estudos científicos sobre aprendizagem ativa.
            </p>
            <Button
              variant="outline"
              className="mt-4 rounded-full border-primary text-primary hover:bg-primary/5 font-bold"
              onClick={() => navigate('/auth')}
            >
              Experimente grátis
            </Button>
          </div>
          <div className="flex-1 max-w-xs w-full">
            <Placeholder label="Gráfico — curva de esquecimento vs repetição espaçada" className="aspect-[4/3] w-full" />
          </div>
        </div>
      </section>

      {/* ══════════ FEATURES 2x2 GRID ══════════ */}
      <section id="features" className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-foreground mb-14">
            Estude de forma inteligente com o MemoCards
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            {/* Feature 1 — Flashcards */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-foreground">Crie flashcards do jeito que você quiser</h3>
                  <p className="text-sm text-muted-foreground mt-1">Cards básicos, cloze, oclusão de imagem, TTS — com editor rico e anexos.</p>
                </div>
              </div>
              <Placeholder label="Screenshot — editor de cards" className="aspect-[16/10] w-full" />
            </div>

            {/* Feature 2 — IA */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-foreground">Gere cards com IA a partir de PDFs</h3>
                  <p className="text-sm text-muted-foreground mt-1">Envie PDF, PPTX ou cole texto — a IA cria um baralho completo em segundos.</p>
                </div>
              </div>
              <Placeholder label="Screenshot — geração por IA" className="aspect-[16/10] w-full" />
            </div>

            {/* Feature 3 — Repetição Espaçada FSRS-6 */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-foreground">Repetição espaçada com FSRS-6</h3>
                  <p className="text-sm text-muted-foreground mt-1">O mesmo algoritmo do Anki — com 21 parâmetros otimizados, calcula o momento ideal de cada revisão para máxima retenção.</p>
                </div>
              </div>
              <Placeholder label="Screenshot — sessão de estudo" className="aspect-[16/10] w-full" />
            </div>

            {/* Feature 4 — Simulados */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-foreground">Simulados e provas integradas</h3>
                  <p className="text-sm text-muted-foreground mt-1">Crie provas com questões objetivas e dissertativas, com correção por IA. Perfeito para testar seu conhecimento.</p>
                </div>
              </div>
              <Placeholder label="Screenshot — simulados" className="aspect-[16/10] w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ COMMUNITY & LIVE DECKS ══════════ */}
      <section id="community" className="bg-muted/30 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-foreground mb-4">
            Comunidades & Cards Vivos
          </h2>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-14">
            Compartilhe baralhos, materiais e provas em comunidades colaborativas. Com os <strong className="text-foreground">Cards Vivos</strong>, todos ficam sincronizados automaticamente.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            {/* Community card 1 */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 flex flex-col md:flex-row items-start gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="font-extrabold text-lg text-foreground">Crie comunidades de estudo</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Organize disciplinas, semestres, aulas e materiais em um só lugar. Compartilhe baralhos, PDFs e provas com seus colegas de turma ou alunos.
                </p>
              </div>
              <Placeholder label="Screenshot — comunidade" className="aspect-square w-full max-w-[200px] shrink-0" />
            </div>

            {/* Community card 2 — Live Decks */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 flex flex-col md:flex-row items-start gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  <h3 className="font-extrabold text-lg text-foreground">Cards Vivos — sempre atualizados</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Baralhos da comunidade mantêm vínculo de sincronização com o criador. Quando o professor corrige ou melhora um card, todos os alunos recebem a atualização — sem perder o progresso de estudo.
                </p>
              </div>
              <Placeholder label="Screenshot — cards vivos" className="aspect-square w-full max-w-[200px] shrink-0" />
            </div>

            {/* Community card 3 — Sugestões */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 flex flex-col md:flex-row items-start gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <h3 className="font-extrabold text-lg text-foreground">Sugira correções colaborativas</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Encontrou um erro em um card? Envie uma sugestão de correção diretamente. O proprietário modera as sugestões no Painel do Criador e, ao aceitar, todos os assinantes recebem a melhoria automaticamente.
                </p>
              </div>
              <Placeholder label="Screenshot — sugestão de correção" className="aspect-square w-full max-w-[200px] shrink-0" />
            </div>

            {/* Community card 4 — Performance */}
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8 flex flex-col md:flex-row items-start gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h3 className="font-extrabold text-lg text-foreground">Estatísticas e desempenho</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Acompanhe seu progresso com gráficos de retenção, streaks, previsão de revisões e análise detalhada de cada baralho. Saiba exatamente onde focar seus estudos.
                </p>
              </div>
              <Placeholder label="Screenshot — estatísticas" className="aspect-square w-full max-w-[200px] shrink-0" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ OBJECTIVES TABS ══════════ */}
      <section id="objectives" className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-foreground mb-10">
            Alcance seus objetivos!
          </h2>

          {/* tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {objectives.map(o => (
              <button
                key={o.key}
                onClick={() => setActiveObj(o.key)}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                  activeObj === o.key
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <o.icon className="h-4 w-4" />
                {o.label}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="rounded-3xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-6 md:p-10">
                <h3 className="text-2xl font-extrabold text-foreground mb-3">{obj.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-6">{obj.text}</p>
                <div className="rounded-2xl bg-muted/50 border border-border p-5">
                  <p className="text-sm text-foreground italic leading-relaxed">"{obj.quote}"</p>
                  <p className="mt-3 text-xs font-bold text-muted-foreground">— {obj.author}</p>
                  <p className="text-xs text-muted-foreground mt-1">{obj.cards}</p>
                </div>
              </div>
              <div className="flex-1 p-6 md:p-10 flex items-center justify-center">
                <Placeholder label={`Imagem — ${obj.title}`} className="aspect-square w-full max-w-xs" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ APP / INSTALL SECTION ══════════ */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl bg-gradient-to-br from-primary/5 to-accent/10 border border-border p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-extrabold text-foreground">
                Instale o App
              </h2>
              <p className="text-muted-foreground mt-2 mb-6">
                MemoCards é um PWA — instale direto no seu celular sem precisar de loja.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 mb-6">
                {[
                  { value: '4.8+', label: 'Classificação' },
                  { value: 'PWA', label: 'Instalável' },
                  { value: '∞', label: 'Cards' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-black text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              <Button
                className="rounded-full px-8 font-bold"
                onClick={() => navigate('/install')}
              >
                <Download className="h-4 w-4 mr-2" />
                Como instalar
              </Button>
            </div>
            <div className="flex-1 max-w-xs w-full">
              <Placeholder label="Imagem — app no celular" className="aspect-[9/16] w-full max-w-[200px] mx-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ TESTIMONIALS ══════════ */}
      <section className="bg-card border-y border-border px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-10">
            Nossos Estudantes = Nossa Inspiração
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <TestimonialCard
              name="Ana"
              handle="Estudante de Direito"
              text="A repetição espaçada é como revisar no momento certo para fixar a informação. MemoCards mudou minha rotina de estudos completamente."
            />
            <TestimonialCard
              name="Carlos"
              handle="Concurseiro"
              text="As comunidades com Cards Vivos me deram acesso a baralhos sempre atualizados, feitos por outros concurseiros. Passei no meu primeiro concurso!"
            />
            <TestimonialCard
              name="Marina"
              handle="Estudante de Medicina"
              text="Experimentei o MemoCards para estudar para minhas provas e tirei A+. É tão fácil criar flashcards a partir dos meus materiais!"
            />
            <TestimonialCard
              name="Lucas"
              handle="Professor"
              text="App indispensável para quem está aprendendo. O FSRS-6 junto com os Cards Vivos é uma vitória total para os alunos."
            />
          </div>
        </div>
      </section>

      {/* ══════════ SOCIAL MEDIA BAR ══════════ */}
      <section className="bg-primary text-primary-foreground py-6 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-bold text-lg">
            Milhares de estudantes já usam MemoCards 🚀
          </p>
          <p className="text-primary-foreground/80 text-sm mt-1">
            Junte-se à comunidade nas redes sociais
          </p>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section id="faq" className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-10">
            Perguntas? Respostas.
          </h2>

          <FaqItem
            q="Posso usar o MemoCards gratuitamente?"
            a="Sim! O MemoCards é gratuito para criar, estudar e compartilhar baralhos. Você recebe créditos de IA diários para gerar cards automaticamente."
          />
          <FaqItem
            q="O que é o FSRS-6?"
            a="O FSRS-6 (Free Spaced Repetition Scheduler) é o algoritmo de repetição espaçada mais avançado do mercado, com 21 parâmetros otimizados. É o mesmo utilizado pelo Anki e calcula o momento ideal para você revisar cada card, maximizando a retenção com o menor esforço possível."
          />
          <FaqItem
            q="O que são Cards Vivos?"
            a="Cards Vivos são baralhos compartilhados em comunidades que mantêm um vínculo de sincronização com o criador. Quando o professor corrige ou melhora um card, todos os alunos que possuem o baralho recebem a atualização automaticamente — sem perder o progresso de estudo (agendamento FSRS)."
          />
          <FaqItem
            q="O que é repetição espaçada?"
            a="É uma técnica cientificamente comprovada que apresenta as informações no momento ideal para fixação na memória de longo prazo. Em vez de estudar tudo de uma vez, você revisa no momento certo."
          />
          <FaqItem
            q="Posso importar cards do Anki?"
            a="Sim! Você pode importar baralhos no formato .apkg do Anki diretamente para o MemoCards, mantendo todos os seus cards e formatação."
          />
          <FaqItem
            q="O MemoCards é adequado para todos os tipos de estudantes?"
            a="Sim! Seja para provas de faculdade, concursos públicos, idiomas, residência médica ou qualquer outra área — o MemoCards se adapta ao seu estilo de estudo."
          />
        </div>
      </section>

      {/* ══════════ FINAL CTA ══════════ */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl bg-gradient-to-r from-primary to-[hsl(207,80%,35%)] dark:to-[hsl(207,75%,55%)] p-8 md:p-12 text-center text-primary-foreground relative overflow-hidden">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Melhore seus estudos!</h2>
            <p className="text-primary-foreground/80 mb-6">Comece agora mesmo — é grátis e leva menos de 1 minuto.</p>
            <Button
              size="lg"
              variant="secondary"
              className="rounded-full text-lg font-bold px-10 py-6"
              onClick={() => navigate('/auth')}
            >
              Começar a aprender
            </Button>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="border-t border-border bg-card px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MemoCardsLogo size={28} />
                <span className="font-extrabold text-foreground">MemoCards</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Aprenda mais, estresse menos. Repetição espaçada com FSRS-6.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-sm text-foreground mb-3">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Comunidades</button></li>
                <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Cards Vivos</button></li>
                <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Simulados</button></li>
                <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Geração com IA</button></li>
                <li><button onClick={() => navigate('/install')} className="hover:text-foreground transition-colors">Instalar App</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-sm text-foreground mb-3">Ajuda</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => navigate('/privacy')} className="hover:text-foreground transition-colors">Política de Privacidade</button></li>
                <li><button onClick={() => navigate('/terms')} className="hover:text-foreground transition-colors">Termos de Uso</button></li>
                <li><button onClick={() => navigate('/feedback')} className="hover:text-foreground transition-colors">Feedback</button></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} MemoCards. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
