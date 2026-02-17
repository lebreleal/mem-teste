import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useWallet, useCreatorTier } from '@/hooks/useWallet';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, Check, CircleDot, Crown, Star, Sprout, ArrowRight } from 'lucide-react';

const tierConfig: Record<number, { icon: React.ReactNode; name: string; badge: string; bgClass: string; ringClass: string }> = {
  1: { icon: <Sprout className="h-6 w-6 text-muted-foreground" />, name: 'Iniciante', badge: '🌱', bgClass: 'tier-1-bg', ringClass: 'ring-border/30' },
  2: { icon: <Star className="h-6 w-6 text-warning" />, name: 'Confiável', badge: '⭐', bgClass: 'tier-2-bg', ringClass: 'ring-warning/20' },
  3: { icon: <Crown className="h-6 w-6 text-primary" />, name: 'Mestre', badge: '👑', bgClass: 'tier-3-bg', ringClass: 'ring-primary/20' },
};

const feeSteps = [
  { tier: 1, fee: '20%', label: 'Iniciante 🌱', active: false },
  { tier: 2, fee: '15%', label: 'Confiável ⭐', active: false },
  { tier: 3, fee: '10%', label: 'Mestre 👑', active: false },
];

const MemoGrana = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { data: tierData, isLoading: tierLoading } = useCreatorTier();

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, adminLoading, navigate]);

  const isLoading = walletLoading || tierLoading;
  const currentTier = tierData?.tier ?? 1;
  const tc = tierConfig[currentTier];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Wallet className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl font-bold text-foreground">Carteira</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-5 max-w-lg">
        {isLoading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : (
          <>
            {/* Balance Card */}
            <div
              className="card-premium border border-border/40 bg-card p-6 text-center relative overflow-hidden"
              style={{ borderRadius: 'var(--radius)' }}
            >
              <div className="absolute inset-0 animate-shimmer opacity-40" />
               <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Saldo Disponível</p>
               <p className="text-4xl font-bold text-foreground tabular-nums relative">
                 🪙 {(wallet?.balance ?? 0).toFixed(0)} <span className="text-lg text-muted-foreground">MC</span>
               </p>
            </div>

            {/* Creator Tier Visual */}
            {tierData && (
              <div
                className={`card-premium ${tc.bgClass} border border-border/40 p-5 ring-1 ${tc.ringClass}`}
                style={{ borderRadius: 'var(--radius)' }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card/80 ring-1 ring-border/30"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                  >
                    <span className="text-3xl">{tc.badge}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-display text-lg font-bold text-foreground">{tierData.tierName}</p>
                    <p className="text-xs text-muted-foreground">Taxa do Marketplace: <span className="font-bold text-foreground">{(tierData.fee * 100).toFixed(0)}%</span></p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { value: tierData.totalListings, label: 'Decks', icon: '📦' },
                    { value: tierData.avgRating.toFixed(1), label: 'Avaliação', icon: '⭐' },
                    { value: tierData.totalSales, label: 'Vendas', icon: '💰' },
                  ].map(s => (
                    <div key={s.label} className="text-center rounded-xl bg-card/60 p-3 ring-1 ring-border/20">
                      <p className="text-[10px] mb-0.5">{s.icon}</p>
                      <p className="text-lg font-bold text-foreground tabular-nums">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Next level checklist */}
                {tierData.nextTierProgress.length > 0 && (
                  <div className="rounded-xl bg-card/60 p-4 ring-1 ring-border/20 space-y-3">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-primary" />
                      <p className="text-xs font-bold text-foreground uppercase tracking-wider">Próximo Nível</p>
                    </div>
                    {tierData.nextTierProgress.map(p => {
                      const done = p.current >= p.required;
                      return (
                        <div key={p.label} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            {done ? (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                              <CircleDot className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1 flex justify-between items-center">
                              <span className={`text-xs ${done ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{p.label}</span>
                              <span className={`text-xs font-bold tabular-nums ${done ? 'text-primary' : 'text-foreground'}`}>{p.current}/{p.required}</span>
                            </div>
                          </div>
                          <Progress value={Math.min(100, (p.current / p.required) * 100)} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Fee Impact Card */}
            <div
              className="card-premium border border-border/40 bg-card p-5"
              style={{ borderRadius: 'var(--radius)' }}
            >
              <h3 className="font-display text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                💸 Impacto das Taxas
              </h3>
              <div className="flex items-center justify-between gap-2">
                {feeSteps.map((step, i) => {
                  const isActive = step.tier === currentTier;
                  const isPast = step.tier < currentTier;
                  return (
                    <div key={step.tier} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className={`w-full text-center rounded-xl py-3 px-2 transition-all ${
                        isActive
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                          : isPast
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <p className="text-lg font-bold tabular-nums">{step.fee}</p>
                      </div>
                      <p className={`text-[10px] font-medium ${isActive ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                        {step.label}
                      </p>
                      {i < feeSteps.length - 1 && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground absolute hidden" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transactions */}
            <div>
              <h3 className="font-display text-lg font-bold text-foreground mb-3">Transações</h3>
              {(wallet?.transactions ?? []).length === 0 ? (
                <div className="card-premium border border-border/40 bg-card p-8 text-center" style={{ borderRadius: 'var(--radius)' }}>
                  <p className="text-sm text-muted-foreground">Nenhuma transação ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(wallet?.transactions ?? []).map(tx => (
                    <div key={tx.id} className="card-premium flex items-center gap-3 border border-border/40 bg-card px-4 py-3" style={{ borderRadius: 'var(--radius)' }}>
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        tx.type === 'credit' ? 'bg-primary/10' : 'bg-destructive/10'
                      }`}>
                        {tx.type === 'credit' ? (
                          <TrendingUp className="h-4 w-4 text-primary" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                       <span className={`text-sm font-bold tabular-nums ${
                         tx.type === 'credit' ? 'text-primary' : 'text-destructive'
                       }`}>
                         {tx.type === 'credit' ? '+' : ''}{Math.abs(tx.amount).toFixed(0)} MC
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default MemoGrana;
