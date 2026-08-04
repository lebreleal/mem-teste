# Auditoria crítica das 4 tarefas + o que realmente vale fazer

## Resposta direta: esse prompt melhoraria o projeto?

Parcialmente. Ele é bem escrito, mas foi gerado sem olhar o código. **Duas das quatro tarefas já estão feitas**, e uma delas, se implementada como está escrita, causaria bug de duplicação de estado. O projeto não está "horrível" — a arquitetura de dados já foi refatorada (RPC única para fila, contagens agregadas no servidor, virtualização, WebP, cache de 1 ano). A lentidão que resta tem causas específicas e diferentes das que o texto supõe.

## Tarefa por tarefa (advogado do diabo)

### Tarefa 1 — Optimistic UI no `submitReview`: JÁ EXISTE, e fazer como pedido quebraria
`Study.tsx` mantém uma **fila local** (`localQueue`) e chama `submitReview.mutate(...)` sem `await`. O card já sai da fila e a tela já avança em 200ms, antes da resposta do banco. Colocar `onMutate` mexendo no cache `['study-queue']` criaria **duas fontes da verdade** (fila local + cache) e é caminho garantido para cards fantasma e contadores errados.

**O que realmente trava a tela** é uma linha só: `isSubmitting={submitReview.isPending || isTransitioning}`. Enquanto o `update` + `insert` no Supabase não voltam, os botões de nota ficam desabilitados. Em rede ruim, é exatamente a sensação de "congelou".

Correção certa (cirúrgica): desacoplar o botão da rede — `isSubmitting` passa a depender só de `isTransitioning`; a escrita vai numa fila de background com retry, e o `onError` mostra toast sem desfazer a fila local (o card já foi respondido; o que falhou foi a persistência, e ela deve ser reenviada, não revertida). Rollback visual aqui seria **pior** UX do que retry silencioso.

### Tarefa 2 — `loading="lazy"` global no `sanitize.ts`: parcialmente correta, com risco
Adicionar `loading="lazy"` + `decoding="async"` via hook do DOMPurify é bom para listas, busca e preview. Mas aplicar isso **também na frente do card ativo do estudo** piora: hoje aquela imagem é `eager` + prefetch, e foi assim que resolvemos a queixa de "a imagem aparece depois do texto". `lazy` em imagem dentro do viewport adiciona uma volta no scheduler do browser.

Correção: hook com parâmetro — `sanitizeHtml(html)` lazy por padrão; `sanitizeHtml(html, { eager: true })` para a face ativa do card em estudo. Prefetch das próximas continua (hoje são 15 cards à frente, não 3 — reduzir para 3 seria regressão).

### Tarefa 3 — Paginação do editor: já paginado; o problema real é outro
`DeckDetailContext` já busca por página (`fetchDescendantCardsPage`, blocos de 200) — não carrega o deck inteiro. Dois defeitos reais, que o prompt não viu:
1. **"Carregar mais" refaz a query do zero** (`limit = displayLimit, offset = 0`): ao chegar em 1000 cards, cada clique rebaixa 1000 linhas de novo. É O(n²).
2. **A busca filtra só o que já foi carregado.** Digitar um termo que está no card 3000 não acha nada — bug silencioso, hoje.

Correção: `useInfiniteQuery` com `offset` real (páginas acumulativas, sem refazer) e, quando há termo de busca, trocar o filtro local por FTS no servidor com debounce. O RPC de FTS **já existe** (`search_user_content`, usado pelo Ctrl+K); dá pra reaproveitar ou criar variante escopada por deck. Sobre "50 em 50": para linhas virtualizadas de ~80px, 50 é pouco e gera muitas idas ao servidor no scroll — recomendo **100** por página com prefetch da próxima.

### Tarefa 4 — Índice: correto e necessário
`review_logs` hoje tem índices em `user_id`, `reviewed_at` e `(user_id, card_id, reviewed_at)`, mas **não** em `(user_id, reviewed_at)` — que é o acesso do heatmap, streak e estatísticas. Único item do prompt 100% válido e sem ressalvas.

## Sobre as regras 1F / 1G / 1H no Project Knowledge

Vou adicioná-las, mas com a redação ajustada para não contradizer o código correto que já existe:
- **1F** — WebP obrigatório no upload; `loading="lazy"` + `decoding="async"` obrigatórios, **exceto** na mídia do card ativo em estudo, que usa `eager` + `fetchpriority="high"`.
- **1G** — proibido carregar deck inteiro em memória; listagens paginadas (100/página) com `useInfiniteQuery` cumulativo; busca em listas paginadas **deve** ser server-side.
- **1H** — ações atômicas de revisão usam Optimistic UI; a fila local do estudo é a **única** fonte da verdade durante a sessão; falha de persistência gera retry em background + aviso, nunca reversão da fila.

## Plano de execução

1. Atualizar o Project Knowledge com 1F/1G/1H na redação acima.
2. `Study.tsx` / `useStudySession.ts`: desbloquear os botões de nota da latência de rede; fila de escrita em background com retry (2 tentativas, backoff) e toast em falha definitiva.
3. `sanitize.ts`: hook do DOMPurify adicionando `loading="lazy"` + `decoding="async"` em `img`, com opção `eager` para a face ativa do estudo; `FlashCard` passa `eager`.
4. `DeckDetailContext`: `useInfiniteQuery` com offset real; busca comuta para FTS server-side com debounce de 300ms quando há termo.
5. Migração do índice:
```sql
CREATE INDEX idx_review_logs_user_reviewed
  ON public.review_logs (user_id, reviewed_at DESC);
```

## Não vou fazer (e por quê)
- `onMutate` mexendo no cache `['study-queue']` — conflita com a fila local e cria bugs de estado.
- Rollback visual do card respondido em erro de rede — retry é a resposta correta.
- Reduzir o prefetch para 3 cards — seria regressão do trabalho de imagens.
- Página de 50 itens — 100 tem melhor relação latência/requisições no scroll virtualizado.

Nada de mudança visual: classes Tailwind e layout ficam intactos.
