/**
 * StatsPage — Slim orchestrator (~100 lines).
 * Logic extracted per Lei 2B into:
 *   - useStatsData (hook)
 *   - StatsOverview, HeatmapChart, ReviewChart, RetentionChart, RankingSection
 */

import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useStatsData } from '@/hooks/useStatsData';
import StatsOverview from '@/components/stats/StatsOverview';
import HeatmapChart from '@/components/stats/HeatmapChart';
import ReviewChart from '@/components/stats/ReviewChart';
import RetentionChart from '@/components/stats/RetentionChart';
import RankingSection from '@/components/stats/RankingSection';

const StatsPage = () => {
  const navigate = useNavigate();
  const data = useStatsData();

  if (data.isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4 pb-24">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!data.stats) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3">
          <h1 className="text-lg font-bold font-display">Desempenho</h1>
        </div>
        <div className="p-4 text-center text-muted-foreground mt-10">
          <p className="text-sm">Nenhum dado disponível ainda.</p>
          <p className="text-xs mt-1">Comece a estudar para ver suas estatísticas!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3">
        <h1 className="text-lg font-bold font-display">Desempenho</h1>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {/* ═══ VISÃO GERAL ═══ */}
        <StatsOverview
          currentStreak={data.currentStreak}
          todayCards={data.todayCards}
          todayMinutes={data.todayMinutes}
          streakInfoOpen={data.streakInfoOpen}
          setStreakInfoOpen={data.setStreakInfoOpen}
          todayCardsInfoOpen={data.todayCardsInfoOpen}
          setTodayCardsInfoOpen={data.setTodayCardsInfoOpen}
          todayTimeInfoOpen={data.todayTimeInfoOpen}
          setTodayTimeInfoOpen={data.setTodayTimeInfoOpen}
          summaryFilter={data.summaryFilter}
          summaryStats={data.summaryStats}
        />

        {/* ═══ ATIVIDADE & VOLUME ═══ */}
        <HeatmapChart heatmapData={data.heatmapData} />

        <ReviewChart
          reviewsPerDayFilter={data.reviewsPerDayFilter}
          reviewsPerDayChartData={data.reviewsPerDayChartData}
          hoursFilter={data.hoursFilter}
          hoursStats={data.hoursStats}
          hoursChartData={data.hoursChartData}
          hourlyChartData={data.hourlyChartData}
          avgTimePerCardData={data.avgTimePerCardData}
          addedVsReviewedFilter={data.addedVsReviewedFilter}
          addedVsReviewedData={data.addedVsReviewedData}
          stats={data.stats}
          intervalBuckets={data.intervalBuckets}
          stabilityBuckets={data.stabilityBuckets}
          difficultyBuckets={data.difficultyBuckets}
          retrievabilityBuckets={data.retrievabilityBuckets}
          intervalPercentiles={data.intervalPercentiles}
          estimatedKnowledge={data.estimatedKnowledge}
        />

        {/* ═══ RETENÇÃO & ACERTO ═══ */}
        <RetentionChart
          stats={data.stats}
          retentionChartData={data.retentionChartData}
        />

        {/* ═══ SOCIAL ═══ */}
        <RankingSection
          user={data.user}
          sortedRanking={data.sortedRanking}
          rankingLoading={data.rankingLoading}
          rankingSort={data.rankingSort}
          setRankingSort={data.setRankingSort}
          rankingConfigOpen={data.rankingConfigOpen}
          setRankingConfigOpen={data.setRankingConfigOpen}
          isPublic={data.isPublic}
          togglePublic={data.togglePublic}
          getRankValue={data.getRankValue}
          onNavigateForecast={() => navigate('/plano')}
        />
      </div>
    </div>
  );
};

export default StatsPage;
