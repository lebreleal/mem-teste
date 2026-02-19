/**
 * Premium modal — subscription plans + credit packs with Stripe checkout.
 * Features: brain icons for credits, trial banner, smooth animations.
 * Opens with defaultTab from parent (crown → plans, brain → credits).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, X, Sparkles, Brain, Zap, Pencil, Infinity, Check, ExternalLink, Timer, Rocket, Eye } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/hooks/useSubscription';
import { useEnergy } from '@/hooks/useEnergy';
import { useToast } from '@/hooks/use-toast';
import { STRIPE_PLANS, STRIPE_CREDIT_PACKS } from '@/lib/stripeConfig';

interface PremiumModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'plans' | 'credits';
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

const getDaysRemaining = (dateStr: string) => {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

type Tab = 'plans' | 'credits';

const PremiumModal = ({ open, onClose, defaultTab = 'plans' }: PremiumModalProps) => {
  const { isPremium, plan, expiresAt, isTrial, startCheckout, openPortal, refreshStatus } = useSubscription();
  const { energy } = useEnergy();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [visible, setVisible] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(null);

  // Sync defaultTab when modal opens
  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open, defaultTab]);

  if (!open) return null;

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment', label: string) => {
    setLoading(priceId);
    try {
      await startCheckout(priceId, mode);
      toast({ title: 'Redirecionando ao checkout...', description: 'Complete o pagamento na aba aberta.' });
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

  const trialDaysLeft = isTrial && expiresAt ? getDaysRemaining(expiresAt) : 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all duration-300 ${visible ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/0'}`}
      onClick={onClose}
    >
      <div
        className={`relative mx-0 sm:mx-4 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border/40 bg-card shadow-xl flex flex-col mb-16 sm:mb-0 transition-all duration-300 ease-out ${visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95'}`}
        style={{ maxHeight: 'calc(100dvh - 5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 sm:p-6">
            {/* Header — icon changes based on tab */}
            <div className="text-center mb-4">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl mb-3 transition-all duration-500 ${visible ? 'scale-100' : 'scale-50'}`}
                style={{
                  background: tab === 'plans'
                    ? 'linear-gradient(135deg, hsl(var(--warning)), hsl(45 100% 40%))'
                    : 'linear-gradient(135deg, hsl(var(--energy-purple, 270 60% 55%)), hsl(var(--primary)))',
                }}
              >
                {tab === 'plans' ? (
                  <Crown className="h-7 w-7 text-warning" fill="hsl(var(--warning))" />
                ) : (
                  <Brain className="h-7 w-7 text-white" />
                )}
              </div>

              {/* Credits balance when on credits tab */}
              {tab === 'credits' && (
                <div className="mb-2">
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-3xl font-bold text-foreground tabular-nums">{energy}</span>
                    <span className="text-sm text-muted-foreground">créditos disponíveis</span>
                  </div>
                </div>
              )}

              {/* Trial banner */}
              {isTrial && trialDaysLeft > 0 && (
                <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 animate-fade-in">
                  <div className="flex items-center justify-center gap-2">
                    <Timer className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      Premium Grátis · {trialDaysLeft} {trialDaysLeft === 1 ? 'dia' : 'dias'} restantes
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Aproveite todos os recursos Premium durante seu período de teste
                  </p>
                </div>
              )}

              {tab === 'plans' && (
                <>
                  {isPremium && !isTrial ? (
                    <>
                      <h3 className="font-display text-xl font-bold text-foreground">Premium Ativo</h3>
                      {expiresAt && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {plan === 'lifetime' ? '♾️ Acesso vitalício' : <>Expira em <span className="font-semibold text-foreground">{formatDate(expiresAt)}</span></>}
                        </p>
                      )}
                    </>
                  ) : !isTrial ? (
                    <>
                      <h3 className="font-display text-xl font-bold text-foreground">Seja Premium</h3>
                      <p className="text-sm text-muted-foreground mt-1">Desbloqueie todo o potencial do MemoCards</p>
                    </>
                  ) : null}
                </>
              )}

              {tab === 'credits' && (
                <h3 className="font-display text-xl font-bold text-foreground">Créditos IA</h3>
              )}
            </div>

            {/* Tabs */}
            <div className="flex bg-muted/40 rounded-xl p-1 mb-4 gap-1">
              <button
                onClick={() => setTab('plans')}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${tab === 'plans' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Crown className="h-3.5 w-3.5 inline mr-1.5 text-warning" fill={tab === 'plans' ? 'hsl(var(--warning))' : 'none'} /> Planos
              </button>
              <button
                onClick={() => setTab('credits')}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${tab === 'credits' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Brain className="h-3.5 w-3.5 inline mr-1.5" style={{ color: 'hsl(var(--energy-purple, 270 60% 55%))' }} /> Créditos IA
              </button>
            </div>

            {tab === 'plans' && (
              <div className="animate-fade-in">
                {/* Benefits */}
                <div className="space-y-0.5 mb-4">
                  {BENEFITS.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/40"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
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
                {(!isPremium || isTrial) && (
                  <div className="space-y-2 mb-4">
                    {/* Monthly */}
                    <div className="rounded-xl border border-border/50 p-3 flex items-center justify-between transition-all duration-200 hover:border-border">
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
                    <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-3 flex items-center justify-between relative transition-all duration-200 hover:border-primary/70">
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
                    <div className="rounded-xl border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/5 p-3 transition-all duration-200 hover:border-[hsl(var(--warning))]/70">
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
                      <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                        <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple, 270 60% 55%))' }} />
                        Inclui <span className="font-semibold text-foreground">50.000 créditos IA</span> permanentes
                      </p>
                    </div>
                  </div>
                )}

                {/* Manage subscription */}
                {isPremium && !isTrial && plan !== 'lifetime' && (
                  <Button variant="outline" className="w-full gap-2 mb-4" onClick={handlePortal}>
                    <ExternalLink className="h-4 w-4" /> Gerenciar Assinatura
                  </Button>
                )}

                {/* Trial info for non-premium */}
                {!isPremium && !isTrial && (
                  <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-4 py-3 text-center">
                    <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
                      <Crown className="h-4 w-4 shrink-0 text-warning" fill="hsl(var(--warning))" /> 14 dias grátis para novas contas
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Aproveite todos os benefícios Premium automaticamente</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'credits' && (
              <div className="space-y-3 animate-fade-in">
                {/* Missions CTA — above prices */}
                <button
                  onClick={() => { onClose(); navigate('/missoes'); }}
                  className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'hsl(var(--energy-purple, 270 60% 55%) / 0.12)' }}>
                    <Rocket className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple, 270 60% 55%))' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Complete Missões</p>
                    <p className="text-[11px] text-muted-foreground">Ganhe créditos grátis diariamente</p>
                  </div>
                  <Eye className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple, 270 60% 55%))' }} />
                </button>

                <p className="text-xs text-muted-foreground">Recarregue seus pontos de IA para gerar cards, provas e usar o tutor.</p>

                {/* Credit packs */}
                {STRIPE_CREDIT_PACKS.map((pack, i) => {
                  const isSelected = selectedCredit === pack.price_id;
                  const basePerCredit = STRIPE_CREDIT_PACKS[0].amount / STRIPE_CREDIT_PACKS[0].credits;
                  const thisPerCredit = pack.amount / pack.credits;
                  const discount = Math.round((1 - thisPerCredit / basePerCredit) * 100);

                  return (
                    <button
                      key={pack.price_id}
                      onClick={() => setSelectedCredit(isSelected ? null : pack.price_id)}
                      className={`relative w-full flex items-center gap-3.5 p-3.5 rounded-xl border-2 transition-all duration-200 text-left ${
                        isSelected
                          ? 'border-[hsl(var(--energy-purple,270_60%_55%))] bg-[hsl(var(--energy-purple,270_60%_55%)/0.06)] shadow-md'
                          : pack.popular
                            ? 'border-primary/40 bg-primary/5 hover:border-primary/60'
                            : 'border-border/60 hover:border-border hover:bg-muted/30'
                      }`}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {pack.popular && (
                        <span
                          className="absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                          style={{ background: 'linear-gradient(135deg, hsl(var(--energy-purple, 270 60% 55%)), hsl(var(--primary)))' }}
                        >
                          <Sparkles className="h-3 w-3 inline mr-0.5" /> Melhor valor
                        </span>
                      )}

                      {/* Brain icon */}
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200"
                        style={{
                          background: isSelected
                            ? 'linear-gradient(135deg, hsl(var(--energy-purple, 270 60% 55%)), hsl(var(--primary)))'
                            : 'hsl(var(--energy-purple, 270 60% 55%) / 0.12)',
                        }}
                      >
                        <Brain className={`h-5 w-5 ${isSelected ? 'text-white' : ''}`} style={isSelected ? {} : { color: 'hsl(var(--energy-purple, 270 60% 55%))' }} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-foreground">{pack.credits} créditos</span>
                          {discount > 0 && (
                            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--success, 142 71% 45%))' }}>
                              -{discount}%
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          R${(pack.amount / pack.credits / 100).toFixed(3)}/crédito
                        </p>
                      </div>

                      {/* Price */}
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold text-foreground">{pack.price}</div>
                      </div>

                      {isSelected && (
                        <div
                          className="absolute top-2.5 left-2.5 h-5 w-5 rounded-full flex items-center justify-center"
                          style={{ background: 'hsl(var(--energy-purple, 270 60% 55%))' }}
                        >
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Buy button */}
                <div className="pt-1">
                  <Button
                    className="w-full h-11 font-semibold transition-all duration-200"
                    disabled={!selectedCredit || !!loading}
                    onClick={() => {
                      if (selectedCredit) {
                        const pack = STRIPE_CREDIT_PACKS.find(p => p.price_id === selectedCredit);
                        if (pack) handleCheckout(pack.price_id, 'payment', pack.label);
                      }
                    }}
                    style={
                      selectedCredit
                        ? { background: 'linear-gradient(135deg, hsl(var(--energy-purple, 270 60% 55%)), hsl(var(--primary)))' }
                        : undefined
                    }
                  >
                    {loading ? 'Processando...' : selectedCredit
                      ? `Comprar ${STRIPE_CREDIT_PACKS.find(p => p.price_id === selectedCredit)?.label}`
                      : 'Selecione um pacote'}
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground text-center pt-1 leading-relaxed">
                  Créditos são usados pelo Tutor IA e Agente IA.
                  <br />
                  Você também ganha créditos grátis estudando diariamente!
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default PremiumModal;
