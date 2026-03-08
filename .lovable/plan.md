

## Plano: Transação com Rollback de Créditos em Edge Functions

### Problema

Todas as edge functions (generate-deck, enhance-card, enhance-import, ai-tutor, ai-chat) seguem o mesmo padrão quebrado:

1. Deduz créditos (energy) via `deductEnergy` RPC
2. Chama a API do Google AI
3. Se a API falha (429, 503, parse error, etc.) → créditos JA foram descontados e NUNCA são devolvidos

Não existe nenhuma função `refundEnergy` no sistema.

### Solução

**1. Criar RPC `refund_energy` no banco (migration SQL)**

```sql
CREATE OR REPLACE FUNCTION public.refund_energy(p_user_id uuid, p_cost integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_cost <= 0 THEN RETURN; END IF;
  UPDATE profiles SET energy = energy + p_cost WHERE id = p_user_id;
END;
$$;
```

**2. Adicionar `refundEnergy` em `supabase/functions/_shared/utils.ts`**

```typescript
export async function refundEnergy(supabase: any, userId: string, cost: number): Promise<void> {
  if (cost <= 0) return;
  await supabase.rpc("refund_energy", { p_user_id: userId, p_cost: cost });
}
```

**3. Atualizar cada edge function para refundar em caso de erro**

Padrão a aplicar em todos os 5 arquivos (`generate-deck`, `enhance-card`, `enhance-import`, `ai-tutor`, `ai-chat`):

- Guardar flag `let energyDeducted = false` + `let deductedCost = 0` após dedução bem-sucedida
- Em cada ponto de erro APÓS a dedução, chamar `await refundEnergy(supabase, userId, deductedCost)` antes de retornar o erro
- No `catch` global, também refundar se `energyDeducted`

Exemplo para `generate-deck`:
```
// Após deductEnergy:
let energyDeducted = false;
if (cost > 0) {
  const ok = await deductEnergy(supabase, userId, cost);
  if (!ok) return jsonResponse({...}, 402);
  energyDeducted = true;
}

// Em cada return de erro (429, 502, 503, parse error, 0 cards):
if (energyDeducted) await refundEnergy(supabase, userId, cost);
return jsonResponse({ error: "..." }, status);

// No catch global:
catch (err) {
  if (energyDeducted) await refundEnergy(supabase, userId, cost);
  return jsonResponse({ error: "..." }, 500);
}
```

### Arquivos a editar

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | Criar RPC `refund_energy` |
| `supabase/functions/_shared/utils.ts` | Adicionar `refundEnergy()` |
| `supabase/functions/generate-deck/index.ts` | Refund em 5 pontos de erro |
| `supabase/functions/enhance-card/index.ts` | Refund no catch |
| `supabase/functions/enhance-import/index.ts` | Refund no catch |
| `supabase/functions/ai-tutor/index.ts` | Refund no catch (streaming — refund se stream nem iniciou) |
| `supabase/functions/ai-chat/index.ts` | Refund no catch (streaming — refund se stream nem iniciou) |

### Nota sobre streaming (ai-tutor, ai-chat)

Para funções de streaming, o refund só faz sentido se a chamada AI falhar ANTES de iniciar o stream. Se o stream já começou a enviar dados ao client, os créditos foram "gastos" legitimamente. O refund será aplicado apenas nos erros pré-stream (401, 429, connection error).

