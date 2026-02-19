

# Corrigir Bug: Learning Card Nao Corta a Fila em Tempo Real

## Problema

A funcao `getNextReadyIndex` esta correta: ela prioriza learning cards com timer expirado. Porem, no componente `Study.tsx`, o `readyIndex` so recalcula quando `localQueue` ou `waitingSeconds` muda.

O countdown (`waitingSeconds`) so roda quando **todos** os cards restantes estao em learning (`allWaiting = true`). Quando ha outros cards new/review na fila, nenhum timer roda, entao quando o learning card de 1 minuto expira, **nada causa um re-render** — o card nunca "fura a fila" ate o usuario responder outro card manualmente.

## Solucao

Adicionar um `useEffect` separado que detecta o proximo learning card com timer futuro e agenda um `setTimeout` para forcar um re-render exatamente quando o timer expira. Isso faz o `readyIndex` recalcular e o learning card aparecer imediatamente.

## Mudanca Tecnica

**Arquivo:** `src/pages/Study.tsx`

Adicionar um novo `useEffect` apos a linha 72:

```typescript
// Force re-render when the soonest learning card's timer expires
// so getNextReadyIndex picks it up immediately (cuts the line)
const [learningTick, setLearningTick] = useState(0);

const readyIndex = useMemo(() => getNextReadyIndex(localQueue),
  [localQueue, waitingSeconds, learningTick]);

useEffect(() => {
  const now = Date.now();
  const learningCards = localQueue.filter(c => c.state === 1);
  const futureTimes = learningCards
    .map(c => new Date(c.scheduled_date).getTime())
    .filter(t => t > now);

  if (futureTimes.length === 0) return;

  const soonest = Math.min(...futureTimes);
  const delay = soonest - now + 100; // +100ms safety margin

  const timer = setTimeout(() => {
    setLearningTick(prev => prev + 1);
  }, delay);

  return () => clearTimeout(timer);
}, [localQueue]);
```

### Como funciona

```text
1. Usuario responde card com "Errei" -> card vira learning com timer 1min
2. Card vai pro final da localQueue com scheduled_date = agora + 1min
3. O novo useEffect detecta esse card futuro e agenda setTimeout para 1min
4. Quando o setTimeout dispara, incrementa learningTick
5. learningTick muda -> readyIndex recalcula via useMemo
6. getNextReadyIndex encontra o learning card com timer expirado
7. O card imediatamente aparece na tela (corta a fila)
```

### Quando a pagina recarrega

Ao recarregar, `fetchStudyQueue` busca do banco os cards com `state = 1` e `scheduled_date` no passado. Eles ja vem na frente da fila (learning cards ficam no inicio). O `getNextReadyIndex` os encontra imediatamente porque o timer ja expirou. Isso ja funciona corretamente.

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/Study.tsx` | Adicionar state `learningTick` + useEffect com setTimeout para forcar re-render quando timer de learning card expira |

## Resultado

- Learning card de 1min corta a fila **exatamente** quando o timer expira, sem precisar de interacao do usuario
- Funciona tanto durante estudo normal quanto apos recarregar a pagina
- Nao afeta a logica existente de countdown quando todos os cards estao em learning

