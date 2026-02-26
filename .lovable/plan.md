

# Corrigir Etapas de Aprendizado FSRS + Ocultar Irmãos Cloze

## Diagnostico

Comparando os prints do Anki com o nosso sistema, encontrei **dois problemas reais**:

### Problema 1: Etapas de aprendizado para cards novos
No Anki com FSRS e steps `[1m, 10m]`, um card novo mostra:
- De novo: **1min** (step 0)
- Dificil: **~6min** (media entre step 0 e step 1)
- Bom: **10min** (step 1 - ainda em aprendizado!)
- Facil: **14d** (gradua direto para revisao)

No nosso sistema, um card novo mostra:
- De novo: 1min (correto)
- Dificil: 10min ou 15min (usa step[1] direto, deveria ser a media)
- Bom: **vai direto para revisao com intervalo de dias** (ERRADO - deveria ficar em aprendizado)
- Facil: gradua para revisao (correto)

**Causa raiz**: O nosso `fsrsSchedule` gradua cards novos para `state=2` (revisao) quando o rating e Good ou Easy. No Anki, Good em card novo avanca para o proximo learning step, permanecendo em `state=1`. So Easy pula os steps.

### Problema 2: Irmãos cloze nao sao ocultos
No Anki (print 5), cards irmãos (cloze 1, cloze 2 do mesmo texto) sao automaticamente ocultos ate o dia seguinte apos revisar um deles. Nosso sistema mostra todos os irmãos na mesma sessão, o que prejudica a eficácia do estudo.

## Plano de implementação

### 1. Adicionar coluna `learning_step` na tabela cards
- Nova migração SQL: `ALTER TABLE cards ADD COLUMN learning_step integer NOT NULL DEFAULT 0`
- Rastreia em qual etapa de aprendizado o card está (0, 1, 2...)
- Necessário para saber se Good deve avancar para o próximo step ou graduar

### 2. Reescrever lógica de new/learning no `fsrsSchedule` (src/lib/fsrs.ts)
Comportamento correto (igual ao Anki):

**Card novo (state 0):**
```text
Again  → state 1, step 0, intervalo = steps[0]
Hard   → state 1, step 0, intervalo = avg(steps[0], steps[1])
Good   → state 1, step 1, intervalo = steps[1]  (se houver mais steps)
         OU gradua para state 2 (se so tem 1 step)
Easy   → state 2, gradua direto, intervalo = FSRS initial stability
```

**Card em aprendizado (state 1) no step N:**
```text
Again  → state 1, step 0, intervalo = steps[0]
Hard   → state 1, step N (repete), intervalo = avg(steps[N], steps[N+1])
         ou steps[N] * 1.5 se nao houver próximo
Good   → state 1, step N+1, intervalo = steps[N+1]
         OU gradua para state 2 se N é o último step
Easy   → state 2, gradua direto
```

**Card em reaprendizado (state 3):**
- Mesma lógica, mas usa `relearningSteps` em vez de `learningSteps`

### 3. Atualizar interface FSRSParams e FSRSCard
- `FSRSCard` ganha campo `learning_step: number`
- `FSRSOutput` ganha campo `learning_step: number`
- Necessário para propagar step entre agendamentos

### 4. Atualizar submissão de review (src/services/studyService.ts)
- Salvar `learning_step` no card apos cada revisao
- Passar `learning_step` atual para o `fsrsSchedule`

### 5. Atualizar preview de intervalos (FlashCard.tsx)
- Passar `learning_step` do card atual para o `fsrsPreviewIntervals`
- Garantir que os botoes mostrem os intervalos corretos

### 6. Implementar ocultacao de irmãos cloze (Sibling Burying)
- No `fetchStudyQueue` (src/services/studyService.ts):
  - Identificar cards cloze com mesmo `front_content` como irmãos
  - Ao montar a fila, incluir apenas 1 irmão por grupo
  - Os demais ficam "buried" (nao aparecem na sessão)
- No `Study.tsx` apos revisar um card cloze:
  - Remover irmãos da fila local imediatamente
- Adicionar toggle nas configuracoes do deck: "Ocultar irmãos cloze ate o dia seguinte" (ativo por padrao)

### 7. Adicionar config `bury_siblings` no deck
- Nova coluna na tabela decks: `bury_siblings boolean DEFAULT true`
- Toggle nas configuracoes avancadas do deck (src/pages/DeckSettings.tsx)

### 8. Atualizar testes
- Expandir `src/test/fsrs.test.ts` com cenarios de learning steps multi-etapa
- Testar progressao: novo → step0 → step1 → gradua
- Testar Hard usa media dos steps
- Testar Again volta para step 0
- Testar Easy pula todos os steps

## Arquivos a editar
1. Nova migracao SQL (adicionar `learning_step` em cards + `bury_siblings` em decks)
2. `src/lib/fsrs.ts` - Reescrever logica de state 0 e state 1
3. `src/services/studyService.ts` - Salvar learning_step + sibling burying na fila
4. `src/components/FlashCard.tsx` - Passar learning_step ao preview
5. `src/pages/Study.tsx` - Remover siblings da fila apos review
6. `src/pages/DeckSettings.tsx` - Toggle de bury siblings
7. `src/test/fsrs.test.ts` - Novos testes

## Resultado esperado
- Intervalos identicos ao Anki: `<1min | <6min | <10min | 14d` para cards novos com steps [1m, 10m]
- Cards cloze irmãos ocultos automaticamente apos revisar um deles
- Progressao correta pelos learning steps antes de graduar para revisao

