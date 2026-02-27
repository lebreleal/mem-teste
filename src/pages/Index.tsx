import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import MemoCardsLogo from '@/components/MemoCardsLogo';
import {
  Zap, BookOpen, Trophy, Users, Brain, FileText, ClipboardList,
  ChevronDown, ChevronRight, Layers, BarChart3, Sparkles, GraduationCap,
  Globe, Stethoscope, Scale, Calculator,
} from 'lucide-react';

/* ─── FAQ accordion item ─── */
const FaqItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left border-b border-border py-5 group"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-bold text-base md:text-lg text-foreground">{question}</span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && (
        <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed pr-8">
          {answer}
        </p>
      )}
    </button>
  );
};

/* ─── Feature card ─── */
const FeatureCard = ({
  icon: Icon,
  title,
  description,
  reverse = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  reverse?: boolean;
}) => (
  <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-6 md:gap-12`}>
    <div className="flex h-28 w-28 md:h-36 md:w-36 shrink-0 items-center justify-center rounded-3xl bg-primary/10">
      <Icon className="h-12 w-12 md:h-16 md:w-16 text-primary" />
    </div>
    <div className={`text-center ${reverse ? 'md:text-right' : 'md:text-left'}`}>
      <h3 className="text-xl md:text-2xl font-extrabold text-foreground">{title}</h3>
      <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-md leading-relaxed">
        {description}
      </p>
    </div>
  </div>
);

/* ─── Objective tab ─── */
const objectives = [
  {
    key: 'exam',
    label: 'Preparação para provas',
    icon: GraduationCap,
    title: 'Preparação para provas',
    description:
      'Crie flashcards a partir dos seus materiais e deixe a repetição espaçada garantir que tudo esteja na ponta da língua no dia da prova. Com simulados integrados, você treina questões e acompanha seu desempenho.',
    quote:
      'Uso o MemoCards para estudar patologia e nunca mais esqueci nenhum conceito na hora da prova. É como ter um tutor pessoal gerenciando minha revisão!',
    author: 'Estudante de Medicina',
  },
  {
    key: 'idiomas',
    label: 'Aprendizado de idiomas',
    icon: Globe,
    title: 'Aprendizado de idiomas',
    description:
      'Domine vocabulário e gramática com flashcards inteligentes. A repetição espaçada apresenta as palavras no momento exato para fixar na memória de longo prazo.',
    quote:
      'Aprendi mais vocabulário em 3 meses com MemoCards do que em 1 ano com outros apps. A repetição espaçada é incrível!',
    author: 'Estudante de Inglês',
  },
  {
    key: 'concurso',
    label: 'Concursos públicos',
    icon: Scale,
    title: 'Concursos públicos',
    description:
      'Organize seus estudos por matéria, crie simulados e acompanhe sua evolução. Ideal para quem precisa memorizar leis, jurisprudência e conteúdo extenso.',
    quote:
      'As comunidades do MemoCards me deram acesso a baralhos incríveis feitos por outros concurseiros. Passei no meu primeiro concurso!',
    author: 'Concurseiro aprovado',
  },
  {
    key: 'medicina',
    label: 'Área da saúde',
    icon: Stethoscope,
    title: 'Área da saúde',
    description:
      'Anatomia, farmacologia, patologia — tudo organizado em baralhos com suporte a imagens, oclusão e cloze. Estude como nos melhores programas de residência.',
    quote:
      'A oclusão de imagem para estudar anatomia é perfeita. Consigo criar cards a partir dos meus atlas em segundos!',
    author: 'Acadêmico de Medicina',
  },
];

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeObjective, setActiveObjective] = useState('exam');

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) return null;

  const currentObj = objectives.find(o => o.key === activeObjective) || objectives[0];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ══════════════ NAV ══════════════ */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <MemoCardsLogo size={36} />
            <span className="font-extrabold text-lg text-foreground">MemoCards</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
              Entrar
            </Button>
            <Button size="sm" onClick={() => navigate('/auth')}>
              Começar grátis
            </Button>
          </div>
        </div>
      </nav>

      {/* ══════════════ HERO ══════════════ */}
      <section className="relative overflow-hidden px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        {/* decorations */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute bottom-0 -left-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl text-center">
          <MemoCardsLogo size={80} className="mx-auto mb-6" />

          <h1 className="font-extrabold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground leading-[1.1]">
            MemoCards:{' '}
            <span className="text-primary">Aprenda Mais,</span>{' '}
            <span className="text-primary">Estresse Menos</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
            Arrase nas provas, domine matérias difíceis e muito mais com a mágica da{' '}
            <strong className="text-foreground">repetição espaçada</strong>, respaldada pela ciência.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              className="w-full sm:w-auto text-lg font-bold px-8 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
              onClick={() => navigate('/auth')}
            >
              Começar a aprender
            </Button>
          </div>
        </div>
      </section>

      {/* ══════════════ SOCIAL PROOF BAR ══════════════ */}
      <section className="border-y border-border bg-card py-8 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-lg md:text-xl text-foreground font-bold">
            Estudantes que usam repetição espaçada <span className="text-primary">melhoram suas notas</span> significativamente
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            De acordo com estudos científicos sobre aprendizagem ativa e repetição espaçada.
          </p>
          <div className="mt-6 flex items-center justify-center gap-8 md:gap-16">
            {[
              { value: 'FSRS + SM-2', label: 'Algoritmos' },
              { value: 'IA', label: 'Geração de cards' },
              { value: '∞', label: 'Cards grátis' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl md:text-3xl font-black text-primary">{value}</p>
                <p className="text-xs md:text-sm text-muted-foreground font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ FEATURES GRID ══════════════ */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-foreground mb-14">
            Estude de forma inteligente com o MemoCards
          </h2>

          <div className="space-y-16">
            <FeatureCard
              icon={Layers}
              title="Crie flashcards do jeito que você quiser"
              description="Cards básicos, cloze (preencher a lacuna), oclusão de imagem — tudo com editor rico, anexos de imagens e áudio via TTS. Crie manualmente ou deixe a IA gerar a partir dos seus PDFs."
            />
            <FeatureCard
              icon={Users}
              title="Comunidades para estudar juntos"
              description="Crie ou participe de comunidades, compartilhe baralhos, anexe materiais e crie provas para os membros. Perfeito para turmas de faculdade e grupos de estudo."
              reverse
            />
            <FeatureCard
              icon={Brain}
              title="Aprenda com repetição espaçada"
              description="Algoritmos FSRS e SM-2 calculam o momento ideal para você revisar cada card. Estude menos tempo, mas com mais eficiência — a ciência comprova."
            />
            <FeatureCard
              icon={ClipboardList}
              title="Simulados e provas integradas"
              description="Crie provas com questões de múltipla escolha, dissertativas e mais. Gere provas automaticamente com IA a partir dos seus cards ou materiais."
              reverse
            />
            <FeatureCard
              icon={Sparkles}
              title="Inteligência Artificial integrada"
              description="Gere baralhos completos a partir de PDFs, PPTX ou texto colado. A IA cria cards de alta qualidade em segundos, prontos para revisar."
            />
            <FeatureCard
              icon={BarChart3}
              title="Acompanhe seu desempenho"
              description="Gráficos de retenção, previsão de revisões, streaks diários e estatísticas detalhadas. Veja exatamente como está evoluindo."
              reverse
            />
          </div>
        </div>
      </section>

      {/* ══════════════ OBJECTIVES (tabs like Noji) ══════════════ */}
      <section className="bg-card border-y border-border px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-foreground mb-10">
            Alcance seus objetivos!
          </h2>

          {/* tab buttons */}
          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-10">
            {objectives.map(obj => (
              <button
                key={obj.key}
                onClick={() => setActiveObjective(obj.key)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  activeObjective === obj.key
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                <obj.icon className="h-4 w-4" />
                {obj.label}
              </button>
            ))}
          </div>

          {/* active content */}
          <div className="rounded-3xl bg-background border border-border p-6 md:p-10 shadow-sm">
            <h3 className="text-2xl font-extrabold text-foreground mb-3">{currentObj.title}</h3>
            <p className="text-muted-foreground leading-relaxed mb-6">{currentObj.description}</p>

            <div className="rounded-2xl bg-muted/50 border border-border p-5">
              <p className="text-sm md:text-base text-foreground italic leading-relaxed">
                "{currentObj.quote}"
              </p>
              <p className="mt-3 text-xs font-bold text-muted-foreground">— {currentObj.author}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ HIGHLIGHT FEATURES STRIP ══════════════ */}
      <section className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-5xl grid grid-cols-2 sm:grid-cols-4 gap-6 md:gap-10">
          {[
            { icon: Zap, label: 'Créditos IA', desc: 'Ganhe recompensas estudando' },
            { icon: BookOpen, label: 'Repetição Espaçada', desc: 'FSRS & SM-2' },
            { icon: Trophy, label: 'Gamificação', desc: 'Missões e conquistas' },
            { icon: FileText, label: 'Importar de PDFs', desc: 'PDF, PPTX, DOCX' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col items-center text-center gap-3">
              <div className="flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-7 w-7 md:h-8 md:w-8 text-primary" />
              </div>
              <h3 className="font-bold text-sm md:text-base text-foreground">{label}</h3>
              <p className="text-xs md:text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════ FAQ ══════════════ */}
      <section className="bg-card border-y border-border px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-foreground mb-10">
            Perguntas? Respostas.
          </h2>

          <div>
            <FaqItem
              question="Posso usar o MemoCards gratuitamente?"
              answer="Sim! O MemoCards é gratuito para criar, estudar e compartilhar baralhos. Você recebe créditos de IA diários para gerar cards automaticamente."
            />
            <FaqItem
              question="Como o MemoCards se diferencia de outros apps?"
              answer="Combinamos repetição espaçada com algoritmos avançados (FSRS e SM-2), comunidades para compartilhar baralhos, simulados integrados, geração de cards por IA e uma interface limpa e moderna."
            />
            <FaqItem
              question="O que é repetição espaçada?"
              answer="É uma técnica cientificamente comprovada que apresenta as informações no momento ideal para fixação na memória de longo prazo. Em vez de revisar tudo de uma vez, você revisa cada card no intervalo perfeito."
            />
            <FaqItem
              question="Como me preparar para uma prova com o MemoCards?"
              answer="Crie ou importe flashcards do conteúdo da prova, estude diariamente usando a repetição espaçada e use os simulados integrados para testar seus conhecimentos antes do grande dia."
            />
            <FaqItem
              question="Posso importar cards de outros apps como o Anki?"
              answer="Sim! Você pode importar baralhos no formato .apkg do Anki diretamente para o MemoCards, mantendo todos os seus cards e formatação."
            />
            <FaqItem
              question="O MemoCards funciona offline?"
              answer="O MemoCards é um PWA (Progressive Web App) e pode ser instalado no seu celular. A funcionalidade principal requer conexão, mas você pode acessá-lo como um app nativo."
            />
          </div>
        </div>
      </section>

      {/* ══════════════ FINAL CTA ══════════════ */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">
            Melhore seus estudos!
          </h2>
          <p className="text-muted-foreground mb-8">
            Junte-se a milhares de estudantes que já transformaram sua forma de aprender.
          </p>
          <Button
            size="lg"
            className="text-lg font-bold px-10 py-6 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
            onClick={() => navigate('/auth')}
          >
            Começar a aprender
          </Button>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-border bg-card px-4 py-8">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MemoCardsLogo size={28} />
            <span className="font-bold text-sm text-foreground">MemoCards</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <button onClick={() => navigate('/privacy')} className="hover:text-foreground transition-colors">
              Política de Privacidade
            </button>
            <button onClick={() => navigate('/terms')} className="hover:text-foreground transition-colors">
              Termos de Uso
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MemoCards
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
