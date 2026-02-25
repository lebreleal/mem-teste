import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMissions, useXPLeaderboard, type MissionWithProgress } from '@/hooks/useMissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  ArrowLeft, BookOpen, Clock, Flame, Zap, Brain, Sparkles,
  Trophy, Award, Crown, Star, Gift, Check, GraduationCap, Users, Medal,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  'book-open': BookOpen, clock: Clock, flame: Flame, zap: Zap,
  brain: Brain, sparkles: Sparkles, trophy: Trophy, award: Award,
  crown: Crown, star: Star,
};

const MissionCard = ({ mission, onClaim }: { mission: MissionWithProgress; onClaim: () => void }) => {
  const Icon = ICON_MAP[mission.icon] || Star;
  const pct = mission.target_value > 0 ? Math.round((mission.currentProgress / mission.target_value) * 100) : 0;
  const canClaim = mission.isCompleted && !mission.isClaimed;

  return (
    <div className={`rounded-xl border p-3.5 flex items-center gap-3 transition-all ${
      mission.isClaimed ? 'border-border/30 bg-muted/20 opacity-60'
        : canClaim ? 'border-primary/40 bg-primary/5 shadow-sm'
        : 'border-border/50 bg-card'
    }`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        mission.isClaimed ? 'bg-muted' : canClaim ? 'bg-primary/15' : 'bg-muted/60'
      }`}>
        {mission.isClaimed ? <Check className="h-5 w-5 text-muted-foreground" /> : <Icon className={`h-5 w-5 ${canClaim ? 'text-primary' : 'text-muted-foreground'}`} />}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate ${mission.isClaimed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{mission.title}</span>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-5 shrink-0 gap-0.5"><Brain className="h-2.5 w-2.5" />+{mission.reward_credits}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{mission.description}</p>
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{mission.currentProgress}/{mission.target_value}</span>
        </div>
      </div>
      {canClaim && (
        <Button size="sm" onClick={onClaim} className="shrink-0 h-8 px-3 gap-1 text-xs"><Gift className="h-3.5 w-3.5" /> Resgatar</Button>
      )}
    </div>
  );
};

const RANK_ICONS = [Crown, Medal, Award];

const Missions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { missions, isLoading, claimReward } = useMissions();
  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useXPLeaderboard();

  const dailyMissions = missions.filter(m => m.category === 'daily');
  const weeklyMissions = missions.filter(m => m.category === 'weekly');
  const achievements = missions.filter(m => m.category === 'achievement' && !['suggestions_made', 'suggestions_accepted'].includes(m.target_type));
  const communityMissions = missions.filter(m => ['suggestions_made', 'suggestions_accepted'].includes(m.target_type));

  const totalClaimable = missions.filter(m => m.isCompleted && !m.isClaimed).reduce((s, m) => s + m.reward_credits, 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" />Missões</h1>
              <p className="text-xs text-muted-foreground">Complete missões e ganhe créditos IA</p>
            </div>
          </div>
          {totalClaimable > 0 && (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/20" variant="outline"><Brain className="h-3 w-3" /> +{totalClaimable} disponíveis</Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-2xl">
        <Tabs defaultValue="missions" className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="missions" className="flex-1">Missões</TabsTrigger>
            <TabsTrigger value="rankings" className="flex-1 gap-1.5"><Trophy className="h-3.5 w-3.5" />Rankings</TabsTrigger>
          </TabsList>

          <TabsContent value="missions" className="space-y-5">
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
                  {dailyMissions.map(m => <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />)}
                </section>

                {/* Weekly */}
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-bold text-foreground">Missões Semanais</h2>
                    <span className="text-[10px] text-muted-foreground">Renovam toda segunda</span>
                  </div>
                  {weeklyMissions.map(m => <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />)}
                </section>

                {/* Community Missions */}
                {communityMissions.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-bold text-foreground">Missões da Comunidade</h2>
                      <span className="text-[10px] text-muted-foreground">Contribua com Decks Vivos</span>
                    </div>
                    {communityMissions.map(m => <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />)}
                  </section>
                )}

                {/* Achievements */}
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-warning" />
                    <h2 className="text-sm font-bold text-foreground">Conquistas</h2>
                    <span className="text-[10px] text-muted-foreground">Completar uma vez</span>
                  </div>
                  {achievements.map(m => <MissionCard key={m.id} mission={m} onClaim={() => claimReward.mutate(m)} />)}
                </section>
              </>
            )}
          </TabsContent>

          <TabsContent value="rankings" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">Ranking de XP</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Últimos 30 dias · XP = revisões + contribuições aceitas (×50)</p>

                {loadingLeaderboard ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado ainda</p>
                ) : (
                  <div className="space-y-1.5">
                    {leaderboard.map((entry, idx) => {
                      const isMe = entry.user_id === user?.id;
                      const RankIcon = idx < 3 ? RANK_ICONS[idx] : null;
                      return (
                        <div key={entry.user_id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isMe ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}>
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                            {RankIcon ? (
                              <RankIcon className={`h-5 w-5 ${idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : 'text-amber-700'}`} />
                            ) : (
                              <span className="text-xs font-bold text-muted-foreground">{idx + 1}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isMe ? 'text-primary' : 'text-foreground'}`}>
                              {entry.user_name} {isMe && <span className="text-[10px] text-muted-foreground">(você)</span>}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {entry.reviews} revisões · {entry.contributions} contribuições
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs font-bold tabular-nums">{entry.xp.toLocaleString()} XP</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Missions;
