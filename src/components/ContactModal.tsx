import { X, Mail } from 'lucide-react';
import whatsappIcon from '../assets/whatsapp1.png';
import verificadoIcon from '../assets/verificado.png';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactModal({ isOpen, onClose }: ContactModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-tech-navy border-2 border-tech-cyan/40 rounded-2xl max-w-md w-full shadow-glow-lg">
        {/* Header */}
        <div className="bg-tech-dark border-b border-tech-cyan/30 p-5 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-glow">
              <img src={whatsappIcon} alt="WhatsApp" className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Entre em Contato</h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-tech-blue/60 hover:bg-tech-cyan/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Email */}
          <a
            href="mailto:clube@ledbras.com.br"
            className="group flex items-center gap-4 p-4 bg-tech-blue/40 border-2 border-tech-cyan/20 hover:border-tech-cyan/40 rounded-xl transition-all hover:shadow-glow"
          >
            <div className="w-12 h-12 rounded-lg bg-tech-cyan/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-6 h-6 text-tech-cyan" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Email</p>
              <p className="text-white font-semibold">clube@ledbras.com.br</p>
            </div>
          </a>

          {/* WhatsApp Único */}
          <a
            href="https://wa.me/551433331005"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 p-4 bg-tech-blue/40 border-2 border-green-500/30 hover:border-green-500/50 rounded-xl transition-all hover:shadow-glow-lg"
          >
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 relative">
              <img src={whatsappIcon} alt="WhatsApp" className="w-7 h-7" />
              <img src={verificadoIcon} alt="Verificado" className="w-5 h-5 absolute -bottom-0.5 -right-0.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-white font-bold">Ledbras Oficial</p>
                <img src={verificadoIcon} alt="Verificado" className="w-4 h-4" />
              </div>
              <p className="text-sm text-slate-300 mb-1">(14) 3333-1005</p>
              <p className="text-xs text-slate-400">Orçamentos, dúvidas e suporte completo</p>
            </div>
          </a>

          <p className="text-xs text-center text-slate-400 pt-2">
            Resposta rápida em horário comercial
          </p>
        </div>
      </div>
    </div>
  );
}
