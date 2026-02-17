import { useNavigate } from 'react-router-dom';
import { useMissions, type MissionWithProgress } from '@/hooks/useMissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import {
  ArrowLeft, BookOpen, Clock, Flame, Zap, Brain, Sparkles,
  Trophy, Award, Crown, Star, Gift, Check, GraduationCap,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  'book-open': BookOpen,
  'clock': Clock,
  'flame': Flame,
  'zap': Zap,
  'brain': Brain,
  'sparkles': Sparkles,
  'trophy': Trophy,
  'award': Award,
  'crown': Crown,
  'star': Star,
};

const MissionCard = ({ mission, onClaim }: { mission: MissionWithProgress; onClaim: () => void }) => {
  const Icon = ICON_MAP[mission.icon] || Star;
  const pct = mission.target_value > 0 ? Math.round((mission.currentProgress / mission.target_value) * 100) : 0;
  const canClaim = mission.isCompleted && !mission.isClaimed;

  return (
    <div className={`rounded-xl border p-3.5 flex items-center gap-3 transition-all ${
      mission.isClaimed 
        ? 'border-border/30 bg-muted/20 opacity-60' 
        : canClaim 
          ? 'border-primary/40 bg-primary/5 shadow-sm' 
          : 'border-border/50 bg-card'
    }`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        mission.isClaimed ? 'bg-muted' : canClaim ? 'bg-primary/15' : 'bg-muted/60'
      }`}>
        {mission.isClaimed ? (
          <Check className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Icon className={`h-5 w-5 ${canClaim ? 'text-primary' : 'text-muted-foreground'}`} />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate ${mission.isClaimed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {mission.title}
          </span>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-5 shrink-0 gap-0.5">
            <Brain className="h-2.5 w-2.5" />
            +{mission.reward_credits}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {mission.currentProgress}/{mission.target_value}
          </span>
        </div>
      </div>

      {canClaim && (
        <Button size="sm" onClick={onClaim} className="shrink-0 h-8 px-3 gap-1 text-xs">
          <Gift className="h-3.5 w-3.5" /> Resgatar
        </Button>
      )}
    </div>
  );
};

const Missions = () => {
  const navigate = useNavigate();
  const { missions, isLoading, claimReward } = useMissions();

  const dailyMissions = missions.filter(m => m.category === 'daily');
  const weeklyMissions = missions.filter(m => m.category === 'weekly');
  const achievements = missions.filter(m => m.category === 'achievement');

  const totalClaimable = missions.filter(m => m.isCompleted && !m.isClaimed).reduce((s, m) => s + m.reward_credits, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                Missões
              </h1>
              <p className="text-xs text-muted-foreground">Complete missões e ganhe créditos IA</p>
            </div>
          </div>
          {totalClaimable > 0 && (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/20" variant="outline">
              <Brain className="h-3 w-3" /> +{totalClaimable} disponíveis
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-2xl space-y-5">
        

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Daily */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-bold text-foreground">Missões Diárias</h2>
                <span className="text-[10px] text-muted-foreground">Renovam todo dia</span>
              </div>
              {dailyMissions.map(m => (
                <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />
              ))}
            </section>

            {/* Weekly */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Missões Semanais</h2>
                <span className="text-[10px] text-muted-foreground">Renovam toda segunda</span>
              </div>
              {weeklyMissions.map(m => (
                <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />
              ))}
            </section>

            {/* Achievements */}
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-bold text-foreground">Conquistas</h2>
                <span className="text-[10px] text-muted-foreground">Completar uma vez</span>
              </div>
              {achievements.map(m => (
                <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Missions;
