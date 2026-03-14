import { useState, useRef, useEffect, useMemo } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import BottomNav from '@/components/BottomNav';
import PomodoroFloater from '@/components/PomodoroFloater';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Timer, Play, BookOpen, Brain, Download, FolderPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isOnDashboard = location.pathname === '/dashboard';
  const isInsideSala = isOnDashboard && !!searchParams.get('folder');
  const showNavRoutes = ['/dashboard', '/turmas', '/profile', '/desempenho'];
  const hideNavPatterns = ['/study/', '/exam/', '/lessons/'];
  const showNav = showNavRoutes.some(r => location.pathname === r || location.pathname.startsWith(r + '/'))
    && !hideNavPatterns.some(p => location.pathname.includes(p));
  const { toast } = useToast();

  // Add menu state
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Pomodoro state
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25);
  const [pomodoroBreak, setPomodoroBreak] = useState(5);
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(0);
  const [pomodoroIsBreak, setPomodoroIsBreak] = useState(false);
  const pomodoroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPomodoroSeconds = useRef(0);

  // Listen for events from other components
  useEffect(() => {
    const pomodoroHandler = () => setShowPomodoro(true);
    const addMenuHandler = () => setShowAddMenu(true);
    window.addEventListener('open-pomodoro', pomodoroHandler);
    window.addEventListener('open-add-menu', addMenuHandler);
    return () => {
      window.removeEventListener('open-pomodoro', pomodoroHandler);
      window.removeEventListener('open-add-menu', addMenuHandler);
    };
  }, []);

  const startPomodoro = (forceIsBreak?: boolean) => {
    // Always clear any existing interval first to prevent stacking
    if (pomodoroTimerRef.current) {
      clearInterval(pomodoroTimerRef.current);
      pomodoroTimerRef.current = null;
    }

    const isBreak = forceIsBreak ?? pomodoroIsBreak;
    const totalSecs = (isBreak ? pomodoroBreak : pomodoroMinutes) * 60;
    const endTime = Date.now() + totalSecs * 1000;
    setPomodoroSeconds(totalSecs);
    totalPomodoroSeconds.current = totalSecs;
    setPomodoroActive(true);
    setShowPomodoro(false);

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setPomodoroSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        pomodoroTimerRef.current = null;
        toast({
          title: isBreak ? '☕ Pausa encerrada!' : '🍅 Pomodoro concluído!',
          description: isBreak ? 'Hora de voltar a estudar!' : 'Hora de descansar!',
        });
        const nextIsBreak = !isBreak;
        setPomodoroIsBreak(nextIsBreak);
        setTimeout(() => startPomodoro(nextIsBreak), 500);
      }
    }, 1000);
    pomodoroTimerRef.current = interval;
  };

  const stopPomodoro = () => {
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
    setPomodoroActive(false);
    setPomodoroSeconds(0);
  };

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

      {/* Add menu sheet */}
      <Sheet open={showAddMenu} onOpenChange={setShowAddMenu}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle className="text-base">Adicionar</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 pt-4">
            {/* At dashboard root (not inside a sala): show "Criar Sala" */}
            {isOnDashboard && !isInsideSala && (
              <Button variant="ghost" className="justify-start gap-3 h-12 text-base" onClick={() => { setShowAddMenu(false); navigate('/dashboard?action=create-sala'); }}>
                <FolderPlus className="h-5 w-5 text-primary" /> Criar sala
              </Button>
            )}
            {/* Inside a sala or not on dashboard: show deck actions */}
            {(!isOnDashboard || isInsideSala) && (
              <>
                <Button variant="ghost" className="justify-start gap-3 h-12 text-base" onClick={() => { setShowAddMenu(false); navigate('/dashboard?action=create-deck' + (isInsideSala ? `&folder=${searchParams.get('folder')}` : '')); }}>
                  <BookOpen className="h-5 w-5 text-primary" /> Criar baralho
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-12 text-base" onClick={() => { setShowAddMenu(false); navigate('/dashboard?action=ai-deck' + (isInsideSala ? `&folder=${searchParams.get('folder')}` : '')); }}>
                  <Brain className="h-5 w-5" style={{ color: 'hsl(var(--energy-purple))' }} /> Criar com IA
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-12 text-base" onClick={() => { setShowAddMenu(false); navigate('/dashboard?action=import' + (isInsideSala ? `&folder=${searchParams.get('folder')}` : '')); }}>
                  <Download className="h-5 w-5 text-muted-foreground" /> Importar cartões
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating Pomodoro Timer */}
      {pomodoroActive && (
        <PomodoroFloater
          secondsLeft={pomodoroSeconds}
          totalSeconds={totalPomodoroSeconds.current}
          isBreak={pomodoroIsBreak}
          onStop={stopPomodoro}
        />
      )}

      {/* Pomodoro Config Dialog */}
      <Dialog open={showPomodoro} onOpenChange={setShowPomodoro}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              Pomodoro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Foco (min)</Label>
                <Select value={String(pomodoroMinutes)} onValueChange={v => setPomodoroMinutes(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 20, 25, 30, 45, 50, 60].map(v => (
                      <SelectItem key={v} value={String(v)}>{v} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pausa (min)</Label>
                <Select value={String(pomodoroBreak)} onValueChange={v => setPomodoroBreak(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 5, 10, 15].map(v => (
                      <SelectItem key={v} value={String(v)}>{v} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={() => startPomodoro()}>
              <Play className="h-4 w-4" /> Iniciar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProtectedRoute;
