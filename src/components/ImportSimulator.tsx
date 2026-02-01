import { Calculator, Zap, ArrowRight, FileText, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ImportSimulator() {
  const navigate = useNavigate();

  const calculators = [
    {
      id: 'quote',
      title: 'Solicitar Orçamento',
      description: 'Solicite um orçamento personalizado para seu projeto',
      icon: FileText,
      color: 'from-tech-cyan to-tech-electric',
    },
    {
      id: 'energy',
      title: 'Consumo de Energia',
      description: 'Estime o gasto mensal de energia do seu Outdoor Painel LED',
      icon: Zap,
      color: 'from-tech-electric to-tech-glow',
    },
    {
      id: 'profitability',
      title: 'Calculadora de Rentabilidade',
      description: 'Projete o retorno do seu investimento',
      icon: TrendingUp,
      color: 'from-tech-accent to-tech-cyan',
    }
  ];

  const handleAccessClick = () => {
    navigate('/auth');
  };

  return (
    <section id="simulador" className="py-16 sm:py-24 bg-tech-dark">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-tech-cyan/20 flex items-center justify-center">
                <Calculator className="w-6 h-6 text-tech-cyan" />
              </div>
              <p className="text-tech-cyan text-xs sm:text-sm font-semibold uppercase tracking-wider">
                FERRAMENTAS DE CÁLCULO
              </p>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              <span className="text-white">Planeje seu </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">Investimento</span>
            </h2>
            <p className="text-base sm:text-lg text-slate-400">
              Calculadoras profissionais para planejar seu negócio com precisão
            </p>
          </div>

          <div className="space-y-4 max-w-3xl mx-auto">
            {calculators.map((calc) => {
              const Icon = calc.icon;
              return (
                <button
                  key={calc.id}
                  onClick={handleAccessClick}
                  className="group w-full flex items-center gap-4 bg-gradient-to-r from-tech-blue/60 to-tech-navy/80 border-2 border-tech-cyan/30 hover:border-tech-cyan/60 rounded-2xl p-4 sm:p-5 transition-all duration-300 hover:shadow-glow backdrop-blur-sm text-left"
                >
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-xl bg-gradient-to-br ${calc.color} flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform`}>
                    <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-tech-cyan transition-colors">
                      {calc.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400">
                      {calc.description}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold text-xs sm:text-sm px-4 sm:px-6 py-2 sm:py-3 rounded-lg transition-all group-hover:scale-105 shadow-glow">
                      <span className="hidden sm:inline">Acessar</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* CTA Info */}
          <div className="mt-8 text-center">
            <p className="text-slate-400 text-sm">
              Todas as calculadoras são <span className="text-tech-cyan font-semibold">gratuitas</span> e fornecem estimativas precisas
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
