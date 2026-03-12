/**
 * Dashboard header — streak, energy, notifications, theme toggle, menu.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useEnergy } from '@/hooks/useEnergy';
import { useSubscription } from '@/hooks/useSubscription';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useExamNotifications } from '@/hooks/useExamNotifications';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Brain, Flame, Timer, Crown, Bell, Menu, Moon, Sun, LogOut, UserCircle,
  Lightbulb, FileText, X, BrainCircuit,
} from 'lucide-react';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';

interface DashboardHeaderProps {
  onCreditsOpen: () => void;
  onPremiumOpen: () => void;
}

const DashboardHeader = ({ onCreditsOpen, onPremiumOpen }: DashboardHeaderProps) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isPremium, isTrial } = useSubscription();
  const { energy } = useEnergy();
  const { data: studyStats } = useStudyStats();
  const streak = studyStats?.streak ?? 0;
  const hasStreak = streak > 0;
  const isIntense = streak >= 3;

  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, hasUnread, markRead } = useExamNotifications();
  const { dueConcepts } = useGlobalConcepts();
  const dueConceptCount = dueConcepts.length;

  // Crown: gold when any premium is active (including trial)
  const showCrownActive = isPremium;

  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/activity?tab=streak')} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50">
            <Flame className={`h-4 w-4 transition-colors ${hasStreak ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} strokeWidth={isIntense ? 2.5 : 2}
              style={hasStreak ? { filter: isIntense ? 'drop-shadow(0 0 4px hsl(var(--warning) / 0.5))' : 'drop-shadow(0 0 2px hsl(var(--warning) / 0.3))' } : undefined} />
            <span className="text-xs font-bold tabular-nums text-foreground">{streak}</span>
          </button>
          <button onClick={onCreditsOpen} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50">
            <Brain className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple, 270 70% 60%))' }} />
            <span className="text-xs font-bold tabular-nums text-foreground">{energy}</span>
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-pomodoro'))} className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Timer className="h-4 w-4" />
          </button>
          {dueConceptCount > 0 && (
            <button
              onClick={() => navigate('/conceitos')}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50 bg-primary/10"
            >
              <BrainCircuit className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold tabular-nums text-primary">{dueConceptCount}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onPremiumOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Premium"
          >
            <Crown
              className={`h-4 w-4 transition-colors ${showCrownActive ? 'text-warning' : 'text-muted-foreground/40'}`}
              fill={showCrownActive ? 'hsl(var(--warning))' : 'none'}
              style={showCrownActive ? { filter: 'drop-shadow(0 0 3px hsl(var(--warning) / 0.4))' } : undefined}
            />
          </button>
          <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Alternar tema">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Notifications */}
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
                    <p className="text-xs text-muted-foreground">{n.status === 'generating' ? 'Gerando...' : n.status === 'ready' ? 'Pronta! Toque para iniciar' : 'Erro ao gerar'}</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Hamburger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Menu className="h-4 w-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2 border-b border-border/50"><p className="text-sm font-medium text-foreground truncate">{user?.email}</p></div>
              <DropdownMenuItem onClick={() => navigate('/profile')}><UserCircle className="mr-2 h-4 w-4" /> Perfil</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/feedback')}><Lightbulb className="mr-2 h-4 w-4" /> Sugerir Melhorias</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={signOut}><LogOut className="mr-2 h-4 w-4" /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
