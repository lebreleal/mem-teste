

# Testes Abrangentes para Logica de Fila de Estudo

## Objetivo

Criar um arquivo de testes `src/test/studyQueue.test.ts` que valida toda a logica de ordenacao e prioridade da fila de estudo, cobrindo os cenarios descritos pelo usuario.

## Cenarios a Testar

### 1. Funcao `getNextReadyIndex` (extraida de Study.tsx para ser testavel)

A funcao `getNextReadyIndex` atualmente esta inline no componente Study.tsx. Para testa-la em isolamento, vamos extrai-la para `src/lib/studyUtils.ts`.

### 2. Testes de Prioridade (learning cards furam a fila)

- Learning card com timer expirado e escolhido antes de new/review cards
- Learning card com timer NAO expirado e pulado (new/review cards passam na frente)
- Multiplos learning cards prontos: o primeiro na lista e escolhido
- Mix: 2 learning (1 pronto, 1 aguardando) + 3 new + 2 review -> retorna o learning pronto
- Todos learning aguardando -> retorna -1
- Fila vazia -> retorna -1

### 3. Testes de Shuffle (so new + review)

- Shuffle ON: learning cards ficam no inicio, new+review sao embaralhados
- Shuffle OFF: ordem e preservada (learning primeiro, depois new+review na ordem original)
- Verificar que learning cards NUNCA sao embaralhados

### 4. Testes de `getLocalMidnight`

- Intervalo de 1 dia as 22:55 -> scheduled_date e amanha 00:00:00
- Intervalo de 2 dias -> scheduled_date e daqui 2 dias 00:00:00
- Horas, minutos e segundos sao sempre 0
- Learning cards (1min, 10min) usam timestamp exato, NAO meia-noite

### 5. Testes de Fluxo Completo (simulacao)

- Card rated "Errei" -> vira learning com timer futuro -> timer expira -> corta fila
- Card dominado rated "Errei" -> perde estado "dominado", vira learning -> corta fila quando pronto
- Sessao com shuffle: new/review aleatorios, learning sempre corta

## Mudancas Tecnicas

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/studyUtils.ts` | Extrair `getNextReadyIndex` como funcao pura testavel |
| `src/pages/Study.tsx` | Importar `getNextReadyIndex` de studyUtils |
| `src/test/studyQueue.test.ts` | Novo arquivo com ~30 testes cobrindo todos os cenarios |

### Exemplo de Testes

```typescript
// Teste: learning card com timer expirado corta a fila
it('learning card with expired timer cuts the line over new/review', () => {
  const queue = [
    { id: '1', state: 0, scheduled_date: new Date().toISOString() },        // new
    { id: '2', state: 2, scheduled_date: pastDate.toISOString() },          // review
    { id: '3', state: 1, scheduled_date: fiveMinutesAgo.toISOString() },    // learning PRONTO
  ];
  expect(getNextReadyIndex(queue)).toBe(2); // learning card corta a fila
});

// Teste: learning card com timer futuro NAO corta
it('learning card with future timer does not cut the line', () => {
  const queue = [
    { id: '1', state: 0, scheduled_date: new Date().toISOString() },        // new
    { id: '2', state: 1, scheduled_date: fiveMinutesFromNow.toISOString() }, // learning AGUARDANDO
  ];
  expect(getNextReadyIndex(queue)).toBe(0); // new card e mostrado
});

// Teste: getLocalMidnight sempre retorna 00:00:00
it('getLocalMidnight returns midnight', () => {
  const result = getLocalMidnight(1);
  expect(result.getHours()).toBe(0);
  expect(result.getMinutes()).toBe(0);
  expect(result.getSeconds()).toBe(0);
});
```

### Fluxo do teste de simulacao completa

```text
1. Fila inicial: [new1, new2, learning1(10min), review1]
2. Shuffle ON -> fila: [learning1, ...shuffle(new1,new2,review1)]
3. getNextReadyIndex -> new/review (learning1 timer nao expirou)
4. Avancar relogio 10 minutos
5. getNextReadyIndex -> learning1 (timer expirou, corta fila)
6. Rate learning1 como "Bom" -> vira review, removido da fila
7. getNextReadyIndex -> proximo new/review na ordem
```

## Resultado Esperado

- 30+ testes automatizados validando cada cenario
- Funcao `getNextReadyIndex` extraida e reutilizavel
- Cobertura completa dos comportamentos: shuffle, prioridade, meia-noite, fluxo de estados

