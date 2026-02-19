import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Sparkles, ShoppingCart, Eye, Lock, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEnergy } from '@/hooks/useEnergy';

interface CreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const packages = [
  { credits: 100, price: 4.99, discount: 0 },
  { credits: 200, price: 8.99, discount: 0 },
  { credits: 500, price: 19.99, discount: 0 },
  { credits: 1000, price: 24.99, discount: 50 },
];

const CreditsDialog = ({ open, onOpenChange }: CreditsDialogProps) => {
  const { energy } = useEnergy();
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div
        className="relative mx-0 sm:mx-4 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border/40 bg-card shadow-xl animate-fade-in flex flex-col mb-16 sm:mb-0"
        style={{ maxHeight: 'calc(100dvh - 5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={() => onOpenChange(false)} className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground transition-colors">
          <span className="sr-only">Fechar</span>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 sm:p-6 space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-5 w-5" style={{ color: 'hsl(var(--energy-purple))' }} />
                <h3 className="text-lg font-bold text-foreground">Créditos IA</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground tabular-nums">{energy}</span>
                <span className="text-sm text-muted-foreground">créditos disponíveis</span>
              </div>
            </div>

            {/* How to earn */}
            <button
              onClick={() => { onOpenChange(false); navigate('/missoes'); }}
              className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'hsl(var(--energy-purple) / 0.12)' }}>
                <Rocket className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Complete Missões</p>
                <p className="text-[11px] text-muted-foreground">Ganhe créditos grátis diariamente</p>
              </div>
              <Eye className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple))' }} />
            </button>

            {/* Store */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" /> Pacotes de Créditos
              </p>

              <div className="grid grid-cols-2 gap-2">
                {packages.map((pkg, i) => {
                  const isBest = i === 3;
                  return (
                    <div
                      key={pkg.credits}
                      className={`relative rounded-xl border bg-muted/10 p-3 text-center ${isBest ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border/60'}`}
                    >
                      {isBest && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-md bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground whitespace-nowrap shadow-sm">
                          Melhor valor
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple))' }} />
                        <span className="text-sm font-bold text-foreground">{pkg.credits}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">créditos</span>
                      <div className="mt-1.5">
                        <span className="text-sm font-bold text-foreground">R$ {pkg.price.toFixed(2).replace('.', ',')}</span>
                        {pkg.discount > 0 && (
                          <span className="text-[10px] font-semibold ml-1" style={{ color: 'hsl(var(--success))' }}>-{pkg.discount}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Disabled buy button */}
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground cursor-not-allowed opacity-60"
              >
                <Lock className="h-3.5 w-3.5" /> Compra disponível em breve
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Custo: 2 créditos por consulta IA. Ganhe créditos completando missões.
            </p>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default CreditsDialog;
