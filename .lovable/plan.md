

## Plano: Corrigir simulacao ignorando limite por deck e melhorar legenda

### Problema 1: Simulacao mostra 20 cards novos em vez de 100

**Causa raiz**: No Web Worker (`forecastWorker.ts`, linha 280-283), o codigo faz:
```
const limit = dk.daily_new_limit;  // limite individual do deck (ex: 20)
const toIntroduce = Math.min(remainingNew, limit, available);
```

Isso significa que mesmo com o slider em 100, se o deck tem `daily_new_limit = 20`, so 20 cards sao introduzidos. O slider do simulador deveria ser o limite global, ignorando o limite individual de cada deck.

**Correcao**: Quando o usuario define `newCardsPerDay` no simulador, distribuir proporcionalmente entre os decks sem respeitar o `dk.daily_new_limit`. O limite global do slider e o unico teto.

```typescript
// De:
const toIntroduce = Math.min(remainingNew, limit, Math.max(0, available));
// Para:
const toIntroduce = Math.min(remainingNew, Math.max(0, available));
```

Isso permite que o simulador use exatamente o valor que o usuario definiu (100), distribuindo entre todos os decks disponíveis.

---

### Problema 2: Legenda confusa ao selecionar "Escolher data" com 90d/1h

A legenda usa `currentNewCards` (o valor do slider) para dizer "mantenha ao menos X/dia", mas o grafico mostra um valor diferente (o real que cabe no tempo). Alem disso, quando sobrecarga, o texto e confuso.

**Correcoes na legenda** (`PlanComponents.tsx`):

1. **Usar o valor real da simulacao** em vez do slider: calcular `actualNewPerDay` como a media de `newCards` nos dias com novos do array `data`.

2. **Texto mais claro quando sobrecarregado**: Em vez de "a carga sera alta porque voce esta introduzindo X novos cards/dia", mostrar: "Com X novos/dia, a media fica em ~Y min. Sua capacidade e Z min."

3. **Texto do target mais preciso**: Mostrar quantos dias intensos restam e o ritmo real, nao o do slider.

---

### Detalhes Tecnicos

**`src/workers/forecastWorker.ts` (linha 280-283)**:
```typescript
// Remover o cap de dk.daily_new_limit na simulacao
// O newCardsPerDay ja e o limite global definido pelo usuario
let remainingNew = newCardsPerDay;
for (const [deckId, dk] of deckMap) {
  if (remainingNew <= 0) break;
  const introduced = newCardsIntroducedPerDeck.get(deckId) || 0;
  const available = (newByDeck.get(deckId) || 0) - introduced;
  const toIntroduce = Math.min(remainingNew, Math.max(0, available));
  // ... resto igual
}
```

**`src/components/study-plan/PlanComponents.tsx` (linha ~470-560)**:

1. Calcular o ritmo real da simulacao:
```typescript
const actualNewPerDay = intenseDays > 0
  ? Math.round(daysWithNew.reduce((s, d) => s + d.newCards, 0) / intenseDays)
  : 0;
```

2. No bloco de target (linha ~543), usar `actualNewPerDay` no texto.

3. No bloco de sobrecarga (linha ~557-558), simplificar:
```typescript
// Se sobrecarregado com fase de manutencao:
<>A media na fase intensa e ~{formatMinutes(intenseAvgMin)}, acima da sua capacidade de {formatMinutes(avgCapacity)}. Apos os novos cards, estabiliza em ~{formatMinutes(maintenanceAvgMin)}.</>
```

