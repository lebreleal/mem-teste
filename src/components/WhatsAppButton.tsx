import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { WhatsAppInfoModal } from './WhatsAppInfoModal';

export function WhatsAppButton() {
  const [isVisible, setIsVisible] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Only show on main page (/)
  const isMainPage = location.pathname === '/';

  useEffect(() => {
    if (!isMainPage) {
      setIsVisible(false);
      return;
    }

    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      setIsVisible(scrollPercentage > 20);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMainPage]);

  if (!isVisible || !isMainPage) return null;

  const handleClick = () => {
    if (user) {
      navigate('/dashboard/quote');
    } else {
      setShowInfoModal(true);
    }
  };

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[9998] p-3 pb-4 animate-in slide-in-from-bottom-5 duration-300 pointer-events-none bg-gradient-to-t from-tech-dark/80 to-transparent">
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-tech-cyan to-tech-electric hover:from-tech-electric hover:to-tech-cyan text-white font-bold text-sm sm:text-base px-4 py-3.5 rounded-xl shadow-2xl shadow-tech-cyan/30 transition-all hover:scale-105 active:scale-95 pointer-events-auto"
        >
          <LogIn className="w-5 h-5 flex-shrink-0" />
          <span className="truncate">Solicitar Orçamento</span>
        </button>
      </div>
      <WhatsAppInfoModal isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} />
    </>
  );
}
