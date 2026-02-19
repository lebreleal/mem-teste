

# Corrigir Logica de Ordem dos Cartoes na Fila de Estudo

## Problemas Identificados

1. **Embaralhar mistura tudo**: Quando ativo, o shuffle embaralha inclusive cartoes em andamento (learning), que deveriam sempre furar a fila quando prontos
2. **Sem prioridade para learning cards**: O `getNextReadyIndex` pega o primeiro card disponivel na lista, sem dar prioridade a cartoes em andamento cujo timer expirou
3. **Scheduled date nao alinha a meia-noite**: Quando o algoritmo agenda para "1d" (amanha), grava o timestamp exato (ex: 22:55 do dia seguinte), em vez de agendar para 00:00 do dia seguinte

## Solucao

### 1. Separar shuffle: so embaralhar new + review, nunca learning

**Arquivo:** `src/services/studyService.ts` (linha 117-118)

Atual:
```javascript
const queue = [...newCards, ...learningCards, ...reviewCards];
return { cards: shuffle ? shuffleArray(queue) : queue, ... };
```

Novo:
```javascript
const nonLearning = [...newCards, ...reviewCards];
const shuffled = shuffle ? shuffleArray(nonLearning) : nonLearning;
// Learning cards go at the beginning (they cut the line when ready)
const queue = [...learningCards, ...shuffled];
return { cards: queue, algorithmMode, deckConfig };
```

Learning cards ficam no inicio da fila. O `getNextReadyIndex` no Study.tsx ja verifica se o timer expirou antes de mostrar.

### 2. Priorizar learning cards prontos no `getNextReadyIndex`

**Arquivo:** `src/pages/Study.tsx` (funcao `getNextReadyIndex`, linha 67-78)

Atual: percorre a lista sequencialmente e retorna o primeiro card pronto (seja new, review ou learning).

Novo: primeiro procurar um learning card (state=1) cujo timer expirou. Se encontrar, retorna ele (fura a fila). Se nao, retorna o proximo new/review na ordem.

```javascript
const getNextReadyIndex = (q) => {
  const now = Date.now();
  // 1) Learning cards com timer expirado furam a fila
  for (let i = 0; i < q.length; i++) {
    if (q[i].state === 1) {
      const scheduledTime = new Date(q[i].scheduled_date).getTime();
      if (scheduledTime <= now) return i;
    }
  }
  // 2) Proximo card new/review na ordem
  for (let i = 0; i < q.length; i++) {
    if (q[i].state === 0 || q[i].state === 2) return i;
  }
  return -1; // todos learning aguardando
};
```

### 3. Alinhar scheduled_date a meia-noite local para intervalos em dias

**Arquivos:** `src/lib/fsrs.ts` e `src/lib/sm2.ts`

Quando o intervalo e em dias (1d, 2d, etc.), o `scheduled_date` deve ser meia-noite local do dia alvo, nao o timestamp exato.

Exemplo: se agora sao 22:55 e o intervalo e 1d, agendar para amanha 00:00:00 (local), nao para amanha 22:55.

Criar funcao utilitaria:
```javascript
function getLocalMidnight(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

Aplicar nos trechos que fazem `scheduledDate.setDate(scheduledDate.getDate() + interval)` quando `interval_days > 0`.

**Nao afeta** learning cards (1min, 15min), que continuam usando timestamp exato.

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/services/studyService.ts` | Separar shuffle: so embaralhar new+review, learning cards ficam no inicio |
| `src/pages/Study.tsx` | `getNextReadyIndex` prioriza learning cards prontos (furam fila) |
| `src/lib/fsrs.ts` | Alinhar `scheduled_date` a meia-noite local quando intervalo e em dias |
| `src/lib/sm2.ts` | Mesma correcao de meia-noite local |

## Comportamento Final

- **Shuffle ON**: new e review aparecem em ordem aleatoria; learning cards furam a fila quando o timer expira
- **Shuffle OFF**: new e review seguem ordem de criacao; learning cards furam a fila quando o timer expira
- **Agendamento 1d as 22:55**: card aparece no dia seguinte a partir de 00:00, nao as 22:55
- **Learning 10min as 22:57**: card fura a fila as 23:07, independente de shuffle

