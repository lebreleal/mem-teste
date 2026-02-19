import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import MemoCardsLogo from '@/components/MemoCardsLogo';
import { Zap, BookOpen, Trophy, Users } from 'lucide-react';



const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
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
    <div className="flex min-h-screen flex-col bg-background overflow-hidden">
      {/* Hero Section */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-16 md:py-24 text-center">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-10 left-10 w-24 h-24 md:w-40 md:h-40 rounded-full bg-primary/10 animate-pulse" />
          <div className="absolute bottom-20 right-16 w-32 h-32 md:w-56 md:h-56 rounded-full bg-accent/30 animate-pulse delay-700" />
          <div className="absolute top-1/3 right-10 w-16 h-16 md:w-28 md:h-28 rounded-full bg-warning/10 animate-pulse delay-1000" />
        </div>

        {/* Mascot */}
        <div className="relative mb-6 md:mb-10">
          <MemoCardsLogo size={120} className="md:hidden" />
          <MemoCardsLogo size={160} className="hidden md:block" />
        </div>

        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-foreground leading-tight max-w-xl md:max-w-3xl">
          Aprenda com
          <span className="text-primary block">superpoderes</span>
        </h1>

        <p className="mt-4 md:mt-6 text-lg md:text-xl text-muted-foreground max-w-md md:max-w-lg leading-relaxed">
          Repetição espaçada + gamificação. Memorize qualquer coisa de forma divertida e eficiente.
        </p>

        <div className="mt-8 md:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-sm sm:max-w-lg">
          <Button
            size="lg"
            className="w-full text-lg md:text-xl font-bold py-6 md:py-7 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => navigate('/auth')}
          >
            Começar agora — é grátis
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full text-lg md:text-xl font-bold py-6 md:py-7 rounded-2xl border-2 hover:bg-accent transition-all"
            onClick={() => navigate('/auth')}
          >
            Já tenho conta
          </Button>
        </div>
      </section>

      {/* Features strip */}
      <section className="border-t border-border bg-card py-12 md:py-16 px-4">
        <div className="mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-6 md:gap-10">
          {[
            { icon: Zap, label: 'Créditos IA', desc: 'Ganhe recompensas estudando' },
            { icon: BookOpen, label: 'Repetição Espaçada', desc: 'Algoritmo SM-2 & FSRS' },
            { icon: Trophy, label: 'Gamificação', desc: 'Rankings e conquistas' },
            { icon: Users, label: 'Turmas', desc: 'Estude com amigos' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col items-center text-center gap-2 md:gap-3">
              <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
              <h3 className="font-bold text-sm md:text-base text-foreground">{label}</h3>
              <p className="text-xs md:text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center text-xs md:text-sm text-muted-foreground border-t border-border">
        Memo Cards © {new Date().getFullYear()} · Aprenda com superpoderes 🐘
      </footer>
    </div>
  );
};

export default Index;
