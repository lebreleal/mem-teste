# MemoCards — Handoff de Performance (estado em 2026-08-04)

Documento para transferência de workspace. Descreve o que já está feito, o que falta,
e como executar cada passo restante sem quebrar regras de negócio.

---

## 1. Estado atual (CONCLUÍDO)

### Fase 1 — Medição de linha de base
- `EXPLAIN (ANALYZE, BUFFERS)` rodado em `get_all_user_deck_stats`, `get_all_user_card_counts`
  e `build_study_queue`.
- Linha de base: `get_all_user_deck_stats` ≈ **110 ms / ~3.500 blocos** para um único usuário.
  Custo cresce com o histórico total (`review_logs`), não com o que é exibido.
- `pg_stat_statements`: >10.000 chamadas de insert em `review_logs` (média 7,6 ms) e
  update em `profiles` (média 2,8 ms).

### Fase 2 — Caminho crítico do cliente
- `src/lib/studyUtils.ts` → `extractImageUrls` agora extrai URLs de **HTML (`<img src>`)**
  e de **JSON de image occlusion (`"imageUrl": "..."`)**, com dedupe e reset de `lastIndex`.
  Testes em `src/lib/__tests__/extractImageUrls.test.ts`.
- `src/pages/Study.tsx` → prefetch: card ativo com `fetchpriority="high"`, próximos 3 com `low`.
- `src/components/deck-detail/DeckDetailContext.tsx` → `initialData` vindo do cache global de decks.
- `src/pages/DeckDetail.tsx` → shell renderiza imediatamente; contagens e lista resolvem em background.
- `src/hooks/usePrefetchDeck.ts` (novo) + `src/components/dashboard/DeckRow.tsx` →
  prefetch por intenção em `onMouseEnter` / `onTouchStart` / `onFocus`.
- `src/lib/queryKeys.ts` → `invalidateStudyQueries` reduzido (removidos `cards-display`,
  `cards-meta`, `cards-aggregated`, `activity-full`).
- CQRS: `fetchReviewDueCount` e `fetchStudyPlanDeckIds` movidos de `cardMutations.ts`
  para `cardQueries.ts`.

### Fase 3A — Escrita atômica de revisão
- RPC **`submit_review`** criada (migration `20260804071454_*`): grava `cards`,
  `review_logs` e contadores de `profiles` em **uma única transação**, com checagem de posse.
- Contadores incrementados no servidor (`+1` em SQL) — elimina read-modify-write do cliente.
- `src/services/studyService.ts` chama a RPC; `src/hooks/useStudySession.ts` aplica os
  contadores retornados direto no cache do perfil (sem invalidar/refetch por card).
- Resultado: **3 round-trips → 1** por revisão.

**Verificação atual: 453 testes verdes, typecheck limpo.**

---

## 2. O QUE FALTA — próximos passos exatos

### PASSO 1 (prioridade máxima) — Fase 3B: tabela derivada `deck_daily_stats`

Objetivo: eliminar o scan O(histórico inteiro) de `get_all_user_deck_stats`, que roda em
**todo** carregamento de Dashboard, Matéria e Subdeck.

**1.1 — Migration: criar a tabela**
```sql
CREATE TABLE public.deck_daily_stats (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id      uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  stat_date    date NOT NULL,                -- dia local UTC-3 (offset -180 min)
  new_count            integer NOT NULL DEFAULT 0,
  learning_count       integer NOT NULL DEFAULT 0,
  review_count         integer NOT NULL DEFAULT 0,
  reviewed_today       integer NOT NULL DEFAULT 0,
  new_reviewed_today   integer NOT NULL DEFAULT 0,
  new_graduated_today  integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deck_id, stat_date)
);

-- GRANTS OBRIGATÓRIOS (sem eles PostgREST retorna permission denied)
GRANT SELECT ON public.deck_daily_stats TO authenticated;
GRANT ALL    ON public.deck_daily_stats TO service_role;

ALTER TABLE public.deck_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows read" ON public.deck_daily_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_dds_user_date ON public.deck_daily_stats (user_id, stat_date);
```

**1.2 — Triggers incrementais**
- Trigger `AFTER INSERT` em `review_logs`: aplica delta em `reviewed_today` e,
  quando o card era novo no momento do evento, em `new_reviewed_today` /
  `new_graduated_today`. **A decisão "era novo" deve ser tomada no momento do evento
  e persistida** — é isso que remove o `NOT EXISTS` sobre todo o histórico.
- Trigger `AFTER INSERT/UPDATE/DELETE` em `cards`: ajusta `new_count`,
  `learning_count`, `review_count` em mudanças de `state`, criação, exclusão e
  mudança de `deck_id`.
- Usar `INSERT ... ON CONFLICT (user_id, deck_id, stat_date) DO UPDATE SET col = col + delta`.
- Dia local sempre via offset **-180 minutos** (constante `TZ_OFFSET_SP` em `src/lib/dateUtils.ts`).

**1.3 — Função de reconciliação idempotente**
```sql
CREATE FUNCTION public.reconcile_deck_daily_stats(p_user_id uuid, p_deck_id uuid, p_date date)
```
Recomputa a linha a partir de `cards` + `review_logs`. Usada no backfill e como rede de segurança.

**1.4 — Backfill + validação de paridade**
- Rodar a reconciliação para todos os pares (user, deck) do dia corrente.
- **Antes de trocar o caminho de leitura**, comparar linha a linha a saída de
  `get_all_user_deck_stats` (versão antiga) com a leitura da tabela derivada.
  Só trocar quando forem idênticas nos cenários: novos, aprendizado, revisão,
  congelados, arquivados, siblings, limite zero.

**1.5 — Trocar o caminho de leitura**
- Reescrever `get_all_user_deck_stats` para ler `deck_daily_stats` por índice.
- Nenhuma mudança em `src/services/deck/deckStats.ts` deve ser necessária: o contrato
  (`DeckStatsRow`) permanece igual. Se mudar, atualizar `src/types/study.ts` junto.

**Critério de aceite:** tempo estável (~poucos ms) independente do tamanho do histórico;
blocos lidos caem de ~3.500 para dezenas.

---

### PASSO 2 — Fase 5: `build_study_queue` como projeção servida

Com os contadores diários materializados, `build_study_queue` deixa de recalcular
hierarquia raiz, contagem de novos por raiz e histórico do dia em CTEs recursivas.

- Resolver escopo por índice.
- Ler limites diários da tabela derivada.
- **Reescrever apenas os trechos que o `EXPLAIN` confirmar como caros.**
- **Adicionar somente índices que o plano realmente usar.**

---

### PASSO 3 — Fase 6: unificar a regra de limite diário

Hoje a regra existe em **três** implementações divergentes:
1. dentro da RPC `build_study_queue`
2. dentro da RPC de stats
3. no cliente, em `src/components/dashboard/useDashboardState.ts` e `src/pages/MateriaDetail.tsx`

Ação:
- Criar módulo puro `src/lib/dailyLimits.ts` (zero side-effects, zero Supabase) com testes Vitest.
- Consumir esse módulo no cliente nos dois pontos acima.
- Servidor mantém a mesma semântica na tabela derivada.

---

### PASSO 4 — Pendências menores já diagnosticadas

- **`FlashCard.tsx`**: ainda faz um segundo download só para medir dimensões da imagem,
  mesmo quando o JSON de oclusão já traz `canvasWidth` / `canvasHeight`. Usar o JSON quando existir.
- **Avisos de ref**: `Toaster`, `Sonner`, `GlobalLoading` emitem warning de ref em todas as telas.
  Corrigir o contrato de refs **sem alterar classes Tailwind ou visual**.
- **Waterfall residual**: `supabase.from('cards').select('id, deck_id').in('deck_id', deckIds)`
  ainda aparece nos slow logs — origem provável `src/services/uiQueryService.ts` ou
  `src/services/turma/turmaCrud.ts`. Substituir pela RPC `count_cards_by_deck_ids` já existente.
- **Prefetch por intenção**: aplicado só em `DeckRow.tsx`. Falta em linhas de matéria
  (`MateriaDetail`) e no botão **Estudar**.

---

## 3. Invariantes que NÃO podem mudar

- FSRS-6, retenção 0.85. SM-2 removido.
- Timezone UTC-3 (offset -180) em todos os limites e estatísticas.
- Arquivados excluídos da fila e das stats.
- Cards congelados, bury siblings, `daily_new_limit = 0` filtra **apenas novos**
  (reviews continuam aparecendo).
- Deleções via `delete_deck_cascade` e `deleteCardWithReviewLogs`.
- Nenhuma classe Tailwind ou estrutura visual alterada sem pedido explícito.

---

## 4. Como validar qualquer passo

```bash
bunx vitest run     # 453 testes devem continuar verdes
bunx tsgo --noEmit  # typecheck limpo
```

Mais: sessão autenticada em desktop percorrendo
Dashboard → Matéria → Subdeck → Estudar → 3 avaliações → voltar,
medindo tempo de navegação, tempo até primeiro conteúdo, tempo até primeira imagem
e número de requests, em cache frio e quente. Reexecutar as consultas lentas e
comparar com a linha de base da Fase 1.
