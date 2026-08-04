# Plano: arquitetura de leitura/escrita para navegação e estudo instantâneos

Este plano mantém tudo o que já foi diagnosticado antes (imagens, waterfalls de navegação, invalidações globais) e adiciona a camada que faltava: o problema central não é ajuste fino de query, é **modelo de dados derivado**. Hoje o app recalcula, a cada visita de tela, agregados que deveriam ser mantidos de forma incremental.

## Princípio orientador (Kleppmann, DDIA)

Dados derivados (contadores, estatísticas, filas) não devem ser recomputados sob demanda no caminho de leitura. Eles devem ser mantidos incrementalmente a partir de um log de eventos imutável, e a leitura deve ser apenas uma busca por índice. Aplicando isso ao MemoCards:

- `review_logs` é o **log de eventos** (fonte da verdade, append-only).
- `cards.state/stability/difficulty/scheduled_date` é um **estado materializado** derivado desse log.
- Estatísticas de deck e limites diários são **views derivadas** — hoje recomputadas, deveriam ser incrementais.
- A fila de estudo é uma **projeção de leitura**, que deve ser servida pronta.

## O que a análise profunda revelou

### Problema estrutural 1: agregados recomputados a cada leitura (custo O(coleção inteira))

`get_all_user_deck_stats` roda a cada carregamento de dashboard, matéria e subdeck. Ela varre **todos os cards do usuário** com join em **todos os review_logs**, com subconsultas correlacionadas por deck (`SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id` avaliada por grupo) e um `NOT EXISTS` sobre `review_logs` por card revisado hoje. O custo cresce com o histórico inteiro do usuário, não com o que está sendo exibido. Nenhum índice resolve isso: é recomputação de agregado global em caminho quente.

O mesmo padrão se repete em `build_study_queue`, que recalcula hierarquia raiz, contagem de novos por raiz e histórico do dia em várias CTEs recursivas a cada clique em Estudar.

### Problema estrutural 2: ausência de fronteira CQRS real

Existe a intenção de CQRS (`deckStats.ts` está marcado como "read side"), mas o lado de leitura executa a mesma computação pesada do domínio. Falta uma tabela de leitura desnormalizada e atualizada por escrita.

### Problema estrutural 3: escrita fragmentada e não idempotente

Cada revisão gera escritas separadas: insert em `review_logs`, update em `cards`, update em `profiles`. São três round-trips sem atomicidade. Um retry parcial pode duplicar log ou divergir contadores. As queries lentas mostram exatamente essas três escritas no topo por tempo total acumulado.

### Problema estrutural 4: falta de invariantes explícitas nos limites diários

Os limites diários são recalculados em três lugares (RPC de fila, RPC de stats e agregações no cliente em `useDashboardState` e `MateriaDetail`). Três implementações da mesma regra é a origem das divergências de contagem já observadas e do custo repetido.

### Problemas de caminho crítico já diagnosticados (mantidos)

- Prefetch de imagem só lê `<img src>`; cards de oclusão guardam `imageUrl` em JSON e nunca são pré-carregados.
- `FlashCard` faz um segundo download só para medir dimensões, mesmo quando o JSON já traz `canvasWidth/canvasHeight`.
- `DeckDetail` bloqueia a tela inteira até deck + contagens + primeira página de cards chegarem, mesmo com o deck já presente no cache global.
- Saída do estudo invalida famílias inteiras de queries, disparando refetch em massa na tela de destino.
- Avisos de ref em componentes globais (`Toaster`, `Sonner`, `GlobalLoading`) aparecem em todas as telas.

## Implementação

### Fase 1 — Instrumentar antes de mudar

Medir `EXPLAIN (ANALYZE, BUFFERS)` de `get_all_user_deck_stats`, `get_all_user_card_counts` e `build_study_queue` com dados reais, nos escopos deck, folder e all. Registrar tempo e blocos lidos como linha de base. Nenhuma mudança de esquema entra sem número antes e depois.

### Fase 2 — Caminho crítico do cliente (ganho imediato, risco baixo)

- `extractImageUrls` passa a extrair URLs de HTML **e** do JSON de image occlusion, com deduplicação; testes Vitest para HTML, oclusão, misto, inválido e duplicado.
- Pré-carregar a imagem do card ativo primeiro e depois os próximos 3 cards (regra 1B), em vez de 15.
- Eliminar o download extra de medição quando o JSON já tem dimensões.
- `DeckDetail` renderiza o shell a partir do cache de decks (`initialData`), com skeleton apenas nas regiões dependentes; lista de cards só é buscada quando a aba de cards está ativa.
- Prefetch por intenção (pointerenter/touchstart/focus) nas linhas de matéria e subdeck e no botão Estudar, aquecendo exatamente as query keys do destino.
- Trocar a invalidação global na saída do estudo por invalidação seletiva dos decks afetados.
- Corrigir o contrato de refs dos componentes globais, sem alterar visual.

### Fase 3 — Tabela de leitura derivada e incremental

Criar `deck_daily_stats` (por usuário, deck e dia local UTC-3) contendo contadores de vencidos por estado e de estudados no dia, mantida incrementalmente:

- Trigger em `review_logs` (append) e em `cards` (mudança de estado, criação, exclusão, mudança de deck) aplica deltas.
- A distinção "card novo estudado hoje" passa a ser decidida no momento do evento e persistida, eliminando o `NOT EXISTS` sobre todo o histórico.
- `get_all_user_deck_stats` passa a ler essa tabela por índice em vez de varrer cards e logs.
- Função de reconciliação idempotente para recomputar o dia de um deck a partir do log, usada em backfill e como rede de segurança.
- Backfill inicial e validação comparando saída antiga e nova antes de trocar o caminho de leitura.

Regras de negócio permanecem idênticas: FSRS-6, retenção 0.85, timezone UTC-3, exclusão de arquivados, cards congelados, bury siblings, limite zero filtrando apenas novos.

### Fase 4 — Escrita única, atômica e idempotente

Uma RPC transacional `submit_review` recebe um `review_id` gerado no cliente e executa log + atualização do card + contadores de perfil em uma transação, com `ON CONFLICT DO NOTHING` no log para tornar o retry seguro. A UI continua otimista e não espera a resposta; o retry em background deixa de ter risco de duplicar dados.

### Fase 5 — Fila de estudo como projeção servida

Com os contadores diários já materializados, `build_study_queue` deixa de recalcular hierarquia e histórico: resolve escopo por índice, aplica limites lidos da tabela derivada e retorna a fila. Reescrever apenas os trechos que o `EXPLAIN` confirmar como caros; adicionar somente índices que o plano usar.

### Fase 6 — Unificar a regra de limite diário

Extrair a regra de limites para um módulo puro em `src/lib`, com testes, e usá-la no cliente; o servidor mantém a mesma semântica na tabela derivada. Elimina as três implementações divergentes.

## Validação

- Testes unitários: extração de imagens, regra de limites, seleção de query keys invalidadas.
- Testes de paridade: saída antiga e nova das estatísticas por deck idênticas em cenários com novos, aprendizado, revisão, congelados, arquivados, siblings e limite zero.
- Sessão autenticada em desktop: Dashboard → Matéria → Subdeck → Estudar → três avaliações → voltar, medindo tempo de navegação, tempo até primeiro conteúdo, tempo até primeira imagem e número de requests, em cache frio e quente.
- Reexecutar as consultas lentas e comparar com a linha de base da Fase 1.

## Critérios de aceite

- Estatísticas de deck deixam de escalar com o histórico do usuário: leitura por índice, tempo estável.
- Matéria e subdeck mostram estrutura útil imediatamente, sem spinner de tela cheia.
- Estudar reutiliza a fila prefetched quando disponível; primeiro card sem waterfall.
- Imagem do primeiro card de oclusão aparece junto do texto; próximas 3 já em cache.
- Avaliar continua instantâneo; retry não duplica nem diverge contadores.
- Voltar do estudo não dispara refetch em massa.
- Nenhuma regra de agendamento, limite, timezone ou UI é alterada.

## Ordem de entrega

Fase 1 e 2 primeiro (ganho perceptível sem risco de dados). Fases 3 a 5 em seguida, cada uma com backfill, paridade validada e possibilidade de reverter o caminho de leitura. Fase 6 encerra removendo a duplicação de regra.

## Arquivos e artefatos previstos

- `src/lib/studyUtils.ts` e testes
- `src/pages/Study.tsx`, `src/components/FlashCard.tsx`
- `src/pages/DeckDetail.tsx`, `src/components/deck-detail/DeckDetailContext.tsx`
- `src/components/dashboard/DeckRow.tsx` e pontos de navegação com prefetch
- `src/hooks/useStudySession.ts`, `src/lib/queryKeys.ts`
- `src/services/deck/deckStats.ts`, `src/services/studyService.ts`
- novo módulo puro de limites diários em `src/lib` e testes
- componentes globais com o problema de ref
- migrations Supabase: tabela derivada, triggers, função de reconciliação, `submit_review`, revisão de `get_all_user_deck_stats` e `build_study_queue`
