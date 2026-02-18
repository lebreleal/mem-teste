import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Eye } from 'lucide-react';

const ImpersonationBanner = () => {
  const [targetName, setTargetName] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_session');
    if (stored) {
      const impersonatedName = sessionStorage.getItem('impersonated_name');
      setTargetName(impersonatedName || 'Usuário');
    } else {
      setTargetName(null);
    }
  }, []);

  const handleReturn = async () => {
    setRestoring(true);
    try {
      const stored = sessionStorage.getItem('admin_session');
      if (!stored) return;

      const adminSession = JSON.parse(stored);

      // Sign out from impersonated session
      await supabase.auth.signOut();

      // Restore admin session
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });

      sessionStorage.removeItem('admin_session');
      sessionStorage.removeItem('impersonated_name');

      navigate('/admin/users');
    } catch (err) {
      console.error('Failed to restore admin session:', err);
    } finally {
      setRestoring(false);
    }
  };

  if (!targetName) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        <span>Você está como <strong>{targetName}</strong></span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleReturn}
        disabled={restoring}
        className="h-7 text-xs"
      >
        <LogOut className="w-3 h-3 mr-1" />
        {restoring ? 'Voltando...' : 'Voltar para Admin'}
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
