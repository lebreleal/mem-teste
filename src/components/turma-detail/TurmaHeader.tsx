/**
 * Global header for TurmaDetail — streak, credits, theme, notifications, menu.
 */

import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useTheme } from '@/hooks/useTheme';
import { useExamNotifications } from '@/hooks/useExamNotifications';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Flame, Brain, Timer, Moon, Sun, Bell, Menu, BookOpen, UserCircle, Lightbulb, LogOut, FileText, X,
} from 'lucide-react';
import CreditsDialog from '@/components/CreditsDialog';

const TurmaHeader = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { energy } = useEnergy();
  const { data: studyStats } = useStudyStats();
  const { theme, toggleTheme } = useTheme();
  const { notifications, hasUnread, markRead } = useExamNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const streak = studyStats?.streak ?? 0;
  const hasStreak = streak > 0;
  const isIntense = streak >= 3;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/activity?tab=streak')} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50">
              <Flame className={`h-4 w-4 transition-colors ${hasStreak ? 'text-warning' : 'text-muted-foreground/40'}`} strokeWidth={isIntense ? 2.5 : 2}
                style={hasStreak ? { filter: isIntense ? 'drop-shadow(0 0 4px hsl(var(--warning) / 0.5))' : 'drop-shadow(0 0 2px hsl(var(--warning) / 0.3))' } : undefined} />
              <span className="text-xs font-bold tabular-nums text-foreground">{streak}</span>
            </button>
            <button onClick={() => setCreditsOpen(true)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50">
              <Brain className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple, 270 70% 60%))' }} />
              <span className="text-xs font-bold tabular-nums text-foreground">{energy}</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('open-pomodoro'))} className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <Timer className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <DropdownMenu open={notifOpen} onOpenChange={v => { setNotifOpen(v); if (v) markRead(); }}>
              <DropdownMenuTrigger asChild>
                <button className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Bell className="h-4 w-4" />
                  {hasUnread && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="px-3 py-2 border-b border-border/50"><p className="text-sm font-semibold text-foreground">Notificações</p></div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
                ) : notifications.map(n => (
                  <DropdownMenuItem key={n.id} className="flex items-start gap-3 px-3 py-3 cursor-pointer" onClick={() => { if (n.status === 'ready' && n.examId) navigate(`/exam/${n.examId}`); }}>
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.status === 'ready' ? 'bg-success/15' : n.status === 'error' ? 'bg-destructive/15' : 'bg-primary/15'}`}>
                      {n.status === 'generating' ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : n.status === 'ready' ? <FileText className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.status === 'generating' ? 'Gerando...' : n.status === 'ready' ? 'Pronta!' : 'Erro'}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Menu className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2 border-b border-border/50"><p className="text-sm font-medium text-foreground truncate">{user?.email}</p></div>
                <DropdownMenuItem onClick={() => navigate('/dashboard')}><BookOpen className="mr-2 h-4 w-4" /> Meus Baralhos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/profile')}><UserCircle className="mr-2 h-4 w-4" /> Perfil</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/feedback')}><Lightbulb className="mr-2 h-4 w-4" /> Sugerir Melhorias</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={signOut}><LogOut className="mr-2 h-4 w-4" /> Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <CreditsDialog open={creditsOpen} onOpenChange={setCreditsOpen} />
    </>
  );
};

export default TurmaHeader;
