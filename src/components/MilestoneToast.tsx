/**
 * MilestoneToast — In-session celebration every N cards.
 * Shows briefly then auto-dismisses. Pure visual feedback.
 */
import { useEffect, useState } from 'react';
import { Flame, Trophy, Zap, Star } from 'lucide-react';

interface MilestoneToastProps {
  reviewCount: number;
  correctCount: number;
  /** Interval between milestones */
  interval?: number;
}

const MILESTONES = [
  { icon: Flame, color: 'text-orange-500', messages: ['Bom começo! 🔥', 'Aquecendo! 🔥'] },
  { icon: Zap, color: 'text-yellow-500', messages: ['Ritmo forte! ⚡', 'Mandando bem! ⚡'] },
  { icon: Trophy, color: 'text-primary', messages: ['Impressionante! 🏆', 'Concentração máxima! 🏆'] },
  { icon: Star, color: 'text-primary', messages: ['Lendário! ⭐', 'Máquina de estudar! ⭐'] },
];

const MilestoneToast = ({ reviewCount, correctCount, interval = 25 }: MilestoneToastProps) => {
  const [visible, setVisible] = useState(false);
  const [milestone, setMilestone] = useState<{ count: number; accuracy: number; idx: number } | null>(null);

  useEffect(() => {
    if (reviewCount > 0 && reviewCount % interval === 0) {
      const accuracy = reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : 0;
      const idx = Math.min(Math.floor(reviewCount / interval) - 1, MILESTONES.length - 1);
      setMilestone({ count: reviewCount, accuracy, idx });
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [reviewCount, correctCount, interval]);

  if (!visible || !milestone) return null;

  const m = MILESTONES[milestone.idx];
  const Icon = m.icon;
  const msg = m.messages[Math.floor(Math.random() * m.messages.length)];

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-5 py-3 shadow-lg">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ${m.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{msg}</p>
          <p className="text-[11px] text-muted-foreground">
            {milestone.count} cards · {milestone.accuracy}% acerto
          </p>
        </div>
      </div>
    </div>
  );
};

export default MilestoneToast;
