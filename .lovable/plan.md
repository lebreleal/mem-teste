

## Bug Real: Limite de 1000 Linhas do Supabase

### O Problema

O Supabase tem um limite padrão de **1000 linhas por request** (configuração `PGRST_MAX_ROWS`). Mesmo colocando `.limit(50000)` no código, o servidor retorna no máximo 1000 registros.

Seu usuário tem **1.571 review_logs**. A query ordena por `reviewed_at ASC`, então retorna os 1000 primeiros (de 22/fev até **3/mar 19:26 UTC**). Tudo depois disso — **dias 4, 6, 7, 8 de março** — simplesmente não chega no frontend.

Confirmação direta do banco:
- Registros antes de 4/mar: **1.213** (mais que 1000)
- Registro nº 1000: **2026-03-03 19:26:04** ← aqui o Supabase corta

Por isso os dias 1, 2, 3 aparecem verdes e os demais ficam zerados.

### Fix

**Arquivo:** `src/pages/ActivityView.tsx`

Implementar **paginação** na query para buscar TODOS os registros em lotes de 1000:

```typescript
// Substituir a query simples por um loop de paginação
const PAGE_SIZE = 1000;
let allLogs: any[] = [];
let offset = 0;
let hasMore = true;

while (hasMore) {
  const { data: page } = await supabase
    .from('review_logs')
    .select('reviewed_at, elapsed_ms, state')
    .eq('user_id', user.id)
    .gte('reviewed_at', oneYearAgo.toISOString())
    .order('reviewed_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (page && page.length > 0) {
    allLogs = allLogs.concat(page);
    offset += PAGE_SIZE;
    hasMore = page.length === PAGE_SIZE;
  } else {
    hasMore = false;
  }
}

const logs = allLogs;
```

Usar `.range(offset, offset + 999)` em vez de `.limit()` para paginação correta. O loop para quando uma página retorna menos de 1000 registros.

O restante do código (processamento do `dayMap`, streak, etc.) permanece idêntico — só muda a forma de buscar os dados.

### Resultado Esperado

Todos os 1.571 registros serão buscados (2 requests de ~1000 e ~571), e todos os dias com estudo aparecerão corretamente no calendário, incluindo o dia de hoje.

