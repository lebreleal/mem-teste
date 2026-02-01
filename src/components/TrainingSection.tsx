import { GraduationCap, ChevronDown, BookOpen, DollarSign, Package, MapPin, Settings, Users, Wrench, FileText, Lightbulb, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface Module {
  icon: any;
  title: string;
  description: string;
  topics: string[];
  color: string;
}

const trainingModules: Module[] = [
  {
    icon: BookOpen,
    title: 'Fundamentos',
    description: 'Conceitos básicos e estrutura de conhecimento',
    color: 'from-tech-cyan to-tech-electric',
    topics: [
      'Como tirar o melhor proveito do treinamento',
      'Componentes do Painel Led',
      'Preciso ter um CNPJ?',
      'Fundamentos da publicidade OOH'
    ]
  },
  {
    icon: DollarSign,
    title: 'Plano de Negócios',
    description: 'Estruture seu negócio e calcule rentabilidade',
    color: 'from-tech-electric to-tech-glow',
    topics: [
      'Etapas construção painel Led',
      'Custos para construir o painel de Led',
      'Análise completa do investimento e ROI',
      'Projeção de receita e lucro líquido (DRE)',
      'Cálculo de Payback',
      'Despesas operacionais e fixas',
      'Previsão exata de consumo de energia',
      'Dicas de otimização e redução de consumo',
      'Controle de energia por horários',
      'Métodos para precificar mensalidade',
      'Lucro Líquido esperado',
      'Demonstração do lucro da empresa',
      'Plano de expansão'
    ]
  },
  {
    icon: Package,
    title: 'Importação',
    description: 'Processo completo passo a passo',
    color: 'from-tech-accent to-tech-cyan',
    topics: [
      'Etapas da importação',
      'Custos da importação',
      'Demonstração REAL de importação pela Ledbras'
    ]
  },
  {
    icon: MapPin,
    title: 'Localização',
    description: 'Escolha o melhor local para lucros',
    color: 'from-tech-cyan to-tech-electric',
    topics: [
      'Como escolher o melhor local',
      'Locais onde não deve colocar',
      'Estudo do público alvo',
      'Analítico com inteligência artificial'
    ]
  },
  {
    icon: Settings,
    title: 'Administração',
    description: 'Gerencie com eficiência profissional',
    color: 'from-tech-electric to-tech-accent',
    topics: [
      'Sistema de gestão ERP',
      'Configurações iniciais',
      'Módulos de Cadastro e Finanças',
      'Módulo de serviços',
      'Configuração da NFS',
      'Uso dos relatórios'
    ]
  },
  {
    icon: Users,
    title: 'Relacionamento com Clientes',
    description: 'Atraia e fidelize clientes',
    color: 'from-tech-glow to-tech-cyan',
    topics: [
      'Fundamentos e mentalidade',
      'Como negociar corretamente',
      'Estabelecer bom relacionamento',
      'Agências de marketing e custos',
      'Construir Instagram do painel'
    ]
  },
  {
    icon: Settings,
    title: 'Gerenciamento',
    description: 'Configure e opere seu painel',
    color: 'from-tech-accent to-tech-electric',
    topics: [
      'Requisitos necessários',
      'Software de gerenciamento',
      'Incluindo vinhetas',
      'Configurando brilho'
    ]
  },
  {
    icon: Wrench,
    title: 'Construção',
    description: 'Construa seu painel do início ao fim',
    color: 'from-tech-cyan to-tech-accent',
    topics: [
      'Configuração do Painel',
      'Análise de estrutura (metálica, alvenaria)',
      'Projeto sustentação dos gabinetes',
      'Projeto estrutural e elétrico',
      'Cálculo de custos com instalação',
      'Requisitos de aterramento',
      'Estimativa de mão de obra',
      'Etapas: fundação, pilar, gabinetes, energia'
    ]
  },
  {
    icon: FileText,
    title: 'Legalização',
    description: 'Regularize na prefeitura',
    color: 'from-tech-blue to-tech-navy',
    topics: [
      'Regulamentação previstas',
      'ART no projeto estrutural',
      'Taxa de instalação',
      'Custos com licenças e conformidade'
    ]
  },
  {
    icon: Wrench,
    title: 'Manutenção Preventiva',
    description: 'Mantenha funcionando perfeitamente',
    color: 'from-tech-accent to-tech-cyan',
    topics: [
      'Motivos da manutenção preventiva',
      'Quando trocar fontes de alimentação',
      'Quando trocar módulos de led'
    ]
  },
  {
    icon: Lightbulb,
    title: 'Conteúdo Criativo',
    description: 'Crie banners e vinhetas profissionais',
    color: 'from-tech-electric to-tech-glow',
    topics: [
      'Dicas sobre BANNER e Vinhetas',
      'Onde encontrar designers',
      'Princípios das animações',
      'Como fazer animações facilmente'
    ]
  },
  {
    icon: TrendingUp,
    title: 'Bônus Extras',
    description: 'Estratégias avançadas',
    color: 'from-tech-glow to-tech-electric',
    topics: [
      'Relacionamento com clientes',
      'Outras formas de rentabilizar',
      'Melhor aproveitamento após 6 anos'
    ]
  }
];

export function TrainingSection() {
  const [expandedModule, setExpandedModule] = useState<number | null>(null);

  const toggleModule = (index: number) => {
    setExpandedModule(expandedModule === index ? null : index);
  };

  return (
    <section id="treinamento" className="py-16 sm:py-24 bg-tech-dark">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-full px-4 py-2 mb-6">
              <span className="text-2xl">🎁</span>
              <span className="text-amber-400 text-xs sm:text-sm font-bold uppercase tracking-wider">
                BÔNUS EXCLUSIVO
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              <span className="text-white">Ganhe o </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">Treinamento de Gestão</span>
            </h2>
            <p className="text-base sm:text-lg text-slate-400 mb-4">
              Do básico ao avançado: construa, gerencie e lucre com seu painel LED
            </p>

            {/* Preço Ancoragem */}
            <div className="inline-flex items-center gap-3 bg-tech-navy/60 border border-tech-cyan/30 rounded-xl px-6 py-3">
              <span className="text-slate-500 line-through text-lg">R$ 997</span>
              <span className="text-green-400 font-bold text-2xl">GRÁTIS</span>
              <span className="text-slate-400 text-sm">para clientes</span>
            </div>
          </div>

          {/* Compact Module Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {trainingModules.map((module, index) => {
              const Icon = module.icon;
              const isExpanded = expandedModule === index;

              return (
                <div key={index}>
                  <button
                    onClick={() => toggleModule(index)}
                    className={`w-full bg-tech-blue/40 border-2 ${
                      isExpanded ? 'border-tech-cyan/60' : 'border-tech-cyan/20'
                    } hover:border-tech-cyan/50 rounded-xl p-5 transition-all backdrop-blur-sm text-left`}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${module.color} flex items-center justify-center flex-shrink-0 shadow-glow`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-white mb-1 truncate">
                          {module.title}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {module.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-tech-cyan/20">
                      <span className="text-xs text-tech-cyan font-semibold">
                        {module.topics.length} tópicos
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-tech-cyan transition-transform duration-300 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="mt-2 bg-tech-navy/60 border border-tech-cyan/20 rounded-xl p-4 backdrop-blur-sm animate-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        {module.topics.map((topic, topicIndex) => (
                          <div key={topicIndex} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-tech-cyan flex-shrink-0 mt-0.5" />
                            <p className="text-slate-300 text-xs leading-relaxed">
                              {topic}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary Badge */}
          <div className="text-center">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-tech-cyan/10 to-tech-electric/10 border border-tech-cyan/30 rounded-xl px-6 py-4">
              <GraduationCap className="w-6 h-6 text-tech-cyan" />
              <div className="text-left">
                <p className="text-white font-bold text-sm">
                  {trainingModules.length} Módulos Completos
                </p>
                <p className="text-slate-400 text-xs">
                  Conteúdo prático e aplicável ao seu negócio
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
