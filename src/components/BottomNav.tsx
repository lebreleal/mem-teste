import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const BottomNav = React.forwardRef<HTMLElement>((_, ref) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    // When inside a sala (folder param present), Home should NOT be active
    if (path === '/dashboard' && location.search.includes('folder=')) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleExplorar = () => {
    navigate('/turmas');
  };

  const items = [
    { icon: Home, label: 'Home', onClick: () => navigate('/dashboard'), active: isActive('/dashboard') },
    { icon: Plus, label: 'Adicionar', onClick: () => window.dispatchEvent(new CustomEvent('open-add-menu')), active: false, accent: true },
    { icon: Compass, label: 'Explorar', onClick: handleExplorar, active: isActive('/explorar') || isActive('/turmas') },
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
                item.accent
                  ? 'text-primary-foreground bg-primary rounded-full h-10 w-10 flex items-center justify-center shadow-md -mt-2'
                  : item.active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', item.accent && 'h-5 w-5')} />
              {!item.accent && item.label && <span className="text-[10px] font-semibold">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';

export default BottomNav;
