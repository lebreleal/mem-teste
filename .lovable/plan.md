

## Plano: Medir tempo real por card com timer

### Problema atual

O calculo de "minutos estudados" usa uma estimativa indireta: analisa os gaps entre timestamps de `reviewed_at` no `review_logs`, com heuristicas anti-fraude (descarta < 1.5s, cap em 2min). Isso e impreciso porque:
- Nao mede o tempo real que voce ficou olhando/pensando no card
- Pausas para ir ao banheiro, trocar de aba etc. distorcem os numeros
- Cards de aprendizado (learning steps) ficam esperando timer e o gap inclui esse tempo de espera

### Solucao: Timer real por card

**Conceito**: O `Study.tsx` ja tem um `cardShownAt` ref que marca quando o card apareceu. Basta calcular `elapsed = Date.now() - cardShownAt.current` no momento do rating, salvar isso no `review_logs`, e somar para calcular o tempo de estudo.

### Mudancas necessarias

**1. Adicionar coluna `elapsed_ms` na tabela `review_logs`** (migration)
- Nova coluna `elapsed_ms integer` (nullable, default null) para nao quebrar logs antigos
- Logs antigos sem essa coluna continuam usando o calculo de gap como fallback

**2. `src/services/studyService.ts` - submitCardReview**
- Receber novo parametro `elapsedMs` (tempo real em ms)
- Aplicar cap anti-fraude: minimo 1.5s, maximo 120s (mesmo limites atuais)
- Salvar no INSERT do `review_logs`

**3. `src/hooks/useStudySession.ts` - submitReview mutation**
- Passar `elapsedMs` no mutationFn

**4. `src/pages/Study.tsx` - handleRate**
- Calcular `elapsed = Date.now() - cardShownAt.current` (ja existe na linha 322!)
- Passar como `elapsedMs` no submitReview
- Resetar `cardShownAt.current = Date.now()` quando o proximo card aparecer

**5. `src/services/studyService.ts` - fetchStudyStats**
- Para logs com `elapsed_ms`: somar diretamente
- Para logs sem `elapsed_ms` (antigos): usar o calculo de gap atual como fallback
- Resultado: `todayMinutes = (soma dos elapsed_ms de hoje) / 60000`

### Detalhes tecnicos

**Migration SQL:**
```sql
ALTER TABLE review_logs ADD COLUMN elapsed_ms integer;
```

**submitCardReview - novo parametro:**
```typescript
export async function submitCardReview(
  userId: string,
  card: any,
  rating: Rating,
  algorithmMode: string,
  deckConfig: any,
  elapsedMs?: number,  // novo
) {
  // Cap anti-fraude
  const cappedMs = elapsedMs 
    ? Math.min(Math.max(elapsedMs, 1500), 120000) 
    : null;
  
  // ... no insert do review_logs:
  supabase.from('review_logs').insert({
    ...existingFields,
    elapsed_ms: cappedMs,
  });
}
```

**fetchStudyStats - calculo hibrido:**
```typescript
// Buscar logs com elapsed_ms
const { data: logs } = await supabase
  .from('review_logs')
  .select('reviewed_at, elapsed_ms')
  .eq('user_id', userId)
  .gte('reviewed_at', thirtyDaysAgo.toISOString())
  .order('reviewed_at', { ascending: true });

// Para hoje: somar elapsed_ms quando disponivel, gap-based para antigos
const todayLogs = logs.filter(l => l.reviewed_at >= todayStart);
let todayMs = 0;
for (let i = 0; i < todayLogs.length; i++) {
  if (todayLogs[i].elapsed_ms) {
    todayMs += todayLogs[i].elapsed_ms;
  } else if (i > 0) {
    // fallback: gap-based para logs antigos
    const gap = new Date(todayLogs[i].reviewed_at).getTime() 
              - new Date(todayLogs[i-1].reviewed_at).getTime();
    if (gap >= 1500 && gap <= 120000) todayMs += gap;
    else if (gap > 120000) todayMs += 120000;
  }
}
todayMinutes = Math.round(todayMs / 60000);
```

**Study.tsx - resetar timer no card change:**
```typescript
// Ja existe: cardShownAt.current reset ao mudar card
useEffect(() => {
  cardShownAt.current = Date.now();
}, [cardKey]);
```

### Arquivos afetados

| Arquivo | Mudanca |
|---------|---------|
| Migration SQL | Adicionar coluna `elapsed_ms` em `review_logs` |
| `src/services/studyService.ts` | Receber/salvar `elapsedMs`, calculo hibrido |
| `src/hooks/useStudySession.ts` | Passar `elapsedMs` na mutation |
| `src/pages/Study.tsx` | Enviar tempo real, resetar timer |
| `src/integrations/supabase/types.ts` | Atualizar tipo de `review_logs` (se tipado) |

### Vantagens

- Tempo de estudo 100% preciso a partir de agora
- Logs antigos continuam funcionando com fallback
- Anti-fraude mantido (cap 1.5s-120s)
- Nenhuma mudanca na UI necessaria - o `todayMinutes` ja e exibido no StatusBar
