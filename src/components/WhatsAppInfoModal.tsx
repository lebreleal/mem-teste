import { X, MessageCircle, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface WhatsAppInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsAppInfoModal({ isOpen, onClose }: WhatsAppInfoModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleLogin = () => {
    onClose();
    navigate('/auth');
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-tech-navy border-2 border-tech-cyan/40 rounded-2xl max-w-md w-full shadow-glow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-tech-dark border-b border-tech-cyan/30 p-5 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-lg font-bold text-white">Informação</h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-tech-blue/60 hover:bg-tech-cyan/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <p className="text-slate-300 text-center leading-relaxed">
            O WhatsApp é um canal exclusivo para <span className="text-tech-cyan font-semibold">dúvidas</span> e <span className="text-tech-cyan font-semibold">acompanhamento de importações em processo</span>.
          </p>
          
          <p className="text-slate-300 text-center leading-relaxed">
            Para solicitar novos orçamentos, por favor, realize o login. <span className="text-tech-electric font-semibold">É super rápido!</span>
          </p>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold text-base transition-all hover:scale-105 shadow-glow"
          >
            <LogIn className="w-5 h-5" />
            <span>Fazer Login</span>
          </button>

          <p className="text-xs text-center text-slate-500">
            Não tem uma conta? Você pode criar uma na tela de login.
          </p>
        </div>
      </div>
    </div>
  );
}
