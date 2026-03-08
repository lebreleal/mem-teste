

## Análise Completa — Bugs Restantes e Status das Correções

### O que já foi corrigido (última iteração)
- ✅ `.limit(50000)` nas queries de `review_logs`
- ✅ Comparação de Date objects em vez de strings ISO para `todayMinutes`
- ✅ Janela de 365 dias para streak
- ✅ `Math.max(1, ...)` para mínimo de 1 minuto
- ✅ `calculateStreakWithFreezes` unificado

### Bug ATIVO: ActivityView usa gap GLOBAL entre logs (CRÍTICO)

**Arquivo**: `src/pages/ActivityView.tsx` linhas 57-86

O loop itera sobre TODOS os logs ordenados por `reviewed_at`. O cálculo de gap usa `logs[i-1]`:

```typescript
const gap = d.getTime() - new Date(logs[i - 1].reviewed_at).getTime();
```

Quando `logs[i]` é o primeiro card do dia e `logs[i-1]` é o último card do dia anterior, o gap entre eles pode ser 8-16 horas. Isso cai no `gap > MAX_MS (120s)` → atribui apenas 15s (bônus de sessão).

**Isso está correto!** O primeiro card de um novo dia é uma nova sessão e recebe 15s. O gap de 8h entre dias é tratado como pausa de sessão. Esse comportamento é o esperado.

**Porém**, há um problema sutil: se `elapsed_ms` é `null` (logs antigos sem essa coluna), e o gap entre dois logs no MESMO dia é > 2 minutos (ex: aluno pausou 3 min para ler), isso é tratado como sessão nova (15s), perdendo tempo real. Mas isso só afeta logs antigos — novos logs têm `elapsed_ms` preenchido.

### Bug ATIVO: ActivityView `Math.round` pode dar 0 minutos

**Arquivo**: `src/pages/ActivityView.tsx` linha 90

```typescript
dayMap[key].minutes = Math.round(dayMap[key].minutes / 60000);
```

Se o total acumulado de ms para um dia é < 30 segundos (ex: 1-2 cards rápidos), `Math.round(25000/60000) = 0`. O dia mostra "0 min" apesar de ter atividade.

A correção no `studyService.ts` usou `Math.max(1, ...)` mas o ActivityView NÃO foi corrigido.

### Bug ATIVO: `review_logs.state` grava o estado ANTES da review

**Arquivo**: `src/services/studyService.ts` linha 333

```typescript
state: card.state, // Estado ANTES da review, não DEPOIS
```

Isso é **intencional** — `review_logs.state` registra o estado no momento da review (pre-state) para fins de análise. Quando o ActivityView conta `newCards`, `learning`, `review`, `relearning` por dia, está contando quantas reviews foram feitas em cards que ESTAVAM nesses estados. Isso é semanticamente correto para estatísticas históricas.

### Forecast Worker — Está calculando tempos corretamente?

**Sim, com ressalvas**. O `get_forecast_params` RPC usa mediana (PERCENTILE_CONT 0.5) do tempo real por card, separado por estado (new/review/learning/relearning). Isso é extraído dos gaps entre `review_logs` dos últimos 30 dias.

- `avg_new_seconds`: mediana para cards state=0 → usado para prever tempo de novos
- `avg_review_seconds`: mediana para cards state=2 → usado para prever tempo de revisão
- `avg_learning_seconds`/`avg_relearning_seconds`: idem

Se o usuário tem < 50 reviews nos últimos 90 dias, o sistema usa defaults (30s novo, 8s revisão, 15s aprendendo, 12s reaprendendo).

**Potencial imprecisão**: O RPC calcula gaps entre logs GLOBAIS (não por card), então se o usuário revisa 2 cards quase simultâneos (ex: app com pre-fetch), o gap pode ser 0.1s, inflando a mediana para baixo. Porém, o teto de 60s e piso de 1s no RPC mitigam isso.

### Previsão de 120 cards — Está precisa?

O forecast usa os tempos adaptivos acima multiplicados pela contagem. Se o usuário vai estudar 120 cards:
- 40 novos × 30s = 20 min
- 60 revisões × 8s = 8 min  
- 20 aprendendo × 15s = 5 min
- Total ≈ 33 min

Com tempos adaptivos do usuário real, isso é razoavelmente preciso. O sistema também respeita `weeklyNewCards` e `capacityMin` para limitar a carga.

### Histórico daqui pra frente

Com as correções aplicadas:
- `elapsed_ms` é gravado em cada review (1.5s-120s capped)
- `todayMinutes` filtra corretamente por meia-noite local
- Streak usa 365 dias de janela

O histórico a partir de agora será preciso. Dados antigos (sem `elapsed_ms`) usarão fallback de gaps, que é menos preciso mas razoável.

---

## Plano: Corrigir último bug ativo

### 1. ActivityView: `Math.round` → `Math.max(1, Math.round(...))` quando > 0

**Arquivo**: `src/pages/ActivityView.tsx` linha 90

Garantir mínimo de 1 minuto se houve qualquer estudo naquele dia (consistente com `studyService.ts`).

```typescript
dayMap[key].minutes = dayMap[key].minutes > 0 
  ? Math.max(1, Math.round(dayMap[key].minutes / 60000)) 
  : 0;
```

### Arquivos a editar:
- `src/pages/ActivityView.tsx` — arredondamento de minutos com piso de 1

