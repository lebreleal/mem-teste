import { useState, useEffect } from 'react';
import { Eye, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import conteinerImage from '../assets/conteiner.png';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

function getViewerCount() {
  const now = new Date();
  const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hour = brasilia.getHours();

  if (hour >= 8 && hour < 18) {
    return Math.floor(Math.random() * 3) + 8;
  } else {
    return Math.floor(Math.random() * 2) + 1;
  }
}

export function HeroSection() {
  const [viewerCount, setViewerCount] = useState(getViewerCount());
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount(getViewerCount());
    }, 120000);

    return () => clearInterval(interval);
  }, []);

  const handleQuoteClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowWhatsAppModal(true);
    }
  };

  return (
    <section id="inicio" className="relative min-h-screen bg-gradient-to-br from-tech-dark via-tech-navy to-tech-blue pt-20 pb-16 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-tech-cyan/8 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-tech-electric/8 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-tech-glow/5 rounded-full blur-[150px]" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(0,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '50px 50px'
      }} />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Desktop Layout */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center lg:min-h-[calc(100vh-160px)]">
            <div className="space-y-8">
              {/* Live Badge */}
              <div className="inline-flex items-center gap-2 bg-tech-cyan/10 border border-tech-cyan/30 rounded-full px-5 py-2.5 backdrop-blur-sm">
                <div className="w-2 h-2 bg-tech-cyan rounded-full animate-pulse shadow-glow" />
                <span className="text-tech-cyan text-sm font-semibold">+470 painéis importados com sucesso</span>
              </div>

              {/* Main Headline */}
              <div className="relative">
                <h1 className="text-5xl xl:text-6xl 2xl:text-7xl font-bold text-white leading-[1.1] tracking-tight">
                  Compre Painel LED direto da fábrica e diminua seus custos,
                  <span className="block mt-4 text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan via-tech-electric to-tech-glow">
                    IMPORTE DA CHINA
                  </span>
                </h1>
              </div>

              {/* Description */}
              <p className="text-xl text-slate-400 leading-relaxed max-w-xl">
                Faça um orçamento de forma gratuita, compre Painel LED 100% personalizado
              </p>

              {/* CTA Button */}
              <div className="pt-2">
                <button
                  onClick={handleQuoteClick}
                  className="group relative bg-gradient-to-r from-tech-cyan via-tech-electric to-tech-cyan hover:from-tech-electric hover:via-tech-cyan hover:to-tech-electric text-white font-bold text-lg px-10 py-5 rounded-xl transition-all hover:scale-105 shadow-glow-lg hover:shadow-glow-blue-lg inline-flex items-center gap-3"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Solicitar Orçamento</span>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-tech-cyan to-tech-electric opacity-0 group-hover:opacity-30 blur-xl transition-opacity"></div>
                </button>
              </div>

              {/* Viewers */}
              <div className="flex items-center gap-2 text-emerald-400">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <Eye className="w-4 h-4" />
                <span className="text-sm font-medium">{viewerCount} pessoas visualizando agora</span>
              </div>
            </div>

            {/* Hero Image */}
            <div className="flex justify-center items-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-tech-cyan/20 to-tech-electric/20 blur-3xl rounded-full" />
                <img
                  src={conteinerImage}
                  alt="Container de Importação de Painel LED da China"
                  className="relative w-full max-w-xl h-auto drop-shadow-2xl hover:scale-105 transition-transform duration-500"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="lg:hidden flex flex-col items-center space-y-8 pt-8">
            <div className="w-full max-w-sm">
              <img
                src={conteinerImage}
                alt="Venda de Painel de LED"
                className="w-full h-auto drop-shadow-2xl"
                loading="eager"
                fetchPriority="high"
              />
            </div>

            <div className="text-center space-y-6 px-2">
              <div className="inline-flex items-center gap-2 bg-tech-cyan/10 border border-tech-cyan/30 rounded-full px-4 py-2 backdrop-blur-sm">
                <div className="w-2 h-2 bg-tech-cyan rounded-full animate-pulse" />
                <span className="text-tech-cyan text-sm font-medium">+470 painéis importados com sucesso</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                Compre Painel LED direto da fábrica,
                <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-tech-cyan to-tech-electric">
                  IMPORTE DA CHINA
                </span>
              </h1>

              <p className="text-lg text-slate-400">
                Faça um orçamento gratuito, compre Painel LED 100% personalizado
              </p>

              <button
                onClick={handleQuoteClick}
                className="w-full bg-gradient-to-r from-tech-cyan via-tech-electric to-tech-cyan text-white font-bold text-lg px-8 py-4 rounded-xl shadow-glow-lg inline-flex items-center justify-center gap-3"
              >
                <LogIn className="w-5 h-5" />
                <span>Solicitar Orçamento</span>
              </button>

              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <Eye className="w-4 h-4" />
                <span className="text-sm font-medium">{viewerCount} pessoas visualizando agora</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WhatsAppInfoModal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} />
    </section>
  );
}
