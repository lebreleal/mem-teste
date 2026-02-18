

# Otimizacao de Performance do App

## Problemas Identificados

### 1. Erro 404 em rotas diretas (CRITICO)
Quando voce acessa `/dashboard` ou `/turmas` diretamente (nao navegando pelo app), o servidor retorna 404. Isso acontece porque o deploy anterior usava **nginx** sem a configuracao `try_files`, enquanto o deploy atual usa **Caddy** que ja tem isso configurado. Os erros 404 nos logs sao do deploy antigo. O deploy novo com Caddy ja resolve isso.

### 2. Componentes pesados carregando no Dashboard
O `AICreateDeckDialog` e importado diretamente no Dashboard, e ele puxa toda a cadeia:
- `useAIDeckFlow` -> `pdfUtils` (98KB) -> `pdfjs-dist` (331KB)
- `CardReviewStep` -> `RichEditor` (400KB, inclui TipTap inteiro)

Resultado: ~920KB de JS carregam so por abrir o Dashboard, mesmo sem usar nenhuma dessas funcionalidades.

### 3. Icones Lucide fragmentados
Cada icone carrega como arquivo JS separado (~30+ arquivos de 300-600 bytes). Nao e critico mas adiciona latencia por numero de requests.

## Solucao Proposta

### Tarefa 1: Lazy load do AICreateDeckDialog no Dashboard
Trocar o import estatico por `React.lazy()` no `Dashboard.tsx`. O dialog so carrega quando o usuario clica em "Criar com IA".

**Arquivo:** `src/pages/Dashboard.tsx`
- Remover: `import AICreateDeckDialog from '@/components/AICreateDeckDialog'`
- Adicionar: `const AICreateDeckDialog = lazy(() => import('@/components/AICreateDeckDialog'))`
- Envolver o componente em `<Suspense>`

### Tarefa 2: Lazy load do RichEditor
Criar um wrapper lazy para o RichEditor, ja que ele e usado em 4 lugares mas so quando dialogs abrem.

**Arquivo:** `src/components/LazyRichEditor.tsx` (novo)
- Wrapper com `React.lazy` e `Suspense` com fallback de skeleton

**Arquivos atualizados:**
- `src/components/deck-detail/DeckDetailDialogs.tsx`
- `src/components/ai-deck/CardReviewStep.tsx`
- `src/pages/ManageDeck.tsx`
- `src/components/StudyCardActions.tsx`

### Tarefa 3: Lazy load do PdfCanvasViewer
Fazer lazy load nos 2 lugares que importam esse componente.

**Arquivos:**
- `src/components/lesson-detail/LessonDialogs.tsx`
- `src/components/turma-detail/ContentTab.tsx`

### Tarefa 4: Configurar manual chunks no Vite
Agrupar dependencias grandes em chunks separados para melhor cache.

**Arquivo:** `vite.config.ts`
- Adicionar `build.rollupOptions.output.manualChunks` para agrupar:
  - `vendor-react`: react, react-dom, react-router-dom
  - `vendor-tiptap`: todos os pacotes @tiptap/*
  - `vendor-pdf`: pdfjs-dist
  - `vendor-supabase`: @supabase/supabase-js

### Tarefa 5: Lazy load do ImportCardsDialog e CreditsDialog no Dashboard
Esses dois componentes tambem sao importados estaticamente mas so usados quando abertos.

**Arquivo:** `src/pages/Dashboard.tsx`

## Impacto Estimado

| Metrica | Antes | Depois |
|---------|-------|--------|
| JS carregado no Dashboard | ~1.2MB | ~200KB |
| Numero de requests iniciais | 70+ | ~30 |
| Tempo para interatividade | Lento | Significativamente mais rapido |

## Detalhes Tecnicos

- Todos os lazy loads usam `React.lazy()` + `<Suspense>` com fallback minimo
- Os manual chunks no Vite melhoram o cache do browser (vendor muda raramente)
- Nenhuma mudanca de funcionalidade — tudo continua funcionando igual, so carrega sob demanda

