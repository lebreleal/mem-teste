

## Plano: Corrigir sistema de configuracao de estudo (heranca do deck clicado)

### Problema atual

O codigo atual (`fetchStudyQueue` em `studyService.ts`) tem dois bugs principais:

1. **Configuracao do deck clicado nao e respeitada pelos filhos**: Quando voce clica "Estudar" em um deck pai com limite de 20 novos/dia, o sistema busca os stats de CADA sub-deck individualmente e soma os limites, em vez de aplicar o limite global do deck clicado.

2. **Shuffle do deck clicado nao e aplicado globalmente**: Se o pai tem `shuffle_cards = true`, mas um filho tem `shuffle_cards = false`, deveria prevalecer a config do pai (o deck onde voce clicou "Estudar").

3. **DeckStatsCard mostra contagens erradas**: A tela de detalhe do deck (DeckDetailContext) calcula `newCountToday` usando o limite do deck atual, mas nao agrega corretamente considerando que o limite do pai governa todos os filhos.

### Regra correta (resumo)

- **Quem manda e o deck onde o usuario clicou "Estudar"** - sua configuracao (`daily_new_limit`, `daily_review_limit`, `shuffle_cards`, `algorithm_mode`) se aplica a TODOS os cards dos descendentes.
- O deck pai do pai NAO sobrepoe; so vale a config do deck clicado.
- Cards novos (state=0) sao limitados pelo `daily_new_limit` do deck clicado.
- Cards de revisao (state=2, vencidos) sao limitados pelo `daily_review_limit` do deck clicado.
- Se `shuffle_cards = true` no deck clicado, embaralha tudo. Se false, ordem de criacao (`created_at`).

### Mudancas tecnicas

#### 1. `src/services/studyService.ts` - `fetchStudyQueue`

**Problema**: Linhas 71-83 fazem um loop chamando `get_deck_stats` para CADA sub-deck e somam `newReviewedToday` individualmente. Isso e lento (N queries) e errado porque soma limites individuais em vez de aplicar o limite global do deck clicado.

**Solucao**:
- Buscar TODOS os review_logs de hoje para os cards dos `deckIds` em UMA unica query.
- Contar quantos cards novos (que nunca foram revisados antes de hoje) ja foram estudados hoje no total.
- Contar quantos cards de revisao ja foram revisados hoje.
- Aplicar os limites do `deckConfig` (o deck clicado) como teto global.

```text
Antes:
  for (const id of deckIds) {
    const { data: statsData } = await supabase.rpc('get_deck_stats', { p_deck_id: id });
    // soma individual...
  }

Depois:
  // Uma unica query para contar reviews de hoje nos deckIds
  const { data: todayReviews } = await supabase
    .from('review_logs')
    .select('card_id, rating')
    .in('card_id', cardIdsInScope)
    .gte('reviewed_at', todayStart);
  
  // Calcular newReviewedToday e reviewReviewedToday globalmente
  // Aplicar limites do deckConfig (deck clicado)
```

#### 2. `src/components/deck-detail/DeckDetailContext.tsx` - Contagens na tela

**Problema**: Linhas 264-292 calculam stats agregando descendentes mas usando `get_deck_stats` por deck individual (via `fetchAggregatedStats`). Os limites mostrados precisam refletir a mesma logica: o limite do deck atual governa tudo.

**Solucao**:
- Manter a logica atual de `fetchAggregatedStats` que ja agrega stats dos descendentes.
- Garantir que `newCountToday` use `min(new_count_agregado, dailyNewLimit - newReviewedToday_agregado)` onde `dailyNewLimit` vem do deck atual (ja e assim, mas precisamos confirmar que `newReviewedToday` esta agregado corretamente).

#### 3. `src/services/cardService.ts` - `fetchAggregatedStats`

Verificar se esta funcao agrega corretamente os stats de todos os sub-decks somando `new_reviewed_today` globalmente (nao por deck individual).

#### 4. Performance: Eliminar N+1 queries

Substituir o loop de `get_deck_stats` por uma unica query direta que conta:
- Cards com state=0 nos deckIds (novos disponiveis)
- Cards com state=1 nos deckIds (em aprendizado)
- Cards com state=2 e scheduled_date <= now() nos deckIds (revisao)
- Review logs de hoje para esses cards (ja revisados)

Isso reduz de N chamadas RPC para 2 queries simples.

### Resumo das alteracoes

| Arquivo | O que muda |
|---------|-----------|
| `src/services/studyService.ts` | Reescrever `fetchStudyQueue`: eliminar loop N+1, aplicar limites do deck clicado globalmente, respeitar shuffle do deck clicado |
| `src/services/cardService.ts` | Verificar/corrigir `fetchAggregatedStats` para agregar `newReviewedToday` corretamente |
| `src/components/deck-detail/DeckDetailContext.tsx` | Garantir que contagens visuais usam limites do deck atual sobre stats agregados |

### O que NAO muda

- A logica de `submitCardReview` permanece igual (review individual por card).
- A navegacao e rotas permanecem iguais.
- O algoritmo (SM2/FSRS/quick_review) continua sendo determinado pelo deck clicado (ja funciona assim).

