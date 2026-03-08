

## Bugs encontrados: Tempo de estudo e Streak

### Bug 1 (CRÍTICO): Query de `review_logs` sem `.limit()` — Supabase retorna max 1000 rows

**Arquivo**: `src/services/studyService.ts` linha 362-367

A query busca logs dos últimos 30 dias SEM especificar `.limit()`. O Supabase tem limite padrão de **1000 rows**. Se o usuário estudou 50+ cards/dia por 20 dias = 1000+ logs, os logs mais recentes (de HOJE) podem ser **cortados**. Resultado: `todayMinutes = 0` mesmo tendo estudado horas.

O mesmo problema afeta `ActivityView.tsx` (linha 44-48) — busca TODOS os logs sem limite.

**Correção**: Adicionar `.limit(50000)` ou usar paginação. Para `fetchStudyStats`, como só precisamos de 30 dias e o cálculo é simples, `.limit(10000)` resolve.

### Bug 2 (CRÍTICO): Comparação de string ISO para filtrar logs de hoje

**Arquivo**: `src/services/studyService.ts` linha 411-412

```typescript
const todayStart = localMidnight.toISOString(); // converte para UTC!
const todayLogs = logs.filter(l => l.reviewed_at >= todayStart); // comparação de string
```

`localMidnight` (ex: 00:00 BRT) vira `03:00Z` em UTC. Reviews entre 00:00-03:00 local são excluídas. Em UTC+X positivo, reviews de ontem são incluídas.

**Correção**: Comparar objetos `Date` diretamente: `new Date(l.reviewed_at) >= localMidnight`.

### Bug 3: Streak limitado a 30 dias de dados

**Arquivo**: `src/services/studyService.ts` linha 359-360

Query busca apenas `gte(thirtyDaysAgo)`. Streak > 30 dias é impossível de calcular. E com o Bug 1, se houver 1000+ logs, pode receber menos de 30 dias.

**Correção**: Para streak, buscar janela de 365 dias com `.limit(50000)`.

### Bug 4: `ActivityView` e `fetchStudyStats` usam gap entre logs globais, não por dia

O fallback de tempo (quando `elapsed_ms` é null) usa o gap entre `logs[i-1]` e `logs[i]` da lista GLOBAL. Mas o ActivityView acumula por dia. O último log do dia anterior e o primeiro log do dia seguinte podem ter gap de horas, resultando em apenas 15s (bônus de sessão) para o primeiro card do dia — correto. Porém, na `fetchStudyStats`, `todayLogs` é um sub-array filtrado, então o gap entre `todayLogs[0]` e `todayLogs[1]` é calculado corretamente. O primeiro card recebe 15s (bônus). Isso está OK.

### Bug 5: `Math.round(totalMs / 60000)` arredonda para baixo quando < 30s

Se o usuário estudou 45 segundos (45000ms), `Math.round(45000/60000) = Math.round(0.75) = 1`. Mas se estudou 29s, retorna 0. Para sessões curtas, o dashboard mostra `0m`. Isso pode causar confusão.

**Correção**: Usar `Math.ceil` em vez de `Math.round` quando `totalMs > 0`, garantindo mínimo de 1 minuto se houve qualquer estudo.

---

## Plano de Correção

### 1. Adicionar `.limit(10000)` nas queries de `review_logs`
- `src/services/studyService.ts` (fetchStudyStats) — adicionar `.limit(10000)`
- `src/pages/ActivityView.tsx` — adicionar `.limit(50000)`

### 2. Corrigir filtro de `todayMinutes` — comparar Date objects
```typescript
const todayLogs = logs.filter(l => new Date(l.reviewed_at) >= localMidnight);
```

### 3. Aumentar janela de streak para 365 dias
Mudar `thirtyDaysAgo` para `365` dias na query de `fetchStudyStats`.

### 4. Usar `Math.ceil` quando `totalMs > 0`
```typescript
return totalMs > 0 ? Math.max(1, Math.round(totalMs / 60000)) : 0;
```

### 5. Unificar streak com freezes
Usar `calculateStreakWithFreezes` em `fetchStudyStats` (já é o que `calculateStreak` chama internamente, confirmado). Adicionar `freezesAvailable` ao retorno.

### Arquivos a editar:
- `src/services/studyService.ts` — bugs 1, 2, 3, 4, 5
- `src/types/study.ts` — adicionar `freezesAvailable`
- `src/pages/ActivityView.tsx` — bug 1 (limit)

