import { useState } from 'react';
import { Shield, Truck, Wrench, DollarSign, FileCheck, Headphones, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

const differentials = [
  {
    icon: Shield,
    title: 'Garantia de Fábrica',
    description: '2 anos de garantia direta do fabricante com suporte técnico'
  },
  {
    icon: Truck,
    title: 'Logística Completa',
    description: 'Frete internacional calculado e rastreamento em tempo real'
  },
  {
    icon: FileCheck,
    title: 'Documentação Inclusa',
    description: 'Todos os impostos, taxas e certificações já calculados'
  },
  {
    icon: DollarSign,
    title: 'Melhor Preço',
    description: 'Até 70% mais barato que o mercado nacional'
  },
  {
    icon: Wrench,
    title: 'Instalação Facilitada',
    description: 'Manuais técnicos e vídeos tutoriais em português'
  },
  {
    icon: Headphones,
    title: 'Suporte 24/7',
    description: 'Equipe especializada para tirar suas dúvidas'
  }
];

export function Differentials() {
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
    <section id="diferenciais" className="py-16 sm:py-24 bg-tech-navy">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-tech-cyan/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-tech-cyan" />
            </div>
            <p className="text-tech-cyan text-xs sm:text-sm font-semibold uppercase tracking-wider">
              DIFERENCIAIS
            </p>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 leading-tight">
            <span className="text-white">Por que </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">Importar Conosco</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-400">
            Cuidamos de todo o processo para você focar no que realmente importa: seu negócio
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {differentials.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="group bg-tech-blue/30 hover:bg-tech-blue/50 border border-tech-cyan/20 hover:border-tech-cyan/50 rounded-xl p-6 transition-all hover:scale-105 backdrop-blur-sm hover:shadow-glow"
              >
                <div className="bg-gradient-to-br from-tech-cyan to-tech-electric w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-glow">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400">{item.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-16 bg-gradient-to-r from-tech-blue/50 to-tech-navy border border-tech-cyan/30 rounded-2xl p-8 lg:p-12 backdrop-blur-sm">
          <div className="grid lg:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric mb-2">
                +5.000
              </p>
              <p className="text-slate-400">painéis LED importados</p>
              <p className="text-slate-500 text-sm mt-1">Com sucesso até hoje</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-tech-electric to-tech-glow mb-2">
                70%
              </p>
              <p className="text-slate-400">de economia vs mercado nacional</p>
              <p className="text-slate-500 text-sm mt-1">Média comprovada</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-tech-accent to-tech-cyan mb-2">
                90 dias
              </p>
              <p className="text-slate-400">prazo médio de entrega completa</p>
              <p className="text-slate-500 text-sm mt-1">Da fábrica até sua porta</p>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
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
