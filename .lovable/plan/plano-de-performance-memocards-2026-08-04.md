# Plano de performance — MemoCards

A análise que você recebeu está essencialmente correta. Abaixo, o que confirmei no projeto agora e o plano ajustado.

## O que verifiquei (fatos, não suposições)

- `dist/index.html` realmente contém `<link rel="modulepreload" href="/assets/vendor-tiptap-*.js">`. O arquivo tem **384 KB** — maior que React (160 KB) e Supabase (216 KB) juntos, e é pré-carregado em toda página, inclusive na landing.
- A causa raiz do preload não é o `index.html` (ele é gerado pelo Vite). É o `manualChunks` estático no `vite.config.ts`: módulos compartilhados (o runtime JSX) caem dentro de `vendor-tiptap`, então o chunk vira dependência da entrada e o Vite injeta o preload sozinho. Remover a linha do HTML à mão não funciona — ela é regerada a cada build.
- `RichEditor` já é lazy (`LazyRichEditor.tsx`). Mas `OcclusionEditor` é importado **estático** em `ManageDeck.tsx:22` e `CardEditorDialog.tsx:6`, e ele puxa Tiptap.
- A RPC `get_dashboard_summary` **não existe** no banco. `submit_review` e `batch_reorder_decks` existem e estão saudáveis.
- `reorder_folders` não existe — `folderService.reorderFolders` (linha 80) faz UPDATE linha a linha.
- `fetchStudyPlanDeckIds` está duplicada em `cardQueries.ts:195` e `studyService.ts:275`.
- `fetchTrialCards` (`uiQueryService.ts:115`) e `fetchCardsForCopy` (`turmaLessonService.ts:207`) não têm `.limit()`.
- `public/` tem 3 MB de PNGs; as fontes vêm do Google Fonts via `@import` na linha 1 do `index.css` (round-trip extra bloqueante).

Uma correção ao texto que você recebeu: a Etapa 1 dele manda apagar a linha do `index.html`. Isso é ineficaz. O conserto real é no `manualChunks`.

## Etapa 1 — Tirar o Tiptap do caminho crítico

- Trocar `manualChunks` de objeto para função, isolando `@tiptap/*` e `prosemirror-*` num chunk próprio e garantindo que `react`, `react-dom`, `react/jsx-runtime` e `scheduler` fiquem em `vendor-react`.
- Tornar `OcclusionEditor` lazy (`React.lazy` + `Suspense` com Skeleton) em `ManageDeck.tsx` e `CardEditorDialog.tsx`. Os `import type` continuam como estão (são apagados na compilação).
- Validar rodando o build e conferindo que `vendor-tiptap` sumiu do `modulepreload` do `dist/index.html`.

Ganho esperado: ~384 KB fora do carregamento inicial de toda rota.

## Etapa 2 — Consolidar o Dashboard

- Criar a RPC `get_dashboard_summary()` (SECURITY DEFINER, filtrando por `auth.uid()`) devolvendo num único JSON: perfil, pastas, decks em formato mínimo (`id`, `name`, `folder_id`, `parent_deck_id`, `sort_order`, contadores new/learning/review) e o resumo de revisões pendentes.
- Em `useDashboardState.ts`, usar essa RPC como fonte primária do carregamento inicial (`staleTime` 2 min) e alimentar o cache de `['decks']`/`['folders']`/`['profile']` com o resultado, para que os hooks existentes continuem funcionando sem refetch.
- `useDecks`, `useFolders` e `useProfile` permanecem intactos para as outras telas.
- Não tocar em Estudo nem em `submit_review`.

## Etapa 3 — Fontes e imagens

- Auto-hospedar Nunito e Inter (`woff2` em `public/fonts/` + `@font-face` com `font-display: swap`), removendo o `@import` do Google Fonts.
- Converter os PNGs acima de 100 KB para WebP (qualidade 85) e atualizar as referências.
- `loading="lazy"` nas imagens abaixo da dobra.

## Etapa 4 — Higiene de dados

- RPC transacional `reorder_folders(updates jsonb)` substituindo o loop de UPDATE; mesmo tratamento para `reorderTurmaFiles` e `reorderTurmaExams`.
- Deduplicar `fetchStudyPlanDeckIds` (manter em `studyService.ts`, reexportar em `cardQueries.ts`).
- `.limit(500)` em `fetchTrialCards` e `fetchCardsForCopy`.

## Sobre Brotli

Não é configurável pelo código nem por mim — depende da CDN do Lovable. Vale abrir ticket, mas o ganho é secundário frente às Etapas 1 e 2.

## Sobre a senha

Concordo com o alerta: troque a senha da conta que você colou no chat.

## Ordem e risco

| # | Etapa | Impacto | Risco |
|---|---|---|---|
| 1 | Isolar Tiptap | Alto (LCP) | Baixo |
| 2 | RPC do Dashboard | Alto (TTI) | Médio |
| 3 | Fontes + imagens | Médio | Baixo |
| 4 | N+1 e limites | Estabilidade | Baixo |

Sugestão: aprovar a Etapa 1 isolada primeiro, medir, e só então seguir para a 2.
