

# Plano: Corrigir e Melhorar StatsPage

## Problemas identificados

### 1. P50/P95/Máx com números quebrados
A função `percentile()` retorna valores decimais (ex: `3.456d`). Precisa arredondar com `Math.round()`.

**Linha 826-828** — Trocar `intervalPercentiles.p50` por `Math.round(intervalPercentiles.p50)` etc.

### 2. Ordenar Respostas e Contagem por maior % no topo
- **Respostas (buttonData)**: Ordenar por `count` decrescente antes de renderizar, assim "Bom" (maior %) fica no topo.
- **Contagem de Cartões (cardCategories)**: Ordenar por `count` decrescente.

### 3. Quick Stats strip — são relevantes esses números?
A imagem mostra: ⚡0 · ✓904 · ❄0. Quando o valor é **zero**, não agrega informação e polui visualmente. Recomendação: **esconder itens com valor 0** ou pelo menos reduzir opacidade, mantendo apenas métricas com valor > 0 visíveis.

### 4. Métricas importantes que ainda faltam

Analisando o que fóruns do Anki e apps como AnkiDroid/FSRS consideram essencial:

- **Taxa de Maturação** — % dos cards que já são maduros (intervalo ≥ 21d) vs total. Mostra progresso geral de aprendizado. Simples: `mature / total * 100`. Muito pedido nos fóruns.
- **Tempo Médio por Card** — `total_minutos / total_revisões`. Ajuda a identificar se está gastando tempo demais por card.
- **Carga Diária Média** — Média de cards revisados nos últimos 7 dias. Diferente do resumo por período, é um indicador rápido de ritmo.

## Alterações

1. **`percentile()` → arredondar**: `Math.round()` nos 3 valores p50, p95, max
2. **`buttonData` e `cardCategories`**: Adicionar `.sort((a, b) => b.count - a.count)` antes de renderizar
3. **Quick Stats strip**: Ocultar itens com valor 0 (filtrar `items` antes do render)
4. **Novas métricas**: Adicionar 3 mini-cards no topo do "Resumo" ou como badges:
   - Taxa de Maturação: `${Math.round(cc.mature / cc.total * 100)}%`
   - Tempo médio/card: calculado de `summaryStats.totalMinutes / summaryStats.totalCards`
   - Carga 7d: média de cards/dia nos últimos 7 dias do dayMap

Todas as alterações em `src/pages/StatsPage.tsx`.

