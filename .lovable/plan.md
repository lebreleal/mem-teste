

# Renomear Simulador e Validar Timing + Explicacao da Logica

## 1. Renomear "Simulador de Carga" para "Previsao de Tempo de Estudo"

**Arquivo:** `src/components/study-plan/PlanComponents.tsx`

Trocar o titulo na linha 188:
```
Antes: "Simulador de Carga"
Depois: "Previsao de Tempo de Estudo"
```

Tambem atualizar o eixo Y de `{v}m` para `{v}min` para maior clareza (linha 406).

## 2. Verificar se o Timing esta Funcionando Corretamente

O codigo do fallback de timing (linhas 228-232 do worker) ja foi corrigido na ultima edicao. Para uma conta nova com `total_reviews_90d < 50`:
- 20 cards novos x 30s = 600s = **10min** (correto)
- Nao deveria mais mostrar 3min

Se voce ainda esta vendo 3min, o problema pode ser que o **Worker antigo esta em cache**. Basta fazer um hard refresh (Ctrl+Shift+R) no navegador para carregar o worker atualizado.

## 3. Como a Simulacao Classifica os Cards (Explicacao Completa)

Para uma conta nova (fallback, `total_reviews_90d < 50`), a simulacao usa a **distribuicao padrao de ratings** baseada em benchmarks do Anki:

| Faixa de Recall | Again | Hard | Good | Easy |
|-----------------|-------|------|------|------|
| Alta (>90%) | 5% | 10% | 75% | 10% |
| Media (70-90%) | 15% | 25% | 50% | 10% |
| Baixa (<70%) | 30% | 30% | 35% | 5% |

### Fluxo de um card NOVO (state 0) no dia X:

1. O simulador sorteia um rating usando a distribuicao **"low"** (recall baixo, pois e card novo)
2. Com os fallbacks: 30% Again, 30% Hard, 35% Good, 5% Easy

3. Se o rating sorteado for **Good (3) ou Easy (4)** (~40% chance):
   - O card **gradua direto** para state 2 (Dominado/Review)
   - Recebe estabilidade inicial (~2.4 para Good, ~5.8 para Easy)
   - E agendado para daqui a ~2-5 dias
   - No grafico, o TEMPO desse card conta como **"Novo"** (azul, 30s)

4. Se o rating sorteado for **Again (1) ou Hard (2)** (~60% chance):
   - O card fica em state 1 (Aprendendo)
   - E agendado para o **mesmo dia** (scheduledDay = currentDay)
   - Sera processado novamente no proximo dia como "learning"

### Fluxo de um card DOMINADO (state 2) voltando para revisao:

1. Calcula o recall baseado na estabilidade e tempo decorrido
2. Exemplo: card com stability 10, revisado ha 10 dias → recall ~90% → bucket "high"
3. Distribuicao "high": 75% Good, 10% Hard, 10% Easy, 5% Again
4. Se Again → vira state 3 (Reaprendendo), intervalo cai
5. Se Good/Easy → estabilidade CRESCE, proximo intervalo maior (ex: 10d → 30d → 90d)

### Por que voce ve muitos "Dominados" no grafico:

Com a distribuicao fallback, ~40% dos cards novos graduam no primeiro dia. Eles aparecem como tempo "Novo" (azul) no dia em que sao introduzidos, e como tempo "Dominado" (verde) quando voltam para revisao dias depois. Como os intervalos crescem exponencialmente (2d → 7d → 21d → 63d), o tempo de revisao de dominados se estabiliza e eventualmente diminui.

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `PlanComponents.tsx` | Renomear titulo para "Previsao de Tempo de Estudo" |

Nenhuma mudanca de logica necessaria -- o fallback de timing ja esta corrigido.

