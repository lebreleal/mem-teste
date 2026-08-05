/**
 * AdminAccessCodes — admins generate single-use codes that unlock a specific
 * deck for a buyer. Sellers do not self-serve: codes are issued manually here.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Copy, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  fetchDeckAccessCodes,
  createDeckAccessCodes,
  deleteDeckAccessCode,
} from '@/services/accessCodeService';

const AdminAccessCodes = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [deckId, setDeckId] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');

  const codesQuery = useQuery({
    queryKey: ['deck-access-codes'],
    queryFn: fetchDeckAccessCodes,
    enabled: !!isAdmin,
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: () => createDeckAccessCodes(deckId.trim(), Number(count) || 1, note.trim()),
    onSuccess: (rows) => {
      queryClient.invalidateQueries({ queryKey: ['deck-access-codes'] });
      toast({ title: `${rows.length} código(s) gerado(s)` });
      setNote('');
    },
    onError: () => toast({ title: 'Falha ao gerar códigos', variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => deleteDeckAccessCode(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck-access-codes'] }),
  });

  if (adminLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  const codes = codesQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="flex items-center gap-2 px-4 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-semibold text-foreground">Códigos de acesso</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4">
        <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
          <h2 className="text-sm font-semibold text-card-foreground">Gerar códigos</h2>
          <Input value={deckId} onChange={(e) => setDeckId(e.target.value)} placeholder="ID do baralho (UUID)" />
          <div className="flex gap-3">
            <Input
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
              placeholder="Quantidade"
              className="w-32"
              inputMode="numeric"
            />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" />
          </div>
          <Button
            disabled={!deckId.trim() || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'Gerando...' : 'Gerar'}
          </Button>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Códigos emitidos</h2>
          {codesQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!codesQuery.isLoading && codes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum código emitido ainda.</p>
          )}
          {codes.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-card-foreground">{c.code}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.redeemed_by ? 'Usado' : 'Disponível'}
                  {c.note ? ` · ${c.note}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copiar código"
                onClick={() => {
                  navigator.clipboard.writeText(c.code);
                  toast({ title: 'Código copiado' });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              {!c.redeemed_by && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Revogar código"
                  className="text-destructive"
                  onClick={() => revoke.mutate(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};

export default AdminAccessCodes;
