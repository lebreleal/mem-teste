import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, LogIn } from 'lucide-react';
import logoLedbras from '../assets/Logo Ledbras Branco.png';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';
import { useAuth } from '../contexts/AuthContext';

const menuItems = [
  { label: 'Início', href: '#inicio' },
  { label: 'Produtos', href: '#produtos' },
  { label: 'Diferenciais', href: '#tecnologia' },
  { label: 'Processo', href: '#processo' },
  { label: 'Treinamento', href: '#treinamento' },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMenuClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-tech-navy/80 backdrop-blur-xl border-b border-tech-cyan/30 shadow-lg shadow-tech-cyan/10'
          : 'bg-tech-navy/50 backdrop-blur-sm border-b border-tech-cyan/10'
      }`}
    >
      <nav className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center">
          <a href="#inicio">
            <img
              src={logoLedbras}
              alt="Ledbras - Venda e Importação de Painel de LED"
              className="h-8 sm:h-10"
              loading="eager"
              fetchPriority="high"
              width="120"
              height="40"
            />
          </a>
        </div>

        {/* Desktop Menu */}
        <ul className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          {menuItems.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                className="hover:text-tech-cyan transition-colors font-medium relative group"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-tech-cyan transition-all group-hover:w-full"></span>
              </a>
            </li>
          ))}
        </ul>

        {/* CTA Buttons Desktop */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <a
            href="/auth"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-tech-blue/60 border border-tech-cyan/30 text-tech-cyan hover:bg-tech-cyan/20 hover:border-tech-cyan/50 transition-all font-medium text-sm whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            Entrar
          </a>
          <button
            onClick={() => {
              if (user) {
                navigate('/dashboard/quote');
              } else {
                setShowWhatsAppModal(true);
              }
            }}
            className={`inline-flex bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold px-4 py-2 text-sm rounded-lg transition-all hover:scale-105 items-center gap-2 whitespace-nowrap ${
              isScrolled ? 'shadow-glow' : 'shadow-glow-lg'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Orçamento
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-tech-navy/95 backdrop-blur-xl border-t border-tech-cyan/20 relative z-40">
          <ul className="container mx-auto px-4 py-4 space-y-4">
            {menuItems.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  onClick={handleMenuClick}
                  className="block text-slate-300 hover:text-tech-cyan transition-colors font-medium py-2"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="pt-2 flex flex-col gap-2">
              <a
                href="/auth"
                onClick={handleMenuClick}
                className="flex-1 bg-tech-blue/60 border border-tech-cyan/30 text-tech-cyan font-medium px-4 py-3 text-center rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Entrar
              </a>
              <button
                onClick={() => {
                  handleMenuClick();
                  if (user) {
                    navigate('/dashboard/quote');
                  } else {
                    setShowWhatsAppModal(true);
                  }
                }}
                className="flex-1 bg-gradient-to-r from-tech-cyan to-tech-electric text-white font-bold px-4 py-3 text-center rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Orçamento
              </button>
            </li>
          </ul>
        </div>
      )}

      <WhatsAppInfoModal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} />
    </header>
  );
}
