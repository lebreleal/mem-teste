

## Novo Algoritmo de Probabilidade de Acerto (Recall Display)

**Importante:** A repetição espaçada (FSRS/SM-2) esta funcionando corretamente. O problema é apenas no **indicador visual de %** que aparece no gauge e nos cards. Os agendamentos continuam iguais.

### O que muda

**1. Migração de banco de dados**
- Adicionar coluna `last_reviewed_at timestamptz` na tabela `cards`
- Sem valor padrão (null para cards existentes, preenchido conforme forem revisados)

**2. `src/services/studyService.ts`**
- No `submitCardReview`, incluir `last_reviewed_at: new Date().toISOString()` no update do card

**3. `src/components/RetentionGauge.tsx`** (mudança principal)
- Interface do card passa a aceitar `last_reviewed_at?: string`
- Reescrever `calculateCardRecall` com algoritmo unificado:

```text
state=0 (Novo): percent = 0, label = "Novo"

state=1 (Aprendendo):
  Se tem last_reviewed_at:
    t = tempo desde last_reviewed_at (em dias fracionários)
    S = card.stability (FSRS) ou step em dias (SM-2, mínimo 0.007)
    R = (1 + FACTOR * t / S) ^ DECAY
  Se não tem (fallback):
    Estimar lastReview = scheduledDate - stepDuration
    Mesma fórmula

state=2 (Revisão):
  Se tem last_reviewed_at:
    t = tempo desde last_reviewed_at (em dias)
    S = card.stability (FSRS) ou intervalo real (SM-2)
    R = (1 + FACTOR * t / S) ^ DECAY
  Se não tem (fallback):
    FSRS: lastReview ≈ scheduledDate - S dias
    SM-2: lastReview via estimativa atual (mantém lógica existente)
```

- Resultado: acabou de revisar = ~95%+, no dia agendado = ~90%, atrasado = decai realisticamente
- Learning cards que acabaram de ser vistos = recall ALTO (não mais 35%)

**4. `src/hooks/usePerformance.ts`**
- Incluir `last_reviewed_at` no select de cards

**5. `src/components/FlashCard.tsx`**
- Passar `last_reviewed_at` do card para o `calculateCardRecall`

**6. `src/test/retention.test.ts`**
- Atualizar testes de learning cards: agora esperam recall alto quando acabaram de ser revisados
- Adicionar testes com `last_reviewed_at` explícito
- Manter testes de fallback (sem `last_reviewed_at`)

### Cenários concretos

| Cenário | Antes | Depois |
|---------|-------|--------|
| Errei card, voltou em 1min | 35-55% | ~95% |
| Errei, esperou 30min (step 10min) | 30-50% | ~35% |
| Card de revisão no dia certo | ~90% | ~90% |
| Card atrasado 5 dias (S=10) | ~85% | ~85% |
| Card novo | 0% | 0% "Novo" |

### Arquivos modificados

1. Nova migração SQL (adicionar `last_reviewed_at`)
2. `src/services/studyService.ts` -- salvar timestamp
3. `src/components/RetentionGauge.tsx` -- novo algoritmo
4. `src/hooks/usePerformance.ts` -- incluir campo na query
5. `src/components/FlashCard.tsx` -- passar campo
6. `src/test/retention.test.ts` -- atualizar testes

