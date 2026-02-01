import { useState } from 'react';
import { Cpu, CircuitBoard, Battery, Box, Tag, X, ExternalLink, Zap, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

export function TechnologySection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleQuoteClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowWhatsAppModal(true);
    }
  };

  return (
    <section className="py-20 sm:py-28 bg-tech-dark">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-tech-cyan/20 flex items-center justify-center">
                <Cpu className="w-7 h-7 text-tech-cyan" />
              </div>
              <p className="text-tech-cyan text-sm sm:text-base font-semibold uppercase tracking-wider">
                NOSSA TECNOLOGIA
              </p>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              <span className="text-white">Nossa tecnologia é diferente dos produtos </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">NACIONAIS!</span>
            </h2>
            <p className="text-lg sm:text-xl text-slate-400 leading-relaxed">
              Nossos LEDs são diferentes do que você encontra nos varejistas no Brasil, customizamos todos os componentes.
            </p>
          </div>

          {/* Card Principal - Full Width on Mobile, Destaque */}
          <div className="mb-6 lg:mb-8">
            <div className="group relative border-2 border-tech-cyan/60 hover:border-tech-cyan rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-tech-blue/60 to-tech-navy/80 backdrop-blur-sm transition-all duration-300 hover:shadow-glow-lg">
              {/* Premium Badge */}
              <div className="absolute -top-3 -right-3 bg-gradient-to-r from-tech-cyan to-tech-electric text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-glow">
                ALTA DURABILIDADE
              </div>

              {/* Conteúdo */}
              <div>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-tech-cyan to-tech-electric flex items-center justify-center shadow-glow flex-shrink-0">
                    <CircuitBoard className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-3xl font-bold text-white group-hover:text-tech-cyan transition-colors">
                      Alta durabilidade: PCB 4 Layers (1.6mm)
                    </h3>
                  </div>
                </div>
                <p className="text-base sm:text-lg text-slate-300 leading-relaxed mb-4">
                  Dissipação térmica superior. Não empena no sol e não quebra a solda.
                </p>
                <div className="bg-tech-cyan/10 border border-tech-cyan/30 rounded-lg p-4">
                  <p className="text-sm text-slate-400">
                    <strong className="text-tech-cyan">Diferencial:</strong> Enquanto painéis nacionais usam PCB 2 Layers, nossa tecnologia premium com 4 camadas oferece resistência ao calor intenso brasileiro e durabilidade muito superior.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cards Secundários - Grid 2 Colunas no Mobile */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-8">
            {/* Card 1: Chips Premium */}
            <div className="group relative border-2 border-tech-cyan/30 hover:border-tech-cyan/60 rounded-xl p-4 bg-tech-blue/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-tech-cyan to-tech-electric flex items-center justify-center mb-3 shadow-glow mx-auto">
                <Cpu className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white text-center mb-1 group-hover:text-tech-cyan transition-colors">
                Chips de Elite
              </h3>
              <p className="text-xs text-slate-400 text-center">
                Kinglight/Nationstar
              </p>
            </div>

            {/* Card 2: Fontes */}
            <div className="group relative border-2 border-tech-cyan/30 hover:border-tech-cyan/60 rounded-xl p-4 bg-tech-blue/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-tech-electric to-tech-glow flex items-center justify-center mb-3 shadow-glow mx-auto">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white text-center mb-1 group-hover:text-tech-cyan transition-colors">
                Energia Estável
              </h3>
              <p className="text-xs text-slate-400 text-center">
                Fontes Meanwell/G-Energy
              </p>
            </div>

            {/* Card 3: Personalização */}
            <div className="group relative border-2 border-tech-cyan/30 hover:border-tech-cyan/60 rounded-xl p-4 bg-tech-blue/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-tech-accent to-tech-cyan flex items-center justify-center mb-3 shadow-glow mx-auto">
                <Tag className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white text-center mb-1 group-hover:text-tech-cyan transition-colors">
                Sua Marca
              </h3>
              <p className="text-xs text-slate-400 text-center">
                Gravação a Laser no Case
              </p>
            </div>

            {/* Card 4: Gabinete */}
            <div className="group relative border-2 border-tech-cyan/30 hover:border-tech-cyan/60 rounded-xl p-4 bg-tech-blue/40 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-tech-cyan to-tech-electric flex items-center justify-center mb-3 shadow-glow mx-auto">
                <Box className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white text-center mb-1 group-hover:text-tech-cyan transition-colors">
                Gabinete
              </h3>
              <p className="text-xs text-slate-400 text-center">
                Aço ou Alumínio
              </p>
            </div>
          </div>

          {/* CTA Button - Abre Modal */}
          <div className="text-center">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold text-base sm:text-lg px-8 sm:px-10 py-4 sm:py-5 rounded-xl transition-all hover:scale-105 shadow-glow-lg hover:shadow-glow-blue-lg"
            >
              <span>Ver Tabela Técnica</span>
              <ExternalLink className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Tabela Técnica */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-tech-navy border-2 border-tech-cyan/40 rounded-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-glow-lg">
            {/* Header */}
            <div className="sticky top-0 bg-tech-dark border-b border-tech-cyan/30 p-4 sm:p-6 flex items-center justify-between z-10">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-tech-cyan to-tech-electric flex items-center justify-center shadow-glow">
                  <CircuitBoard className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <h3 className="text-base sm:text-xl font-bold text-white">Especificações Técnicas</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-tech-blue/60 hover:bg-tech-cyan/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6">
              <div className="space-y-4">
                {/* PCB */}
                <div className="bg-tech-blue/40 border border-tech-cyan/30 rounded-xl p-3 sm:p-5">
                  <h4 className="text-sm sm:text-lg font-bold text-tech-cyan mb-2 sm:mb-3 flex items-center gap-2">
                    <CircuitBoard className="w-4 h-4 sm:w-5 sm:h-5" />
                    PCB (Placa de Circuito)
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2 text-slate-300 text-xs sm:text-base">
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Camadas:</strong> 4 Layers (1.6mm)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Dissipação:</strong> Superior</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Resistência:</strong> Não empena</span>
                    </li>
                  </ul>
                </div>

                {/* Chips LED */}
                <div className="bg-tech-blue/40 border border-tech-cyan/30 rounded-xl p-3 sm:p-5">
                  <h4 className="text-sm sm:text-lg font-bold text-tech-cyan mb-2 sm:mb-3 flex items-center gap-2">
                    <Cpu className="w-4 h-4 sm:w-5 sm:h-5" />
                    Chips LED
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2 text-slate-300 text-xs sm:text-base">
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Marcas:</strong> Kinglight/Nationstar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Qualidade:</strong> Premium</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Vida Útil:</strong> 100.000h</span>
                    </li>
                  </ul>
                </div>

                {/* Fontes */}
                <div className="bg-tech-blue/40 border border-tech-cyan/30 rounded-xl p-3 sm:p-5">
                  <h4 className="text-sm sm:text-lg font-bold text-tech-cyan mb-2 sm:mb-3 flex items-center gap-2">
                    <Battery className="w-4 h-4 sm:w-5 sm:h-5" />
                    Fontes
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2 text-slate-300 text-xs sm:text-base">
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Marcas:</strong> Meanwell/G-Energy</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Certificações:</strong> CE, RoHS, FCC</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Garantia:</strong> 2 anos</span>
                    </li>
                  </ul>
                </div>

                {/* Gabinetes */}
                <div className="bg-tech-blue/40 border border-tech-cyan/30 rounded-xl p-3 sm:p-5">
                  <h4 className="text-sm sm:text-lg font-bold text-tech-cyan mb-2 sm:mb-3 flex items-center gap-2">
                    <Box className="w-4 h-4 sm:w-5 sm:h-5" />
                    Gabinetes
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2 text-slate-300 text-xs sm:text-base">
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Materiais:</strong> Aço/Alumínio/Magnésio</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Proteção:</strong> IP65/IP54</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-tech-cyan mt-0.5 sm:mt-1">•</span>
                      <span><strong>Personalização:</strong> Logo a laser</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Link para Drive */}
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-tech-cyan/30">
                <a
                  href="https://drive.google.com/file/d/1wLQajM6IpZESV6ft1dmTeIkm8pUZriD1/view?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-tech-cyan hover:text-tech-electric transition-colors font-semibold text-xs sm:text-base"
                >
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>Ver Documentação Completa</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto mt-16 text-center">
          <button
            onClick={handleQuoteClick}
            className="group relative bg-gradient-to-r from-tech-cyan via-tech-electric to-tech-cyan hover:from-tech-electric hover:via-tech-cyan hover:to-tech-electric text-white font-bold text-lg px-10 py-5 rounded-xl transition-all hover:scale-105 shadow-glow-lg hover:shadow-glow-blue-lg inline-flex items-center gap-3"
          >
            <LogIn className="w-5 h-5" />
            <span>Solicitar Orçamento</span>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-tech-cyan to-tech-electric opacity-0 group-hover:opacity-30 blur-xl transition-opacity"></div>
          </button>
        </div>
      </div>

      <WhatsAppInfoModal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} />
    </section>
  );
}
