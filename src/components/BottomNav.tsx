import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

const BottomNav = React.forwardRef<HTMLElement>((_, ref) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const items = [
    { icon: Home, label: null, onClick: () => navigate('/dashboard'), active: isActive('/dashboard') },
    { icon: BrainCircuit, label: null, onClick: () => navigate('/conceitos'), active: isActive('/conceitos') },
    { icon: Gauge, label: null, onClick: () => navigate('/desempenho'), active: isActive('/desempenho') },
  ];

  return (
    <nav ref={ref} className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around px-2 pb-2 pt-1">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              onClick={item.onClick}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors',
                item.active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label && <span className="text-[10px] font-semibold">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';

export default BottomNav;
