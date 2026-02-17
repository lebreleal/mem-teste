import { useLocation, useNavigate } from 'react-router-dom';
import { Brain, Home, User, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMissions } from '@/hooks/useMissions';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { missions } = useMissions();

  const claimableCount = missions.filter(m => m.isCompleted && !m.isClaimed).length;

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const items = [
    { icon: Home, label: 'Início', onClick: () => navigate('/dashboard'), active: isActive('/dashboard') },
    { icon: Trophy, label: 'Missões', onClick: () => navigate('/missoes'), active: isActive('/missoes'), badge: claimableCount },
    { icon: Brain, label: 'IA', onClick: () => navigate('/ia'), active: isActive('/ia') },
    { icon: User, label: 'Perfil', onClick: () => navigate('/profile'), active: isActive('/profile') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around px-2 pb-2 pt-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors',
                item.active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
