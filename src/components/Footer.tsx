import { useState } from 'react';
import { Mail, Phone, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoLedbras from '../assets/Logo Ledbras Branco.png';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

const WHATSAPP_URL = 'https://wa.me/551433331005';

export function Footer() {
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
    <footer className="bg-tech-dark border-t border-tech-cyan/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-16">
          <div className="grid md:grid-cols-12 gap-12 lg:gap-16">
            {/* Brand Column */}
            <div className="md:col-span-4">
              <div className="mb-6">
                <img
                  src={logoLedbras}
                  alt="Ledbras - Venda e Importação de Painel de LED"
                  className="h-12"
                  loading="lazy"
                  width="140"
                  height="48"
                />
              </div>
              <p className="text-slate-400 text-base leading-relaxed mb-6">
                Importação facilitada de painéis LED profissionais direto da China com garantia e suporte completo.
              </p>
              <button
                onClick={handleQuoteClick}
                className="inline-flex items-center gap-2 text-tech-cyan hover:text-tech-electric font-semibold text-sm transition-colors group"
              >
                <span>Solicitar Orçamento</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Navigation Column */}
            <div className="md:col-span-2">
              <h4 className="text-white font-bold text-base mb-6 uppercase tracking-wider">Navegação</h4>
              <ul className="space-y-3">
                <li>
                  <a href="#inicio" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Início
                  </a>
                </li>
                <li>
                  <a href="#produtos" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Produtos
                  </a>
                </li>
                <li>
                  <a href="#diferenciais" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Diferenciais
                  </a>
                </li>
                <li>
                  <a href="#processo" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Processo
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>

            {/* Resources Column */}
            <div className="md:col-span-3">
              <h4 className="text-white font-bold text-base mb-6 uppercase tracking-wider">Recursos</h4>
              <ul className="space-y-3">
                <li>
                  <a href="#simulador" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Ferramentas de Cálculo
                  </a>
                </li>
                <li>
                  <a href="#treinamento" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Treinamento Bônus
                  </a>
                </li>
                <li>
                  <a href="#" className="text-slate-400 hover:text-tech-cyan transition-colors text-sm">
                    Documentação Técnica
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact Column */}
            <div className="md:col-span-3">
              <h4 className="text-white font-bold text-base mb-6 uppercase tracking-wider">Contato</h4>
              <ul className="space-y-4">
                <li>
                  <a
                    href="mailto:clube@ledbras.com.br"
                    className="group flex items-start gap-3 text-slate-400 hover:text-tech-cyan transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-tech-cyan/10 border border-tech-cyan/20 flex items-center justify-center flex-shrink-0 group-hover:bg-tech-cyan/20 group-hover:border-tech-cyan/40 transition-all">
                      <Mail className="w-5 h-5 text-tech-cyan" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Email</p>
                      <p className="text-sm font-semibold">clube@ledbras.com.br</p>
                    </div>
                  </a>
                </li>
                <li>
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 text-slate-400 hover:text-tech-cyan transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/20 group-hover:border-green-500/50 transition-all relative">
                      <Phone className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">WhatsApp</p>
                        <span className="flex items-center gap-0.5 bg-blue-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                          </svg>
                          Verificado
                        </span>
                      </div>
                      <p className="text-sm font-semibold">(14) 3333-1005</p>
                    </div>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-tech-cyan/20 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 text-sm">
              © 2024 Ledbras. Todos os direitos reservados.
            </p>
            <div className="flex flex-wrap gap-6 text-slate-500 text-sm">
              <a href="#" className="hover:text-tech-cyan transition-colors">
                Termos de Uso
              </a>
              <a href="#" className="hover:text-tech-cyan transition-colors">
                Privacidade
              </a>
              <a href="#" className="hover:text-tech-cyan transition-colors">
                Política de Cookies
              </a>
            </div>
          </div>
        </div>
      </div>

      <WhatsAppInfoModal isOpen={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} />
    </footer>
  );
}
