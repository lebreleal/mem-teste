import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import MemoCardsLogo from '@/components/MemoCardsLogo';
import ThemeToggle from '@/components/ThemeToggle';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (user) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 relative">
      <ThemeToggle className="absolute top-4 right-4" />

      <div className="flex flex-col items-center w-full max-w-sm">
        {/* Logo + Brand */}
        <MemoCardsLogo size={56} className="mb-3" />
        <h1 className="font-display text-2xl font-black tracking-tight text-foreground">
          memocards
        </h1>

        {/* Tagline */}
        <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground text-center leading-tight mt-8 mb-2">
          Transforme seus<br />materiais em estudo.
        </h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed mb-12">
          Crie flashcards com <strong className="text-foreground">IA</strong> a partir dos seus materiais de estudo. Aprenda mais rápido com repetição espaçada.
        </p>

        {/* Buttons */}
        <div className="w-full space-y-3 mt-auto">
          <Button
            size="lg"
            className="w-full text-base font-bold py-6 rounded-2xl uppercase tracking-wider"
            onClick={() => navigate('/auth?mode=login')}
          >
            Entrar
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full text-base font-bold py-6 rounded-2xl uppercase tracking-wider border-2 border-primary text-primary hover:bg-primary/5"
            onClick={() => navigate('/auth?mode=signup')}
          >
            Criar Conta
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
