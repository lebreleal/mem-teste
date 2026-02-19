/**
 * Premium modal — subscription plans + credit packs with Stripe checkout.
 * Reference: clean benefit list with icon circles, radio-style plan selector, big CTA.
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
  { icon: Brain, title: 'Algoritmo FSRS 4.5', desc: 'O melhor algoritmo de repetição espaçada do mundo', color: 'hsl(var(--primary))' },
  { icon: Sparkles, title: 'Raciocínio Pro liberado', desc: 'Acesse o modelo de IA avançado para gerar conteúdo', color: 'hsl(var(--primary))' },
  { icon: Zap, title: '50% menos créditos no Flash', desc: 'Modelo Flash consome metade dos créditos de IA', color: 'hsl(var(--warning))' },
  { icon: Infinity, title: '1.500 créditos por mês', desc: 'Receba créditos de IA mensalmente no seu plano', color: 'hsl(var(--destructive))' },
  { icon: Pencil, title: 'Edite cartões ao estudar', desc: 'Corrija e melhore seus cartões durante a revisão', color: 'hsl(var(--primary))' },
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
  const [selectedCredit, setSelectedCredit] = useState<string | null>(STRIPE_CREDIT_PACKS[3].price_id);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual' | 'lifetime'>('annual');

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

  const handlePlanContinue = () => {
    const planConfig = {
      monthly: { priceId: STRIPE_PLANS.monthly.price_id, mode: 'subscription' as const, label: 'Mensal' },
      annual: { priceId: STRIPE_PLANS.annual.price_id, mode: 'subscription' as const, label: 'Anual' },
      lifetime: { priceId: STRIPE_PLANS.lifetime.price_id, mode: 'payment' as const, label: 'Vitalício' },
    };
    const cfg = planConfig[selectedPlan];
    handleCheckout(cfg.priceId, cfg.mode, cfg.label);
  };

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
        <button onClick={onClose} className="absolute top-3 left-3 z-10 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 sm:p-6">
            {/* Header */}
            <div className="text-center mb-5">
              {tab === 'plans' ? (
                <>
                  <Crown className="h-8 w-8 mx-auto mb-2 text-warning" fill="hsl(var(--warning))" />
                  {isPremium && !isTrial ? (
                    <>
                      <h3 className="font-display text-2xl font-bold text-foreground italic">Premium Ativo</h3>
                      {expiresAt && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {plan === 'lifetime' ? '♾️ Acesso vitalício' : <>Expira em <span className="font-semibold text-foreground">{formatDate(expiresAt)}</span></>}
                        </p>
                      )}
                    </>
                  ) : (
                    <h3 className="font-display text-2xl font-bold text-primary italic">Premium</h3>
                  )}
                </>
              ) : (
                <>
                  <Brain className="h-8 w-8 mx-auto mb-2" style={{ color: 'hsl(var(--energy-purple, 270 60% 55%))' }} />
                  <h3 className="font-display text-2xl font-bold text-foreground">Créditos IA</h3>
                  <div className="flex items-baseline justify-center gap-2 mt-1">
                    <span className="text-3xl font-bold text-foreground tabular-nums">{energy}</span>
                    <span className="text-sm text-muted-foreground">créditos disponíveis</span>
                  </div>
                </>
              )}
            </div>

            {/* Trial expiry notice */}
            {isTrial && expiresAt && (
              <p className="text-xs text-muted-foreground text-center mb-4 animate-fade-in">
                Seu plano expira em <span className="font-semibold text-foreground">{formatDate(expiresAt)}</span>
              </p>
            )}

            {/* Tabs */}
            <div className="flex bg-muted/40 rounded-xl p-1 mb-5 gap-1">
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

            {/* ===== PLANS TAB ===== */}
            {tab === 'plans' && (
              <div className="animate-fade-in">
                {/* Benefits list — reference style with icon circles */}
                <div className="space-y-3 mb-8">
                  {BENEFITS.map((b, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${b.color}15` }}
                      >
                        <b.icon className="h-5 w-5" style={{ color: b.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{b.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Plan selector — radio style like reference */}
                {(!isPremium || isTrial) && (
                  <>
                    <div className="space-y-2.5 mb-4">
                      {/* Monthly */}
                      <button
                        onClick={() => setSelectedPlan('monthly')}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all duration-200 text-left ${
                          selectedPlan === 'monthly'
                            ? 'border-primary bg-primary/5'
                            : 'border-border/60 hover:border-border'
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selectedPlan === 'monthly' ? 'border-primary' : 'border-muted-foreground/40'
                        }`}>
                          {selectedPlan === 'monthly' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-semibold text-foreground flex-1">Mensal</span>
                        <span className="text-sm text-muted-foreground">25,90 BRL por mês</span>
                      </button>

                      {/* Annual — highlighted */}
                      <button
                        onClick={() => setSelectedPlan('annual')}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all duration-200 text-left ${
                          selectedPlan === 'annual'
                            ? 'border-primary bg-primary/5'
                            : 'border-border/60 hover:border-border'
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selectedPlan === 'annual' ? 'border-primary' : 'border-muted-foreground/40'
                        }`}>
                          {selectedPlan === 'annual' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-bold text-foreground flex-1">Anual</span>
                        <div className="flex items-center gap-2">
                          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-md">
                            ~52% OFF
                          </span>
                          <span className="text-sm text-muted-foreground">R$12,49/mês</span>
                        </div>
                      </button>

                      {/* Lifetime */}
                      <button
                        onClick={() => setSelectedPlan('lifetime')}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all duration-200 text-left ${
                          selectedPlan === 'lifetime'
                            ? 'border-primary bg-primary/5'
                            : 'border-border/60 hover:border-border'
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selectedPlan === 'lifetime' ? 'border-primary' : 'border-muted-foreground/40'
                        }`}>
                          {selectedPlan === 'lifetime' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-semibold text-foreground flex-1">Vitalício</span>
                        <span className="text-sm text-muted-foreground">299,00 BRL</span>
                      </button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center mb-3">
                      Cancele a qualquer momento
                    </p>

                    {/* CTA Button */}
                    <Button
                      className="w-full h-12 text-base font-semibold rounded-xl"
                      disabled={!!loading}
                      onClick={handlePlanContinue}
                    >
                      {loading ? 'Processando...' : 'Continuar'}
                    </Button>
                  </>
                )}

                {/* Manage subscription */}
                {isPremium && !isTrial && plan !== 'lifetime' && (
                  <Button variant="outline" className="w-full gap-2 mb-4" onClick={handlePortal}>
                    <ExternalLink className="h-4 w-4" /> Gerenciar Assinatura
                  </Button>
                )}

                {/* Trial info for non-premium */}
                {!isPremium && !isTrial && (
                  <div className="rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-4 py-3 text-center mt-4">
                    <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
                      <Crown className="h-4 w-4 shrink-0 text-warning" fill="hsl(var(--warning))" /> 14 dias grátis para novas contas
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Aproveite todos os benefícios Premium automaticamente</p>
                  </div>
                )}
              </div>
            )}

            {/* ===== CREDITS TAB ===== */}
            {tab === 'credits' && (
              <div className="animate-fade-in">
                {/* Missions CTA — same style as benefit row */}
                <div className="space-y-3 mb-6">
                  <button
                    onClick={() => { onClose(); navigate('/missoes'); }}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <Rocket className="h-5 w-5 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground leading-tight">Complete Missões</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Ganhe créditos grátis diariamente</p>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground mb-4">Recarregue créditos de IA para gerar cards, provas e usar o tutor.</p>

                {/* Credit packs — radio style matching plans */}
                <div className="space-y-2.5 mb-4">
                  {STRIPE_CREDIT_PACKS.map((pack, i) => {
                    const isSelected = selectedCredit === pack.price_id;
                    const basePerCredit = STRIPE_CREDIT_PACKS[0].amount / STRIPE_CREDIT_PACKS[0].credits;
                    const thisPerCredit = pack.amount / pack.credits;
                    const discount = Math.round((1 - thisPerCredit / basePerCredit) * 100);

                    return (
                      <button
                        key={pack.price_id}
                        onClick={() => setSelectedCredit(isSelected ? null : pack.price_id)}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : pack.popular
                              ? 'border-primary/40 bg-primary/5 hover:border-primary/60'
                              : 'border-border/60 hover:border-border'
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-primary' : 'border-muted-foreground/40'
                        }`}>
                          {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-bold text-foreground flex-1">
                          {pack.credits} créditos
                        </span>
                        <div className="flex items-center gap-2">
                          {discount > 0 && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-md">
                              -{discount}%
                            </span>
                          )}
                          {pack.popular && discount === 0 && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-md">
                              Popular
                            </span>
                          )}
                          <span className="text-sm text-muted-foreground">{pack.price}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Buy button */}
                <Button
                  className="w-full h-12 text-base font-semibold rounded-xl"
                  disabled={!selectedCredit || !!loading}
                  onClick={() => {
                    if (selectedCredit) {
                      const pack = STRIPE_CREDIT_PACKS.find(p => p.price_id === selectedCredit);
                      if (pack) handleCheckout(pack.price_id, 'payment', pack.label);
                    }
                  }}
                >
                  {loading ? 'Processando...' : selectedCredit
                    ? `Comprar ${STRIPE_CREDIT_PACKS.find(p => p.price_id === selectedCredit)?.label}`
                    : 'Selecione um pacote'}
                </Button>

                <p className="text-[11px] text-muted-foreground text-center pt-3 leading-relaxed">
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
