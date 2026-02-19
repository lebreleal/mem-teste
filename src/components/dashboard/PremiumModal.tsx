/**
 * Premium modal — subscription plans + credit packs with Stripe checkout.
 */

import { useState } from 'react';
import { Crown, X, Sparkles, Brain, Zap, Pencil, Infinity, Check, ExternalLink, CreditCard } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { STRIPE_PLANS, STRIPE_CREDIT_PACKS } from '@/lib/stripeConfig';

interface PremiumModalProps {
  open: boolean;
  onClose: () => void;
}

const BENEFITS = [
  { icon: Brain, title: 'Algoritmo FSRS-4.5', desc: 'Repetição espaçada de última geração' },
  { icon: Sparkles, title: 'Modelo IA Pro', desc: 'Raciocínio avançado, 5× mais potente' },
  { icon: Zap, title: '1.500 créditos IA / mês', desc: 'Gere cards e provas sem preocupação' },
  { icon: Pencil, title: 'Editar cards no estudo', desc: 'Corrija e melhore enquanto revisa' },
  { icon: Infinity, title: 'Aprenda sem limites', desc: 'Desfrute de aprendizado sem restrições' },
];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (d.getFullYear() > 2090) return 'Vitalício';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

type Tab = 'plans' | 'credits';

const PremiumModal = ({ open, onClose }: PremiumModalProps) => {
  const { isPremium, plan, expiresAt, startCheckout, openPortal, refreshStatus } = useSubscription();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('plans');

  if (!open) return null;

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment', label: string) => {
    setLoading(priceId);
    try {
      await startCheckout(priceId, mode);
      toast({ title: 'Redirecionando ao checkout...', description: 'Complete o pagamento na aba aberta.' });
      // Refresh after a delay to pick up the new status
      setTimeout(refreshStatus, 5000);
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao iniciar checkout', variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    try {
      await openPortal();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao abrir portal', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-0 sm:mx-4 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border/40 bg-card shadow-xl animate-fade-in flex flex-col mb-16 sm:mb-0"
        style={{ maxHeight: 'calc(100dvh - 5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 sm:p-6">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg, hsl(var(--warning)), hsl(45 100% 40%))' }}>
                <Crown className="h-7 w-7 text-white" fill={isPremium ? 'white' : 'none'} />
              </div>
              {isPremium ? (
                <>
                  <h3 className="font-display text-xl font-bold text-foreground">Premium Ativo</h3>
                  {expiresAt && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {plan === 'lifetime' ? '♾️ Acesso vitalício' : <>Expira em <span className="font-semibold text-foreground">{formatDate(expiresAt)}</span></>}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h3 className="font-display text-xl font-bold text-foreground">Seja Premium</h3>
                  <p className="text-sm text-muted-foreground mt-1">Desbloqueie todo o potencial do MemoCards</p>
                </>
              )}
            </div>

            {/* Tabs */}
            <div className="flex bg-muted/40 rounded-xl p-1 mb-4 gap-1">
              <button
                onClick={() => setTab('plans')}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${tab === 'plans' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Crown className="h-3.5 w-3.5 inline mr-1.5" /> Planos
              </button>
              <button
                onClick={() => setTab('credits')}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${tab === 'credits' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Zap className="h-3.5 w-3.5 inline mr-1.5" /> Créditos
              </button>
            </div>

            {tab === 'plans' && (
              <>
                {/* Benefits */}
                <div className="space-y-0.5 mb-4">
                  {BENEFITS.map((b, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/40">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <b.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{b.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Plans */}
                {!isPremium && (
                  <div className="space-y-2 mb-4">
                    {/* Monthly */}
                    <div className="rounded-xl border border-border/50 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Mensal</p>
                        <p className="text-lg font-bold text-foreground">R$25,90<span className="text-xs font-normal text-muted-foreground">/mês</span></p>
                      </div>
                      <Button size="sm" variant="outline" disabled={!!loading}
                        onClick={() => handleCheckout(STRIPE_PLANS.monthly.price_id, 'subscription', 'Mensal')}>
                        {loading === STRIPE_PLANS.monthly.price_id ? '...' : 'Assinar'}
                      </Button>
                    </div>

                    {/* Annual */}
                    <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-3 flex items-center justify-between relative">
                      <span className="absolute -top-2.5 left-3 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">MAIS POPULAR</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Anual</p>
                        <p className="text-lg font-bold text-foreground">R$149,90<span className="text-xs font-normal text-muted-foreground">/ano</span></p>
                        <p className="text-[11px] text-primary font-medium">~R$12,49/mês · 52% off</p>
                      </div>
                      <Button size="sm" disabled={!!loading}
                        onClick={() => handleCheckout(STRIPE_PLANS.annual.price_id, 'subscription', 'Anual')}>
                        {loading === STRIPE_PLANS.annual.price_id ? '...' : 'Assinar'}
                      </Button>
                    </div>

                    {/* Lifetime */}
                    <div className="rounded-xl border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/5 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <Infinity className="h-4 w-4" style={{ color: 'hsl(var(--warning))' }} /> Vitalício
                          </p>
                          <p className="text-lg font-bold text-foreground">R$299,00<span className="text-xs font-normal text-muted-foreground"> único</span></p>
                        </div>
                        <Button size="sm" variant="outline" disabled={!!loading}
                          className="border-[hsl(var(--warning))]/50"
                          onClick={() => handleCheckout(STRIPE_PLANS.lifetime.price_id, 'payment', 'Vitalício')}>
                          {loading === STRIPE_PLANS.lifetime.price_id ? '...' : 'Comprar'}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Zap className="h-3 w-3 text-[hsl(var(--warning))]" /> Inclui 50.000 créditos IA permanentes
                      </p>
                    </div>
                  </div>
                )}

                {/* Manage subscription */}
                {isPremium && plan !== 'lifetime' && (
                  <Button variant="outline" className="w-full gap-2 mb-4" onClick={handlePortal}>
                    <ExternalLink className="h-4 w-4" /> Gerenciar Assinatura
                  </Button>
                )}

                {/* Info */}
                {!isPremium && (
                  <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-4 py-3 text-center">
                    <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
                      <Crown className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--warning))' }} fill="hsl(var(--warning))" /> 14 dias grátis para novas contas
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Aproveite todos os benefícios Premium automaticamente</p>
                  </div>
                )}
              </>
            )}

            {tab === 'credits' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">Compre créditos de IA para gerar cards, provas e usar o tutor.</p>
                {STRIPE_CREDIT_PACKS.map((pack) => (
                  <div key={pack.price_id} className={`rounded-xl border p-3 flex items-center justify-between ${pack.popular ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}>
                    {pack.popular && (
                      <span className="absolute -mt-10 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">MELHOR CUSTO</span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-primary" /> {pack.label}
                      </p>
                      <p className="text-lg font-bold text-foreground">{pack.price}</p>
                      <p className="text-[10px] text-muted-foreground">
                        R${(pack.amount / pack.credits).toFixed(2)}/crédito
                      </p>
                    </div>
                    <Button size="sm" variant={pack.popular ? 'default' : 'outline'} disabled={!!loading}
                      onClick={() => handleCheckout(pack.price_id, 'payment', pack.label)}>
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                      {loading === pack.price_id ? '...' : 'Comprar'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default PremiumModal;
