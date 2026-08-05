import { Crown, History, CalendarCheck } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAICredits } from '@/hooks/useAICredits';
import { useCreditLedger } from '@/hooks/useCreditLedger';
import { formatCredits } from '@/lib/creditsFormat';

interface CreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


const KIND_LABEL: Record<string, string> = {
  daily: 'Bônus diário',
  daily_grant: 'Bônus diário',
  signup: 'Bônus de boas-vindas',
  signup_grant: 'Bônus de boas-vindas',
  admin_grant: 'Ajuste do admin',
  purchase: 'Compra de créditos',
  consumption: 'Uso de IA',
  hold: 'Uso de IA',
  settle: 'Uso de IA',
  refund: 'Estorno',
};

const FEATURE_LABEL: Record<string, string> = {
  'generate-deck': 'Geração de deck',
  'enhance-card': 'Melhorar cartão',
  'enhance-import': 'Importação IA',
  'ai-chat': 'Agente IA',
  'ai-tutor': 'Tutor IA',
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const CreditsDialog = ({ open, onOpenChange }: CreditsDialogProps) => {
  const { credits } = useAICredits();
  const { data: ledger = [], isLoading: ledgerLoading } = useCreditLedger(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div
        className="relative mx-0 sm:mx-4 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border/40 bg-card shadow-xl animate-fade-in flex flex-col mb-16 sm:mb-0"
        style={{ maxHeight: 'calc(100dvh - 5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={() => onOpenChange(false)} className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground transition-colors">
          <span className="sr-only">Fechar</span>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 sm:p-6 space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Crown className="h-5 w-5 text-warning" fill="hsl(var(--warning))" />
                <h3 className="text-lg font-bold text-foreground">Créditos IA</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground tabular-nums">{formatCredits(credits)}</span>
                <span className="text-sm text-muted-foreground">créditos disponíveis</span>
              </div>
            </div>

            {/* Daily grant info */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15">
                <CalendarCheck className="h-4 w-4 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Créditos diários grátis</p>
                <p className="text-[11px] text-muted-foreground">Você recebe créditos automaticamente ao entrar todo dia.</p>
              </div>
            </div>

            {/* History */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Histórico
              </div>
              {ledgerLoading && <p className="text-xs text-muted-foreground text-center py-6">Carregando histórico...</p>}
              {!ledgerLoading && ledger.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhuma movimentação de créditos ainda.</p>
              )}
              {ledger.map(entry => {
                const positive = entry.amount > 0;
                const label = FEATURE_LABEL[entry.feature_key ?? ''] ?? KIND_LABEL[entry.kind] ?? entry.kind;
                return (
                  <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{formatWhen(entry.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${positive ? 'text-success' : 'text-foreground'}`}>
                        {positive ? '+' : ''}{formatCredits(entry.amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">saldo {formatCredits(entry.balance_after)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Tudo liberado gratuitamente. O consumo é calculado pelo uso real de tokens de cada recurso de IA.
            </p>

          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default CreditsDialog;
