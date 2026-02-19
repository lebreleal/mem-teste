import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, Check, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
}

const packages = [
  { credits: 100, price: 4.99, discount: 0 },
  { credits: 200, price: 8.99, discount: 10 },
  { credits: 500, price: 19.99, discount: 20 },
  { credits: 1000, price: 24.99, discount: 50 },
];

const BuyCreditsDialog = ({ open, onOpenChange, currentBalance }: BuyCreditsDialogProps) => {
  const [selectedPkg, setSelectedPkg] = useState<number | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const basePerCredit = packages[0].price / packages[0].credits;

  const handlePurchase = async () => {
    if (selectedPkg === null) return;
    setPurchasing(true);
    // TODO: integrate real payment
    setTimeout(() => {
      setPurchasing(false);
      toast.success(`${packages[selectedPkg].credits} créditos adicionados! (simulação)`);
      onOpenChange(false);
      setSelectedPkg(null);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div
          className="px-6 pt-6 pb-4"
          style={{ background: 'linear-gradient(135deg, hsl(var(--energy-purple) / 0.15), hsl(var(--primary) / 0.08))' }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5" style={{ color: 'hsl(var(--energy-purple))' }} />
              Comprar Créditos IA
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Seu saldo atual: <span className="font-bold text-foreground">{currentBalance} créditos</span>
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 py-4 space-y-3">
            {packages.map((pkg, i) => {
              const isSelected = selectedPkg === i;
              const isBest = i === 3;
              const showDiscount = pkg.discount > 0;
              const showSavingsDetail = isBest && pkg.discount > 0;
              const savingsPerCredit = basePerCredit - pkg.price / pkg.credits;
              const totalSavings = (savingsPerCredit * pkg.credits).toFixed(2);

              return (
                <button
                  key={pkg.credits}
                  onClick={() => setSelectedPkg(i)}
                  className={`relative w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? 'border-[hsl(var(--energy-purple))] bg-[hsl(var(--energy-purple)/0.06)] shadow-md'
                      : 'border-border/60 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  {/* Best value badge */}
                  {isBest && (
                    <Badge
                      className="absolute -top-2.5 right-3 text-[10px] px-2 py-0.5 border-0"
                      style={{ background: 'linear-gradient(135deg, hsl(var(--energy-purple)), hsl(var(--primary)))', color: 'white' }}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Melhor valor
                    </Badge>
                  )}

                  {/* Icon */}
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, hsl(var(--energy-purple)), hsl(var(--primary)))'
                        : 'hsl(var(--energy-purple) / 0.12)',
                    }}
                  >
                    <Zap className={`h-5 w-5 ${isSelected ? 'text-white' : ''}`} style={isSelected ? {} : { color: 'hsl(var(--energy-purple))' }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold text-foreground">{pkg.credits} créditos</span>
                      {showDiscount && (
                        <span className="text-xs font-semibold" style={{ color: 'hsl(var(--success))' }}>
                          -{pkg.discount}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      R$ {(pkg.price / pkg.credits).toFixed(3)}/crédito
                      {showSavingsDetail && (
                        <span className="ml-1" style={{ color: 'hsl(var(--success))' }}>
                          • Economia de R$ {totalSavings}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-foreground">
                      R$ {pkg.price.toFixed(2).replace('.', ',')}
                    </div>
                    {showSavingsDetail && (
                      <div className="text-[11px] text-muted-foreground line-through">
                        R$ {(basePerCredit * pkg.credits).toFixed(2).replace('.', ',')}
                      </div>
                    )}
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <div
                      className="absolute top-3 left-3 h-5 w-5 rounded-full flex items-center justify-center"
                      style={{ background: 'hsl(var(--energy-purple))' }}
                    >
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Info */}
            <p className="text-[11px] text-muted-foreground text-center pt-2 leading-relaxed">
              Créditos são usados pelo Tutor IA e Agente IA (2 por consulta).
              <br />
              Você também ganha créditos grátis estudando diariamente!
            </p>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/40">
          <Button
            className="w-full h-11 font-semibold"
            disabled={selectedPkg === null || purchasing}
            onClick={handlePurchase}
            style={
              selectedPkg !== null
                ? { background: 'linear-gradient(135deg, hsl(var(--energy-purple)), hsl(var(--primary)))' }
                : undefined
            }
          >
            {purchasing ? 'Processando...' : selectedPkg !== null
              ? `Comprar ${packages[selectedPkg].credits} créditos por R$ ${packages[selectedPkg].price.toFixed(2).replace('.', ',')}`
              : 'Selecione um pacote'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuyCreditsDialog;
