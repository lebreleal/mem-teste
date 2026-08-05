/**
 * RedeemCode — replaces the old "Explorar" tab.
 *
 * Decks are no longer browsable in a public marketplace: a user gets a deck by
 * entering a single-use access code issued by the platform admins.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import BottomNav from '@/components/BottomNav';
import { redeemDeckAccessCode, redeemErrorMessage } from '@/services/accessCodeService';

const RedeemCode = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');

  const redeem = useMutation({
    mutationFn: () => redeemDeckAccessCode(code),
    onSuccess: (deckId) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast({ title: 'Baralho liberado!', description: 'Ele já está na sua biblioteca.' });
      setCode('');
      if (deckId) navigate(`/decks/${deckId}`);
    },
    onError: (err: Error) => {
      toast({ title: 'Ops', description: redeemErrorMessage(err.message), variant: 'destructive' });
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-2 px-4 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-semibold text-foreground">Resgatar código</h1>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-center px-6 pt-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mt-5 font-display text-xl font-semibold text-foreground">
          Tem um código de acesso?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Digite o código recebido para adicionar o baralho à sua biblioteca. Cada código pode ser
          usado uma única vez.
        </p>

        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) redeem.mutate(); }}
          placeholder="XXXX-XXXX"
          className="mt-6 h-12 text-center text-lg tracking-[0.2em]"
          autoCapitalize="characters"
          autoComplete="off"
        />

        <Button
          className="mt-4 h-11 w-full rounded-full"
          disabled={!code.trim() || redeem.isPending}
          onClick={() => redeem.mutate()}
        >
          {redeem.isPending ? 'Resgatando...' : 'Resgatar'}
        </Button>
      </main>

      <BottomNav />
    </div>
  );
};

export default RedeemCode;
