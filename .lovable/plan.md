
# Corrigir Parametros FSRS-6 e Bug de Learning Step no Preview

## Problemas encontrados

### 1. Bug: MultipleChoiceCard hardcoda `learning_step: 0`
Em `FlashCard.tsx` linha 243, o preview de intervalos do card de multipla escolha ignora o `learningStep` real do card:
```typescript
// ERRADO (linha 243):
const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate, learning_step: 0 };
// CORRETO (como ja esta na linha 619 do card basico):
const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate, learning_step: learningStep };
```
Isso faz com que cards de multipla escolha em `learning_step: 1` mostrem intervalos errados (como se ainda estivessem no step 0).

### 2. Learning steps padrao no banco: `['1m', '15m']` vs Anki `['1m', '10m']`
O banco de dados tem default `['1m', '15m']` mas o Anki usa `[1m, 10m]` como padrao. Isso causa intervalos diferentes dos screenshots do Anki (Hard mostra ~8min em vez de ~5.5min, Good mostra 15min em vez de 10min).

### 3. `DEFAULT_FSRS_PARAMS.requestedRetention` ainda e `0.9`
No codigo `src/lib/fsrs.ts` linha 57, o default hardcoded ainda e `0.9`. Embora o deck config sobreponha com `0.85`, qualquer chamada sem config explicito usa 90% em vez de 85%.

### 4. `Again` em learning halving stability (`s * 0.5`)
Na linha 198, quando um card em aprendizado recebe "Again", a estabilidade e cortada pela metade. No Anki com FSRS, a estabilidade NAO muda durante os learning steps - ela so e recalculada quando o card gradua ou entra em revisao. O mesmo problema ocorre na linha 230 (same-day review Again).

### 5. Same-day review Again usa `s * 0.5` em vez de `nextForgetStability`
Na linha 230, um card de revisao revisado no mesmo dia com "Again" deveria usar `nextForgetStability()` (a formula oficial do FSRS) em vez de simplesmente cortar pela metade.

## Plano de correcao

### Arquivo 1: `src/lib/fsrs.ts`
- Linha 57: Mudar `requestedRetention: 0.9` para `0.85`
- Linha 198: Remover `Math.max(s * 0.5, 0.1)` e manter a estabilidade original `s` no Again durante learning
- Linha 230: Substituir `Math.max(s * 0.5, 0.1)` por `nextForgetStability(w, card.difficulty, card.stability, 1)` no same-day Again

### Arquivo 2: `src/components/FlashCard.tsx`
- Linha 243: Trocar `learning_step: 0` por `learning_step: learningStep ?? 0` (precisa receber a prop, ja existe como `learningStep` na interface do componente - verificar se o MultipleChoiceCard recebe)

### Arquivo 3: Migracao SQL
- Atualizar default de `learning_steps` de `['1m', '15m']` para `['1m', '10m']` na tabela decks
- Atualizar decks existentes que ainda usam `['1m', '15m']` para `['1m', '10m']`

### Arquivo 4: `src/test/fsrs.test.ts`
- Teste 16 (linha 156): Ajustar expectativa - Again em learning nao deve mais reduzir stability
- Teste 22 (linha 198): Ajustar - stability nao deve mais reduzir com Again repetido em learning

## Resultado esperado
- Intervalos para cards novos com steps [1m, 10m]: `1min | ~5.5min | 10min | Xd` (identico ao Anki)
- MultipleChoiceCard mostra intervalos corretos quando em learning step > 0
- Again em learning mantem a estabilidade (nao halve), como no Anki
- Same-day Again usa a formula oficial de forget stability
- Retencao padrao alinhada a 85% em todo o sistema
