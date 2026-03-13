

# Revisão Honesta: 5 Problemas Reais no Código Atual

Analisei linha por linha. Há bugs e inconsistências que preciso apontar.

---

## BUG 1: `getWeakConceptsWithErrors` retorna vazio se o aluno nunca errou nenhuma questão

**Arquivo**: `conceptHierarchyService.ts`, linha 57

```ts
if (!attempts || attempts.length === 0) return [];
```

Se o aluno tem 0 tentativas (nunca respondeu nada), a função retorna `[]` imediatamente. Mas conceitos **cascadeados** (state=0, scheduled_date <= now) existem e deveriam aparecer. Um aluno novo que recebeu conceitos via cascade **nunca vê nada** na página Conceitos Fracos.

**Correção**: Remover o early return. Se não há tentativas, o `conceptErrorMap` fica vazio e o filtro na linha 96-100 ainda funciona (pegaria apenas conceitos due via cascade).

---

## BUG 2: Stale closure no `handleConfidence` e `handleAdvanceAfterError`

**Arquivo**: `StudyMode.tsx`, linhas 85-110, 118-122

Ambas funções usam `useCallback` e chamam `moveToNextConcept()`, que é uma função regular que lê `index` do state. Mas `moveToNextConcept` **não está no array de dependências** do useCallback — está capturada por closure.

Cenário de bug: O aluno está no conceito 2 (index=1). `handleConfidence` foi criado quando index era 0 (se as deps não mudaram). Ao chamar `moveToNextConcept()`, ele usa `index = 0` em vez de `index = 1`, podendo pular ou repetir conceitos.

Na prática, `index` está nas deps, então pode funcionar. Mas `moveToNextConcept` chama `resetForNextQuestion` que chama `loadQuestion` que lê `user` — nenhuma dessas funções é estável. O padrão é frágil.

**Correção**: Converter `handleConfidence` e `handleAdvanceAfterError` para funções regulares (não useCallback), ou usar `useRef` para `index`.

---

## BUG 3: UI "morta" após confidence check resolve (acerto + "Tinha certeza" sem atingir threshold)

**Arquivo**: `StudyMode.tsx`, linhas 258-266

Quando o aluno acerta e clica "Tinha certeza" mas `consecutiveCorrect` ainda não atingiu o threshold:
1. `handleConfidence(true)` seta `awaitingConfidence = false` e chama `resetForNextQuestion`
2. `resetForNextQuestion` seta `confirmed = false` e chama `loadQuestion`

O bloco das linhas 258-266 renderiza quando `confirmed && isCorrect && !awaitingConfidence`. Mas `resetForNextQuestion` já setou `confirmed = false`. Então esse bloco **nunca aparece** nesse caso — o aluno vai direto para o loading da próxima questão sem ver feedback.

Isso não é um bug visual grave (funciona), mas o aluno perde o feedback "Correto! Mais X para confirmar." — vai direto pro loading.

**Avaliação**: Aceitável mas não ideal. Poderia mostrar o feedback por 1-2 segundos antes de carregar a próxima questão.

---

## INCONSISTÊNCIA 4: DiagnosticMode não tem confidence check nem elaborative interrogation

**Arquivo**: `DiagnosticMode.tsx`

O `StudyMode` agora tem:
- Confidence check ("Tinha certeza?" / "Chutei")  
- Elaborative interrogation (campo de texto após erro)
- Mastery threshold de 2

O `DiagnosticMode` tem apenas o mastery threshold. Sem confidence check, sem elaboration.

**Problema científico**: Se dissemos que o confidence check é importante para filtrar chutes (25% de chance em múltipla escolha), por que não aplicamos no diagnóstico? O diagnóstico é exatamente onde chutes são mais prováveis — o aluno está vendo conceitos pela primeira vez.

**Decisão necessária**: Ou adicionamos confidence check ao DiagnosticMode, ou aceitamos que o diagnóstico é mais rápido/superficial e o StudyMode é o "tratamento profundo". Ambas posições são defensáveis, mas precisam ser conscientes.

---

## PROBLEMA 5: `markConceptMastered` com learningSteps [10, 1440] — 2x Good não gradua

**Arquivo**: `globalConceptService.ts`, linhas 1176-1204

Com `learningSteps: [10, 1440]` (2 steps):
- 1º Good: `learning_step` 0→1, state=1 (learning)
- 2º Good: `learning_step` 1→2, que é >= steps.length(2), então **gradua para state=2**

Isso funciona matematicamente. Mas o resultado é que `stability` e `difficulty` são calculados como se o aluno tivesse estudado por 1440 minutos (24h) entre as duas revisões — quando na realidade foram **0 segundos** (ambas chamadas são instantâneas, `last_reviewed_at` é `now()` em ambas).

O `elapsedDays` no fsrsSchedule será ~0, o que pode distorcer o cálculo de stability. Dependendo da implementação do FSRS, elapsed=0 pode resultar em stability muito baixa ou incorreta.

**Correção**: Simular o elapsed corretamente passando `last_reviewed_at` com offset, ou aceitar que o diagnóstico é uma aproximação e os valores se corrigirão após a primeira revisão real.

---

## Plano de Correção (por prioridade)

| # | Problema | Arquivo | Correção |
|---|---|---|---|
| 1 | Early return mata conceitos cascadeados | `conceptHierarchyService.ts` | Remover `return []` na linha 57, continuar busca de conceitos due |
| 2 | Stale closure | `StudyMode.tsx` | Converter handlers para funções regulares |
| 3 | Feedback ausente entre questões | `StudyMode.tsx` | Adicionar delay de 1.5s ou botão "Próxima questão" |
| 4 | DiagnosticMode inconsistente | `DiagnosticMode.tsx` | Avaliar se adiciona confidence check |
| 5 | elapsed=0 no markConceptMastered | `globalConceptService.ts` | Ajustar last_reviewed_at com offset |

Bugs 1 e 2 são **bugs reais que quebram funcionalidade**. Os outros são melhorias.

