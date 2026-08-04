# Plano: navegação e estudo com carregamento instantâneo

## Diagnóstico confirmado

- O prefetch atual extrai apenas `<img src="...">`; cards de oclusão guardam `imageUrl` em JSON, então suas imagens não são pré-carregadas. O texto aparece antes e a imagem chega depois.
- A entrada no subdeck espera simultaneamente detalhes do deck, contagens agregadas e a primeira página de cards. Qualquer consulta lenta mantém a tela inteira no spinner.
- Ao abrir um subdeck, detalhes, contagens, cards, vencidos e imagem da sala são solicitados separadamente. Parte desses dados já existe no cache global de decks/pastas.
- Ao sair do estudo, são invalidadas várias famílias globais de queries ao mesmo tempo, causando refetches amplos e lentidão na tela de destino.
- `build_study_queue` faz uma única chamada de rede, mas recalcula hierarquia e histórico diário em múltiplas CTEs. O índice atual de cards está adequado ao filtro principal; o plano da função precisa ser medido antes de qualquer alteração SQL.
- A lista de queries lentas mostra que leituras de IDs de cards por deck ainda chegam a cerca de 706 ms e que a persistência de cada revisão está dividida em múltiplas escritas.
- Há avisos de refs inválidas em componentes globais (`Toaster`, `Sonner` e `GlobalLoading`), que serão corrigidos por serem executados em todas as telas.

## Implementação

### 1. Corrigir o caminho crítico das imagens

- Tornar `extractImageUrls` capaz de extrair URLs tanto de HTML quanto do JSON de image occlusion, com deduplicação.
- Criar testes Vitest cobrindo HTML, JSON de oclusão, conteúdo misto, conteúdo inválido e URLs duplicadas.
- Pré-carregar primeiro a imagem do card ativo e depois somente os próximos 3 cards, conforme a regra de performance do projeto.
- Manter o card ativo como `eager/high` e cards fora da área visível como `lazy/async`.
- Remover o segundo carregamento desnecessário da imagem usado apenas para descobrir dimensões quando o JSON já possui `canvasWidth/canvasHeight`.

### 2. Tornar Parent Deck → Subdeck imediato

- Renderizar o shell do subdeck assim que o deck estiver disponível no cache de `['decks', userId]`, sem aguardar cards e contagens.
- Exibir skeleton apenas nas regiões dependentes (estatísticas e lista), em vez de bloquear a tela inteira.
- Usar os dados globais de deck como `initialData` para a query detalhada e evitar uma espera visual por informação já carregada.
- Não buscar a lista de cards antes da aba de cards estar ativa; ao ativá-la, manter paginação de 100 e busca server-side.
- Reutilizar a URL da imagem já presente no cache de folders e consultar `folder-image` apenas quando ela realmente estiver ausente.

### 3. Prefetch orientado à intenção

- Nos itens de baralho pai e subdeck, iniciar prefetch no toque/ponteiro/foco antes da navegação.
- Aquecer as queries necessárias à próxima tela com as mesmas query keys usadas pelos destinos.
- No botão Estudar, iniciar `build_study_queue` antes da mudança de rota e reutilizar exatamente esse resultado no `useStudySession`.
- Limitar o prefetch à intenção explícita para não sobrecarregar o banco ao renderizar listas grandes.

### 4. Reduzir refetches e duplicação

- Substituir a invalidação global ao desmontar Study por atualização/invalidação seletiva dos decks e contagens afetados.
- Manter a fila concluída fora do cache, mas preservar dados estruturais ainda válidos.
- Migrar bookmarks e metadados auxiliares do estudo para TanStack Query, permitindo cache entre sessões sem bloquear o primeiro card.
- Remover consultas duplicadas de detalhe/contagem quando o cache agregado já satisfizer a tela.

### 5. Otimizar o banco com evidência

- Medir `EXPLAIN (ANALYZE, BUFFERS)` de `build_study_queue` nos escopos deck, folder e all usando dados representativos.
- Reescrever somente os trechos confirmados como caros, preservando integralmente regras de limite, timezone UTC-3, arquivamento e bury siblings.
- Se o plano confirmar varredura repetida de histórico, consolidar os cálculos diários em uma única passagem e adicionar apenas índices usados pelo plano.
- Avaliar uma RPC transacional única para persistir rating + review log + contadores de perfil, reduzindo round-trips e garantindo atomicidade, sem alterar o comportamento otimista da UI.

### 6. Corrigir erros globais e validar

- Corrigir o contrato de refs dos componentes globais sem alterar o visual.
- Adicionar testes para extração/prefetch de imagens e para a seleção das query keys invalidadas ao concluir estudo.
- Executar testes seletivos e validar com sessão autenticada em desktop: Dashboard → Matéria → Subdeck → Estudar → três avaliações → voltar.
- Medir tempo de navegação, tempo até primeiro conteúdo, tempo até primeira imagem e quantidade de requests; repetir em cache frio e quente.

## Critérios de aceite

- Clique em matéria e subdeck apresenta estrutura útil imediatamente, sem spinner de página inteira.
- Clique em Estudar reutiliza fila prefetched quando disponível e mostra o primeiro card sem waterfall adicional.
- A imagem do primeiro card de oclusão aparece junto do conteúdo; as próximas 3 imagens já estão em cache durante a revisão.
- Avaliar um card continua instantâneo e não espera a rede.
- Voltar do estudo não dispara uma tempestade de refetches globais.
- Nenhuma regra FSRS-6, limite diário, bury siblings, timezone, cards arquivados ou UI visual é alterada.

## Arquivos previstos

- `src/lib/studyUtils.ts` e testes correspondentes
- `src/pages/Study.tsx`
- `src/components/FlashCard.tsx`
- `src/pages/DeckDetail.tsx`
- `src/components/deck-detail/DeckDetailContext.tsx`
- componentes de `DeckRow`/navegação que iniciam o prefetch
- `src/hooks/useStudySession.ts`
- `src/lib/queryKeys.ts`
- componentes globais responsáveis pelos avisos de ref
- migration Supabase somente se o plano de execução comprovar ganho