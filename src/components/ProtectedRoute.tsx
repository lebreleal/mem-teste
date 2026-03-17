import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import BottomNav from '@/components/BottomNav';
import ImpersonationBanner from '@/components/ImpersonationBanner';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isOnDashboard = location.pathname === '/dashboard';
  const isOnMateria = location.pathname.startsWith('/materia/');
  const folderId = searchParams.get('folder');
  const isInsideSala = isOnDashboard && !!folderId;

  const isCommunityFolder = useMemo(() => {
    if (!folderId || !user) return false;
    const foldersCache = queryClient.getQueryData<any[]>(['folders', user.id]);
    if (foldersCache) {
      const folder = foldersCache.find((f: any) => f.id === folderId);
      if (folder) return !!folder.source_turma_id;
    }
    return false;
  }, [folderId, queryClient, user]);

  const showNavRoutes = ['/dashboard', '/turmas', '/profile', '/desempenho', '/materia'];
  const hideNavPatterns = ['/study/', '/lessons/'];
  const showNav = showNavRoutes.some(r => location.pathname === r || location.pathname.startsWith(r + '/'))
    && !hideNavPatterns.some(p => location.pathname.includes(p));

  // Listen for events from other components
  import { useEffect } from 'react';
  useEffect(() => {
    const addMenuHandler = () => {
      if (isOnMateria) {
        window.dispatchEvent(new CustomEvent('open-pasta-add-menu'));
        return;
      }
      if (!isOnDashboard) return;
      if (isInsideSala && isCommunityFolder) return;
      if (!isInsideSala) {
        navigate('/dashboard?action=create-sala');
      } else {
        window.dispatchEvent(new CustomEvent('open-sala-add-menu'));
      }
    };
    window.addEventListener('open-add-menu', addMenuHandler);
    return () => {
      window.removeEventListener('open-add-menu', addMenuHandler);
    };
  }, [isOnDashboard, isOnMateria, isInsideSala, isCommunityFolder, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const isImpersonating = !!sessionStorage.getItem('admin_session');

  return (
    <>
      {isImpersonating && <ImpersonationBanner />}
      <div className={`${showNav ? 'pb-20' : ''} ${isImpersonating ? 'pt-10' : ''}`}>
        {children}
      </div>
      {showNav && <BottomNav />}
    </>
  );
};

export default ProtectedRoute;
