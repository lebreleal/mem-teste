import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Crown, AlertTriangle } from 'lucide-react';

interface LeaveConfirmDialogProps {
  confirmLeave: string | null;
  setConfirmLeave: (id: string | null) => void;
  turmas: any[];
  userId?: string;
  leaveTurma: any;
  toast: any;
}

const LeaveConfirmDialog = ({
  confirmLeave, setConfirmLeave, turmas, userId, leaveTurma, toast,
}: LeaveConfirmDialogProps) => {
  const leavingTurma = turmas.find(t => t.id === confirmLeave);
  const isOwner = leavingTurma?.owner_id === userId;

  const mathChallenge = useMemo(() => {
    const a = Math.floor(Math.random() * 20) + 5;
    const b = Math.floor(Math.random() * 20) + 5;
    return { a, b, answer: a + b };
  }, [confirmLeave]);

  const [mathAnswer, setMathAnswer] = useState('');

  useEffect(() => {
    if (!confirmLeave) setMathAnswer('');
  }, [confirmLeave]);

  const isMathCorrect = isOwner ? Number(mathAnswer) === mathChallenge.answer : true;

  const handleLeave = () => {
    leaveTurma.mutate(confirmLeave!, {
      onSuccess: () => {
        setConfirmLeave(null);
        toast({ title: isOwner ? 'Comunidade excluída' : 'Saiu da comunidade' });
      },
      onError: () => toast({ title: 'Erro ao sair', variant: 'destructive' }),
    });
  };

  return (
    <Dialog open={!!confirmLeave} onOpenChange={open => !open && setConfirmLeave(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isOwner ? 'Excluir comunidade?' : 'Sair da comunidade?'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isOwner ? (
            <>
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2">
                <p className="text-xs text-destructive font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Ação irreversível
                </p>
                <p className="text-xs text-muted-foreground">
                  Você é o dono de <span className="font-semibold text-foreground">{leavingTurma?.name}</span>.
                  Ao sair, a comunidade e <strong>todo seu conteúdo</strong> (matérias, aulas, provas, decks) serão excluídos permanentemente.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-foreground font-medium">
                  Resolva para confirmar: <span className="font-mono text-primary">{mathChallenge.a} + {mathChallenge.b} = ?</span>
                </p>
                <Input
                  type="number"
                  placeholder="Sua resposta"
                  value={mathAnswer}
                  onChange={e => setMathAnswer(e.target.value)}
                  className="font-mono"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja sair de <span className="font-semibold text-foreground">{leavingTurma?.name}</span>?
              {leavingTurma?.is_private
                ? ' Como é uma comunidade privada, você precisará de um novo convite para entrar novamente.'
                : ' Você poderá entrar novamente pela aba Descobrir.'}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmLeave(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={leaveTurma.isPending || !isMathCorrect}
              onClick={handleLeave}
            >
              {leaveTurma.isPending ? (isOwner ? 'Excluindo...' : 'Saindo...') : (isOwner ? 'Excluir' : 'Sair')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LeaveConfirmDialog;
