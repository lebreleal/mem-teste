import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageCircle, UserPlus } from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/551433331005?text=Olá! Gostaria de solicitar um orçamento para painéis LED.';

interface QuoteChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuoteChoiceModal({ isOpen, onClose }: QuoteChoiceModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
      style={{ zIndex: 999999 }}
    >
      <div 
        className="relative bg-tech-navy border-2 border-tech-cyan/40 rounded-2xl max-w-md w-full shadow-glow-lg my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-tech-dark border-b border-tech-cyan/30 p-5 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-lg font-bold text-white">Solicitar Orçamento</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-tech-blue/60 hover:bg-tech-cyan/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-slate-300 text-center">
            Como você gostaria de solicitar seu orçamento?
          </p>

          {/* WhatsApp Option */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-green-500/20 to-green-600/20 border-2 border-green-500/40 hover:border-green-500/60 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold">WhatsApp</h4>
              <p className="text-slate-400 text-sm">Atendimento rápido e personalizado</p>
            </div>
          </a>

          {/* Create Account Option */}
          <a
            href="/auth"
            onClick={onClose}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-tech-cyan/20 to-tech-electric/20 border-2 border-tech-cyan/40 hover:border-tech-cyan/60 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-tech-cyan to-tech-electric flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold">Criar Conta</h4>
              <p className="text-slate-400 text-sm">Acompanhe seu orçamento online</p>
            </div>
          </a>

          <p className="text-xs text-center text-slate-500">
            Resposta rápida em horário comercial
          </p>
        </div>
      </div>
    </div>
  );

  // Render modal at document body level using portal
  return createPortal(modalContent, document.body);
}
