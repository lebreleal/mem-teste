import { useState, useRef, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import BottomNav from '@/components/BottomNav';
import PomodoroFloater from '@/components/PomodoroFloater';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Timer, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const showNavRoutes = ['/dashboard', '/ia', '/profile', '/turmas'];
  const hideNavPatterns = ['/study/', '/exam/', '/lessons/'];
  const showNav = showNavRoutes.some(r => location.pathname === r || location.pathname.startsWith(r + '/'))
    && !hideNavPatterns.some(p => location.pathname.includes(p));
  const { toast } = useToast();

  // Pomodoro state
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25);
  const [pomodoroBreak, setPomodoroBreak] = useState(5);
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(0);
  const [pomodoroIsBreak, setPomodoroIsBreak] = useState(false);
  const pomodoroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPomodoroSeconds = useRef(0);

  // Listen for open-pomodoro event from other components
  useEffect(() => {
    const handler = () => setShowPomodoro(true);
    window.addEventListener('open-pomodoro', handler);
    return () => window.removeEventListener('open-pomodoro', handler);
  }, []);

  const startPomodoro = () => {
    const totalSecs = (pomodoroIsBreak ? pomodoroBreak : pomodoroMinutes) * 60;
    setPomodoroSeconds(totalSecs);
    totalPomodoroSeconds.current = totalSecs;
    setPomodoroActive(true);
    setShowPomodoro(false);

    const interval = setInterval(() => {
      setPomodoroSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setPomodoroActive(false);
          toast({
            title: pomodoroIsBreak ? '☕ Pausa encerrada!' : '🍅 Pomodoro concluído!',
            description: pomodoroIsBreak ? 'Hora de voltar a estudar!' : 'Hora de descansar!',
          });
          setPomodoroIsBreak(prev => !prev);
          return 0;
        }
        return prev - 1;
      });
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

  return (
    <>
      <div className={showNav ? 'pb-20' : ''}>
        {children}
      </div>

      {showNav && <BottomNav />}

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
            <Button className="w-full gap-2" onClick={startPomodoro}>
              <Play className="h-4 w-4" /> Iniciar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProtectedRoute;
