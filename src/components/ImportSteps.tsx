import { useState, useEffect, useRef } from 'react';
import { Factory, Ship, Package, CheckCircle2, ArrowRight, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

const importSteps = [
  {
    id: 1,
    icon: Factory,
    title: 'PRODUÇÃO',
    subtitle: 'ETAPA 1',
    description: 'Toda a produção é acompanhada em tempo real com fotos e vídeos do produto após aprovação da simulação de custos.',
    duration: '30 dias',
    steps: [
      'Simular importação online',
      'Tirar dúvidas com nossa equipe',
      'Iniciar contrato',
      'Pagamento direto para fábrica com custódia',
      'Teste de produto e envio de fotos/vídeos',
      'Envio da produção para o porto'
    ]
  },
  {
    id: 2,
    icon: Ship,
    title: 'EMBARQUE',
    subtitle: 'ETAPA 2',
    description: 'A carga já está pronta e será embarcada no navio com segurança total e rastreamento em tempo real.',
    duration: '45 dias',
    steps: [
      'Recebimento da carga no armazém',
      'Conferência de medidas',
      'Embarque no container',
      'Pagamento do embarque',
      'Aguardar chegada no porto do Brasil'
    ]
  },
  {
    id: 3,
    icon: Package,
    title: 'LIBERAÇÃO ADUANEIRA',
    subtitle: 'ETAPA 3',
    description: 'Cuidamos de toda a burocracia! Documentação preparada e impostos pagos para liberação rápida e segura.',
    duration: 'Desembaraço',
    steps: [
      'Pagamento de impostos conforme orçamento',
      'Desembaraço da carga',
      'Envio do produto para seu endereço',
      'Produto entregue!'
    ],
    highlight: true
  }
];

export function ImportSteps() {
  const [activeCard, setActiveCard] = useState(0);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleQuoteClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowWhatsAppModal(true);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const centerY = windowHeight / 2;
      
      cardsRef.current.forEach((card, index) => {
        if (card) {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.top + cardRect.height / 2;
          const distanceFromCenter = Math.abs(cardCenter - centerY);

          if (distanceFromCenter < windowHeight / 3) {
            setActiveCard(index);
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section id="processo" ref={sectionRef} className="py-16 sm:py-24 bg-tech-navy relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-cyan-400/20 flex items-center justify-center">
                <ArrowRight className="w-6 h-6 text-cyan-400" />
              </div>
              <p className="text-cyan-400 text-xs sm:text-sm font-semibold uppercase tracking-wider">
                PROCESSO DE IMPORTAÇÃO
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
              <span className="text-white">Como funciona o </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-500">Processo de Importação</span>
            </h2>
            <p className="text-slate-300 text-lg">
              Acompanhe cada etapa da sua importação de forma clara e transparente
            </p>
          </div>

          {/* Timeline - Desktop */}
          <div className="hidden lg:block relative mb-16">
            {/* Linha de Conexão */}
            <div className="absolute top-24 left-[16%] right-[16%] h-1 bg-gradient-to-r from-cyan-400 via-emerald-500 to-cyan-400 rounded-full" />
            
            {/* Progress Steps */}
            <div className="absolute top-[88px] left-[16%] right-[16%] flex justify-between">
              <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
              <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]" />
              <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
            </div>

            <div className="grid grid-cols-3 gap-8">
              {importSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.id} className="relative">
                    <div className="flex justify-center mb-8">
                      <div className="relative">
                        <div className={`w-20 h-20 rounded-full ${step.highlight ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' : 'bg-gradient-to-br from-cyan-400 to-emerald-500'} flex items-center justify-center shadow-glow-lg`}>
                          {step.highlight ? (
                            <CheckCircle2 className="w-10 h-10 text-white" />
                          ) : (
                            <Icon className="w-10 h-10 text-white" />
                          )}
                        </div>
                        <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-tech-navy border-2 ${step.highlight ? 'border-emerald-500' : 'border-cyan-400'} flex items-center justify-center`}>
                          <span className={`${step.highlight ? 'text-emerald-500' : 'text-cyan-400'} font-bold text-sm`}>{step.id}</span>
                        </div>
                      </div>
                    </div>

                    <div className={`bg-slate-900/80 border-2 ${step.highlight ? 'border-emerald-500/50' : 'border-white/10'} hover:border-emerald-500/60 rounded-2xl p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]`}>
                      <div className="text-center mb-4">
                        <p className={`${step.highlight ? 'text-emerald-500' : 'text-cyan-400'} text-xs font-bold uppercase tracking-wider mb-1`}>{step.subtitle}</p>
                        <h3 className="text-2xl font-bold text-white mb-2">{step.title}</h3>
                        <div className={`inline-flex items-center gap-2 ${step.highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-cyan-400/10 border-cyan-400/30'} border rounded-full px-3 py-1`}>
                          <span className={`${step.highlight ? 'text-emerald-500' : 'text-cyan-400'} text-sm font-semibold`}>{step.duration}</span>
                        </div>
                      </div>

                      <p className="text-slate-300 text-sm text-center mb-6 leading-relaxed">
                        {step.description}
                      </p>

                      <div className="space-y-2">
                        {step.steps.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3 text-left">
                            <CheckCircle2 className={`w-4 h-4 ${step.highlight ? 'text-emerald-500' : 'text-cyan-400'} flex-shrink-0 mt-0.5`} />
                            <p className="text-slate-300 text-xs leading-relaxed">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cards Stack - Mobile */}
          <div className="lg:hidden relative space-y-8">
            {importSteps.map((step, index) => {
              const Icon = step.icon;
              const isActive = activeCard === index;

              return (
                <div
                  key={step.id}
                  ref={(el) => (cardsRef.current[index] = el)}
                  className="relative w-full"
                >
                  {isActive && (
                    <div className="absolute inset-0 -z-10 blur-3xl opacity-30">
                      <div className={`w-full h-full rounded-3xl ${step.highlight ? 'bg-emerald-500' : 'bg-cyan-400'}`} />
                    </div>
                  )}

                  <div
                    className={`relative w-full bg-slate-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 transition-all duration-500 ${
                      isActive
                        ? step.highlight
                          ? 'border-2 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)]'
                          : 'border-2 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.4)]'
                        : 'border border-white/10'
                    }`}
                  >
                    <div className="absolute -top-3 -right-3">
                      <div className={`w-12 h-12 rounded-xl ${
                        step.highlight
                          ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                          : 'bg-gradient-to-br from-cyan-400 to-emerald-500'
                      } flex items-center justify-center shadow-lg ${
                        isActive ? 'shadow-[0_0_20px_rgba(16,185,129,0.6)]' : ''
                      } transition-all`}>
                        {step.highlight ? (
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        ) : (
                          <Icon className="w-6 h-6 text-white" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className={`${
                          step.highlight ? 'text-emerald-500' : 'text-cyan-400'
                        } text-xl font-bold uppercase tracking-wider mb-2`}>
                          {step.subtitle}
                        </p>
                        <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                          {step.title}
                        </h3>
                        <div className={`inline-flex items-center gap-2 ${
                          step.highlight
                            ? 'bg-emerald-500/20 border-emerald-500/40'
                            : 'bg-cyan-400/20 border-cyan-400/40'
                        } border rounded-full px-4 py-2`}>
                          <span className={`${
                            step.highlight ? 'text-emerald-400' : 'text-cyan-400'
                          } text-base font-semibold`}>
                            {step.duration}
                          </span>
                        </div>
                      </div>

                      {step.highlight && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                          <p className="text-emerald-400 text-sm font-semibold flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5" />
                            Cuidamos de toda a burocracia para você!
                          </p>
                        </div>
                      )}

                      <p className="text-slate-300 text-base leading-relaxed">
                        {step.description}
                      </p>

                      <div className="space-y-3 pt-2">
                        {step.steps.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <CheckCircle2 className={`w-5 h-5 ${
                              step.highlight ? 'text-emerald-500' : 'text-cyan-400'
                            } flex-shrink-0 mt-0.5`} />
                            <p className="text-slate-300 text-base leading-relaxed">
                              {item}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center mt-12">
            <button
              onClick={handleQuoteClick}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-tech-cyan via-tech-electric to-tech-cyan hover:from-tech-electric hover:via-tech-cyan hover:to-tech-electric text-white font-bold text-lg px-10 py-5 rounded-xl transition-all hover:scale-105 shadow-glow-lg hover:shadow-glow-blue-lg"
            >
              <LogIn className="w-5 h-5" />
              <span>Solicitar Orçamento</span>
            </button>
          </div>
        </div>
      </div>

      <WhatsAppInfoModal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} />
    </section>
  );
}
