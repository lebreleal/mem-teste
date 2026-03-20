/**
 * RankingSection — Global ranking + config dialog.
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Users, Settings2, ChevronRight, Calendar } from 'lucide-react';
import { SectionTitle, RankMedal, rankingSortOptions } from './StatsShared';
import type { RankingEntry } from '@/hooks/useRanking';
import type { UseMutationResult } from '@tanstack/react-query';

interface RankingSectionProps {
  user: { id: string } | null;
  sortedRanking: RankingEntry[];
  rankingLoading: boolean;
  rankingSort: 'cards' | 'hours' | 'streak';
  setRankingSort: (v: 'cards' | 'hours' | 'streak') => void;
  rankingConfigOpen: boolean;
  setRankingConfigOpen: (v: boolean) => void;
  isPublic: boolean;
  togglePublic: UseMutationResult<void, Error, boolean>;
  getRankValue: (entry: RankingEntry) => string;
  onNavigateForecast: () => void;
}

const RankingSection = ({
  user, sortedRanking, rankingLoading, rankingSort, setRankingSort,
  rankingConfigOpen, setRankingConfigOpen, isPublic, togglePublic,
  getRankValue, onNavigateForecast,
}: RankingSectionProps) => {
  const myRank = sortedRanking?.findIndex(r => r.user_id === user?.id);
  const myRankEntry = myRank !== undefined && myRank >= 0 ? sortedRanking![myRank] : null;

  return (
    <>
      {/* 15. Ranking Global */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="p-4 pb-2 flex items-center justify-between">
          <SectionTitle title="Ranking Global" info="Usuários participantes do ranking, ordenados pelos últimos 30 dias." />
          <button onClick={() => setRankingConfigOpen(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-3 flex gap-2">
          {rankingSortOptions.map(opt => {
            const Icon = opt.icon;
            const active = rankingSort === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setRankingSort(opt.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-3 w-3" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {rankingLoading ? (
          <div className="px-4 pb-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !sortedRanking || sortedRanking.length === 0 ? (
          <div className="px-4 pb-4 text-center py-6">
            <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum participante ainda</p>
          </div>
        ) : (
          <div className="border-t border-border/40 pb-1">
            {sortedRanking.slice(0, 3).map((entry, i) => {
              const isMe = entry.user_id === user?.id;
              const pos = i + 1;
              return (
                <div
                  key={entry.user_id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-b-0',
                    isMe && 'bg-primary/5',
                  )}
                >
                  <RankMedal position={pos} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm truncate', isMe ? 'font-semibold text-primary' : 'font-medium')}>
                      {entry.user_name || 'Usuário'}
                      {isMe && <span className="text-[10px] text-muted-foreground ml-1">(você)</span>}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums font-bold text-foreground">
                    {getRankValue(entry)}
                  </span>
                </div>
              );
            })}
            {myRankEntry && myRank !== undefined && myRank >= 3 && (
              <>
                <div className="px-4 py-1.5 text-center">
                  <span className="text-[10px] text-muted-foreground">•••</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-t border-border/20">
                  <div className="flex h-7 w-7 items-center justify-center">
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">{myRank + 1}º</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-semibold text-primary">
                      {myRankEntry.user_name || 'Usuário'}
                      <span className="text-[10px] text-muted-foreground ml-1">(você)</span>
                    </p>
                  </div>
                  <span className="text-xs tabular-nums font-bold text-foreground">
                    {getRankValue(myRankEntry)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Ranking config dialog */}
      <Dialog open={rankingConfigOpen} onOpenChange={setRankingConfigOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Configurações do Ranking
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Participar do ranking global</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {isPublic ? 'Seu nome aparece no ranking' : 'Ative para participar'}
                </p>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={(checked) => togglePublic.mutate(checked)}
                disabled={togglePublic.isPending}
              />
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Ao participar, seu nome e estatísticas de estudo dos últimos 30 dias ficam visíveis para outros usuários no ranking.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 16. Carga Prevista — link to /plano */}
      <Card className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors" onClick={onNavigateForecast}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Carga Prevista</p>
            <p className="text-[10px] text-muted-foreground">Veja a previsão de revisões dos próximos dias</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Card>
    </>
  );
};

export default RankingSection;
