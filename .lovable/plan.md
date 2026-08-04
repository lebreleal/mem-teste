# Performance MemoCards — o que faz sentido do texto e o que já existe

## Resposta curta

Concordo com o **espírito** (WebP, lazy loading, paginação, índices, Optimistic UI), mas o texto que te passaram é genérico e boa parte **já está implementada aqui**. Colar aquele prompt inteiro faria a IA "refazer" coisas prontas e arriscaria regressões.

E sim: fixar regras no **Project Knowledge** (que você já tem, a "Constituição Técnica") é superior a mandar prompt solto no chat. Só que a sua constituição atual já cobre 90% daquilo — falta acrescentar 3 linhas sobre imagens/paginação.

## Auditoria: estado real do projeto

| Recomendação | Situação hoje |
|---|---|
| WebP + compressão automática | Feito — `compressImage` converte tudo para WebP (máx 1200px, 0.5MB) antes do upload |
| Cache agressivo de imagem | Feito — upload com `cacheControl` de 1 ano |
| Lazy loading de imagens | **Parcial** — só em `Turmas` e `CommunityRecommendations`. Imagens dentro do HTML dos cards não têm `loading`/`decoding` |
| Paginação de cards | Feito no deck-detail (RPC paginada + `react-window`). **Falta** em `fetchCards` (usado pelo editor), que ainda varre o deck em blocos de 1000 |
| Virtualização de listas | Feito (`react-window` em CardList e ManageDeckCardList) |
| Índices FSRS | Feito em `cards` (`deck_id, state, scheduled_date`). **Falta** um índice em `review_logs (user_id, reviewed_at)` — usado por streak, heatmap e estatísticas |
| Optimistic UI na revisão | **Falta** — hoje a resposta do card espera o `update` + `insert` no banco. Existe optimistic apenas em reorder de decks/pastas |
| Fila de estudo em 1 round-trip | Feito (RPC `build_study_queue`) |

## O que proponho fazer (só o que falta)

### 1. Latência zero ao responder o card (maior ganho percebido)
- `submitReview` passa a ter `onMutate`: avança para o próximo card imediatamente e grava a escrita em segundo plano, com rollback + toast em caso de erro.
- Fila de escrita: se o usuário responder rápido, as gravações vão em background sem bloquear a UI.

### 2. Imagens
- Injetar `loading="lazy"` + `decoding="async"` em todo `<img>` renderizado a partir do HTML dos cards (no `sanitize.ts`, ponto único — pega estudo, preview, busca, manage-deck de uma vez).
- Exceção: a imagem da **frente do card atual** no estudo continua `fetchpriority="high"` e eager (ela é o LCP).
- Manter o prefetch dos próximos 3 cards já existente para a imagem não "aparecer depois do texto".
- Capas de sala/deck: servir via transformação de imagem do Supabase (largura ~400px, WebP) em vez do original.

### 3. Banco
- Índice `review_logs (user_id, reviewed_at DESC)` para estatísticas/heatmap.
- `fetchCards` (editor) migra para paginação incremental de 50 em 50 via `useInfiniteQuery`, em vez de baixar o deck inteiro.

### 4. Project Knowledge
Acrescentar à constituição, na Lei 1:
- 1F: imagens sempre WebP, `loading="lazy"` + `decoding="async"` obrigatórios fora do viewport inicial.
- 1G: listagens paginadas em 50 itens; proibido carregar deck inteiro em memória.
- 1H: toda ação atômica de revisão usa Optimistic UI com rollback.

## Detalhes técnicos
- `useStudySession.submitReview`: `onMutate` cancela `['study-queue']`, salva snapshot, remove o card; `onError` restaura e dispara toast; sem invalidação por revisão (mantido o comportamento atual de invalidar só na saída).
- `sanitize.ts`: hook pós-sanitização no DOMPurify adicionando os atributos em `img`, com opção `eagerFirstImage` para o card ativo.
- Migração: `CREATE INDEX idx_review_logs_user_reviewed ON public.review_logs (user_id, reviewed_at DESC);`
- Nada de mudança visual: classes Tailwind e layout intactos.

## Fora de escopo
- Thumbnails gerados no upload (mudança de storage) — a transformação on-the-fly do Supabase resolve sem migrar arquivos.
- Materializar contadores por trigger — vale a pena, mas é uma rodada própria, com risco de inconsistência.
