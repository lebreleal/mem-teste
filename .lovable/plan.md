

# Correcao do Build + Mais Otimizacoes de Performance

## 1. Corrigir erro de build: `@tiptap/pm` no manualChunks

O pacote `@tiptap/pm` nao tem um export "." valido no package.json, entao o Vite/Rollup nao consegue resolve-lo como entry no `manualChunks`. A solucao e simplesmente remover `@tiptap/pm` e `@tiptap/core` da lista de manualChunks.

**Arquivo:** `vite.config.ts`
- Remover `'@tiptap/core'` e `'@tiptap/pm'` do array `vendor-tiptap`

## 2. Lazy load do `PremiumModal` no Dashboard

Esse componente importa `ScrollArea`, `usePremium` e varios icones, mas so aparece quando o usuario clica "Seja Premium". Pode ser lazy loaded.

**Arquivo:** `src/pages/Dashboard.tsx`
- Trocar import estatico por `lazy(() => import(...))`
- Envolver em `<Suspense>`

## 3. Lazy load do `CommunityDeleteBlockDialog` no Dashboard

So aparece em caso raro (quando tenta deletar deck compartilhado). Nao precisa carregar sempre.

**Arquivo:** `src/pages/Dashboard.tsx`
- Trocar import estatico por `lazy(() => import(...))`
- Envolver em `<Suspense>`

## 4. Dynamic import do `docUtils` no `useExamCreateFlow`

Atualmente importa `extractDocumentText` (que puxa JSZip ~90KB) estaticamente. Pode ser dynamic import como ja e feito no `useAIDeckFlow.ts`.

**Arquivo:** `src/hooks/useExamCreateFlow.ts`
- Trocar `import { extractDocumentText } from '@/lib/docUtils'` por dynamic import no ponto de uso

## 5. Dynamic import do `ankiParser` no `ImportCardsDialog`

O `ankiParser` puxa `jszip` (~90KB) e `sql.js` (~400KB). So e usado quando o usuario importa um arquivo .apkg. Pode ser dynamic import.

**Arquivo:** `src/components/ImportCardsDialog.tsx`
- Trocar import estatico de `parseApkgFile` por dynamic import no handler de arquivo Anki

## Resumo das mudancas

| Arquivo | Mudanca |
|---------|---------|
| `vite.config.ts` | Remover `@tiptap/core` e `@tiptap/pm` do manualChunks |
| `src/pages/Dashboard.tsx` | Lazy load PremiumModal e CommunityDeleteBlockDialog |
| `src/hooks/useExamCreateFlow.ts` | Dynamic import de docUtils |
| `src/components/ImportCardsDialog.tsx` | Dynamic import de ankiParser |

## Impacto estimado adicional

- **Corrige o erro de build** imediatamente
- **-90KB** de JSZip removido do bundle do ExamCreate
- **-490KB** de sql.js + jszip removido do bundle do ImportCardsDialog (carrega so quando usuario importa .apkg)
- Dashboard fica ainda mais leve com PremiumModal e CommunityDeleteBlockDialog lazy

