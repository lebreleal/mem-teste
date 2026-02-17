/**
 * Premium modal for the Dashboard — "Seja Premium" style.
 */

import { Crown, X, Sparkles, Brain, Zap, Pencil, Infinity } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePremium } from '@/hooks/usePremium';

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

const INCLUDED = [
  'Algoritmo SM-2',
  'Modelo IA Flash',
  'Créditos IA por missões',
  'Criação ilimitada de baralhos',
  'Comunidades e provas',
];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const PremiumModal = ({ open, onClose }: PremiumModalProps) => {
  const { isPremium, expiresAt } = usePremium();

  if (!open) return null;

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
            <div className="text-center mb-5">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg, hsl(270 60% 55%), hsl(270 60% 45%))' }}>
                <Crown className="h-7 w-7 text-white" fill={isPremium ? 'white' : 'none'} />
              </div>
              {isPremium ? (
                <>
                  <h3 className="font-display text-xl font-bold text-foreground">Premium Ativo</h3>
                  {expiresAt && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Expira em <span className="font-semibold text-foreground">{formatDate(expiresAt)}</span>
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

            {/* Already included */}
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Já incluso no grátis</p>
              <div className="space-y-0.5">
                {INCLUDED.map((item, i) => (
                  <span key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <span className="text-primary">✓</span> {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Info */}
            {!isPremium && (
              <div className="rounded-xl border border-[hsl(270,60%,55%)]/30 bg-[hsl(270,60%,55%)]/5 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
                  <Crown className="h-4 w-4 shrink-0" style={{ color: 'hsl(270, 60%, 55%)' }} fill="hsl(270, 60%, 55%)" /> 14 dias grátis para novas contas
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Aproveite todos os benefícios Premium automaticamente</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default PremiumModal;
