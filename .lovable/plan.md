

## Plano: 3 Correcoees - Timestamp de Atualizacao, Minutos Estudados e Anti-Fraude

### 1. Corrigir o timestamp "ultima atualizacao" nos Decks Publicos

**Problema:** O `updated_at` mostrado nos cards da marketplace (ex: "ha cerca de 8 horas") vem do campo `decks.updated_at`, que so muda quando o metadado do deck e alterado (renomear, etc). Nao reflete edicoes nos cards nem sugestoes aprovadas pela comunidade.

**Solucao:** No `fetchPublicDecks` (`turmaService.ts`), alem de buscar `decks.updated_at`, buscar tambem o `MAX(cards.updated_at)` por deck e usar o mais recente entre os dois. Assim, qualquer edicao de card ou sugestao aprovada atualiza o timestamp exibido.

**Arquivos:**
- `src/services/turmaService.ts` (funcao `fetchPublicDecks`): adicionar query paralela para `cards.updated_at` agrupado por `deck_id`, e usar `Math.max(deck.updated_at, maxCardUpdatedAt)` como `updated_at` final.

---

### 2. Corrigir contabilidade de minutos estudados

**Problema:** O calculo atual de `todayMinutes` em `studyService.ts` (linha 365) usa uma estimativa fixa de 8 segundos por card:
```
todayMinutes = Math.round((todayCards * 8) / 60)
```
Isso e completamente impreciso -- nao mede tempo real.

**Solucao:** Calcular os minutos reais a partir dos `review_logs` de hoje. Para cada par consecutivo de reviews do mesmo usuario, o intervalo entre eles representa tempo de estudo (com um cap de 5 minutos por intervalo para excluir pausas). Soma-se todos os intervalos validos.

**Arquivos:**
- `src/services/studyService.ts` (funcao `fetchStudyStats`):
  - Buscar `review_logs` de hoje com `reviewed_at` ordenado cronologicamente
  - Calcular gaps entre reviews consecutivos
  - Cap de 120 segundos por card (intervalo > 120s = pausa, conta como 120s max)
  - Somar e converter para minutos
- Tambem corrigir `avgMinutesPerDay7d` que usa a mesma estimativa falsa

---

### 3. Implementar sistema anti-fraude de tempo de estudo

**Problema:** Nao ha validacao de tempo gasto por card. Um usuario poderia abrir o modo estudo, deixar aberto sem interagir, e acumular "tempo" artificialmente.

**Solucao:** Registrar o tempo real gasto por card no `review_logs` e aplicar limites:

**3a. Registrar `duration_ms` no review_log:**
- Em `Study.tsx`, ja existe `cardShownAt` (ref que marca quando o card apareceu). Calcular `duration_ms = Date.now() - cardShownAt.current` no momento do rating.
- Passar `duration_ms` para `submitCardReview` e salvar no review_log.
- Nota: o campo `duration_ms` precisa existir no review_logs -- como a tabela nao tem esse campo, vamos armazenar o valor na logica client-side por enquanto e usa-lo no calculo de minutos (sem precisar de migracao).

**3b. Cap anti-fraude no calculo de minutos:**
- Aplicar um cap de **120 segundos** por card review no calculo de `todayMinutes`
- Intervalos menores que **1.5 segundos** sao descartados (review automatico/bot)
- Intervalos maiores que **120 segundos** sao limitados a 120s (usuario pausou)

**3c. Calculo baseado em gaps entre reviews (sem campo novo):**
- Como nao temos `duration_ms` no banco, calcular o tempo entre reviews consecutivos
- Cada gap recebe o cap de 120s e o minimo de 1.5s
- Isso funciona retroativamente para dados existentes

**Arquivos:**
- `src/services/studyService.ts` (`fetchStudyStats`): reescrever calculo de `todayMinutes` e `avgMinutesPerDay7d` usando gaps entre reviews com caps anti-fraude

---

### Resumo de alteracoes

| Arquivo | Mudanca |
|---------|---------|
| `src/services/turmaService.ts` | `fetchPublicDecks`: incluir max `cards.updated_at` no timestamp |
| `src/services/studyService.ts` | `fetchStudyStats`: recalcular minutos reais com gaps + anti-fraude |

### Detalhes tecnicos

**Calculo de minutos reais (studyService.ts):**
```typescript
// Buscar reviews de hoje ordenados cronologicamente
const todayStart = today + 'T00:00:00.000Z';
const { data: todayLogs } = await supabase
  .from('review_logs')
  .select('reviewed_at')
  .eq('user_id', userId)
  .gte('reviewed_at', todayStart)
  .order('reviewed_at', { ascending: true });

// Calcular tempo real com anti-fraude
const MIN_REVIEW_MS = 1500;  // < 1.5s = bot/spam
const MAX_REVIEW_MS = 120000; // > 2min = pausa
let totalMs = 0;
const reviews = todayLogs ?? [];
for (let i = 1; i < reviews.length; i++) {
  const gap = new Date(reviews[i].reviewed_at).getTime() - new Date(reviews[i-1].reviewed_at).getTime();
  if (gap >= MIN_REVIEW_MS && gap <= MAX_REVIEW_MS) {
    totalMs += gap;
  } else if (gap > MAX_REVIEW_MS) {
    totalMs += MAX_REVIEW_MS; // cap em 2 min
  }
  // gap < MIN_REVIEW_MS: descartado (suspeito)
}
// Adicionar tempo do primeiro card (estimativa fixa de 15s)
if (reviews.length > 0) totalMs += 15000;
const todayMinutes = Math.round(totalMs / 60000);
```

**Timestamp de atualizacao (turmaService.ts):**
```typescript
// Buscar max card updated_at por deck
const { data: cardUpdates } = await supabase
  .from('cards')
  .select('deck_id, updated_at')
  .in('deck_id', deckIds)
  .order('updated_at', { ascending: false });

const cardMaxMap = new Map<string, string>();
(cardUpdates ?? []).forEach((c: any) => {
  if (!cardMaxMap.has(c.deck_id)) cardMaxMap.set(c.deck_id, c.updated_at);
});

// Usar o mais recente entre deck.updated_at e max(cards.updated_at)
return decks.map(d => ({
  ...d,
  updated_at: cardMaxMap.has(d.id) && new Date(cardMaxMap.get(d.id)!) > new Date(d.updated_at)
    ? cardMaxMap.get(d.id)!
    : d.updated_at,
}));
```

