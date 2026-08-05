/**
 * Dashboard header — avatar, streak, notifications, theme toggle, menu.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useStudyStats } from '@/hooks/useStudyStats';

import { useAICredits } from '@/hooks/useAICredits';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Flame, Timer, Crown, Bell, Menu, Moon, Sun, LogOut, UserCircle,
  FileText, X, BarChart3, User,
} from 'lucide-react';
import { formatCredits } from '@/lib/creditsFormat';


interface DashboardHeaderProps {
  onCreditsOpen: () => void;
}

const DashboardHeader = ({ onCreditsOpen }: DashboardHeaderProps) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { credits } = useAICredits();
  const { data: studyStats } = useStudyStats();
  const streak = studyStats?.streak ?? 0;
  const hasStreak = streak > 0;
  const isIntense = streak >= 3;

  const [notifOpen, setNotifOpen] = useState(false);

  // Avatar URL from user metadata
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Profile avatar */}
          <button
            onClick={() => navigate('/profile')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden ring-2 ring-border/50 hover:ring-primary/50 transition-all"
            aria-label="Perfil"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* Streak */}
          <button onClick={() => navigate('/activity?tab=streak')} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50">
            <Flame className={`h-4 w-4 transition-colors ${hasStreak ? 'text-warning fill-warning' : 'text-muted-foreground/30'}`} strokeWidth={isIntense ? 2.5 : 2}
              style={hasStreak ? { filter: isIntense ? 'drop-shadow(0 0 4px hsl(var(--warning) / 0.5))' : 'drop-shadow(0 0 2px hsl(var(--warning) / 0.3))' } : undefined} />
            <span className="text-xs font-bold tabular-nums text-foreground">{streak}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onCreditsOpen}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 hover:bg-muted transition-colors"
            aria-label="Créditos IA"
          >
            <Crown
              className="h-4 w-4 text-warning"
              fill="hsl(var(--warning))"
              style={{ filter: 'drop-shadow(0 0 3px hsl(var(--warning) / 0.4))' }}
            />
            <span className="text-xs font-bold tabular-nums text-foreground">{formatCredits(credits)}</span>
          </button>
          <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Alternar tema">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Hamburger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Menu className="h-4 w-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2 border-b border-border/50"><p className="text-sm font-medium text-foreground truncate">{user?.email}</p></div>
              <DropdownMenuItem onClick={() => navigate('/profile')}><UserCircle className="mr-2 h-4 w-4" /> Perfil</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/desempenho')}><BarChart3 className="mr-2 h-4 w-4" /> Desempenho</DropdownMenuItem>
              <DropdownMenuItem onClick={onCreditsOpen}><Crown className="mr-2 h-4 w-4" /> Créditos IA ({formatCredits(credits)})</DropdownMenuItem>

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
