import { useMemo } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { PieChart, PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { CATEGORY_COLORS } from './helpers';

interface CategoryDonutChartProps {
  concepts: GlobalConcept[];
  onCategoryClick: (category: string | null) => void;
}

const CategoryDonutChart = ({ concepts, onCategoryClick }: CategoryDonutChartProps) => {
  const categoryData = useMemo(() => {
    const catMap = new Map<string, { total: number; mastered: number }>();
    for (const c of concepts) {
      const cat = c.category || 'Sem categoria';
      const entry = catMap.get(cat) ?? { total: 0, mastered: 0 };
      entry.total++;
      if (c.state === 2) entry.mastered++;
      catMap.set(cat, entry);
    }
    return Array.from(catMap.entries())
      .map(([name, { total, mastered }]) => ({
        name,
        value: total,
        mastered,
        pct: Math.round((mastered / total) * 100),
      }))
      .sort((a, b) => b.value - a.value);
  }, [concepts]);

  if (categoryData.length === 0) return null;

  const totalMastered = concepts.filter(c => c.state === 2).length;
  const totalPct = concepts.length > 0 ? Math.round((totalMastered / concepts.length) * 100) : 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <PieChartIcon className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">Progresso por Área</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={42}
                dataKey="value"
                stroke="none"
                onClick={(_, idx) => onCategoryClick(categoryData[idx]?.name === 'Sem categoria' ? null : categoryData[idx]?.name)}
                style={{ cursor: 'pointer' }}
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} opacity={0.85} />
                ))}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-foreground">{totalPct}%</span>
          </div>
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          {categoryData.slice(0, 5).map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => onCategoryClick(cat.name === 'Sem categoria' ? null : cat.name)}
              className="flex items-center gap-1.5 w-full text-left hover:bg-accent/30 rounded px-1 py-0.5 transition-colors"
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
              <span className="text-[10px] text-muted-foreground truncate flex-1">{cat.name}</span>
              <span className="text-[10px] font-medium text-foreground">{cat.pct}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CategoryDonutChart;
