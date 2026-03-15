import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const BottomNav = React.forwardRef<HTMLElement>((_, ref) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isActive = (path: string) => {
    if (path === '/dashboard' && location.search.includes('folder=')) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isOnDashboard = location.pathname === '/dashboard';

  // Check if current folder is a community (followed) folder
  const isCommunityFolder = React.useMemo(() => {
    if (!isOnDashboard) return false;
    const params = new URLSearchParams(location.search);
    const folderId = params.get('folder');
    if (!folderId || !user) return false;
    const foldersCache = queryClient.getQueryData<any[]>(['folders', user.id]);
    if (foldersCache) {
      const folder = foldersCache.find((f: any) => f.id === folderId);
      if (folder) return !!folder.source_turma_id;
    }
    return false;
  }, [isOnDashboard, location.search, user, queryClient]);

  const isInsideSala = isOnDashboard && location.search.includes('folder=');
  const isDisabledAdd = !isOnDashboard || (isInsideSala && isCommunityFolder);

  const handleExplorar = () => {
    navigate('/turmas');
  };

  const handleAdd = () => {
    if (isDisabledAdd) return;
    window.dispatchEvent(new CustomEvent('open-add-menu'));
  };

  const items = [
    { icon: Home, label: 'Home', onClick: () => navigate('/dashboard'), active: isActive('/dashboard') },
    { icon: Plus, label: 'Adicionar', onClick: handleAdd, active: false, accent: true, disabled: isDisabledAdd, dimmed: isInsideSala && isCommunityFolder },
    { icon: Compass, label: 'Explorar', onClick: handleExplorar, active: isActive('/explorar') || isActive('/turmas') },
  ];

  return (
    <nav ref={ref} className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around px-2 pb-2 pt-1">
        {items.map((item, i) => {
          const Icon = item.icon;
          const isItemDisabled = !!(item as any).disabled;
          const isDimmed = !!(item as any).dimmed;
          return (
            <button
              key={i}
              onClick={isItemDisabled ? undefined : item.onClick}
              disabled={isItemDisabled}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors',
                item.accent && !isItemDisabled
                  ? 'text-primary-foreground bg-primary rounded-full h-10 w-10 flex items-center justify-center shadow-md -mt-2'
                  : item.accent && isDimmed
                  ? 'text-muted-foreground bg-transparent border border-border/50 rounded-full h-10 w-10 flex items-center justify-center -mt-2 opacity-40'
                  : item.accent && isItemDisabled
                  ? 'text-muted-foreground bg-muted rounded-full h-10 w-10 flex items-center justify-center -mt-2 opacity-40'
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
