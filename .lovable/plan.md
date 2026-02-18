

# Otimizacao de Performance - Round 3 (Queries Paralelas)

## Risco de bugs: MUITO BAIXO

As mudancas sao puramente sobre **ordem de execucao** de queries que ja existem. Nenhuma logica de negocio muda. Os mesmos dados sao buscados, as mesmas variaveis sao preenchidas - so que em paralelo em vez de sequencial. Se uma query falhar, o comportamento de erro continua identico.

## O que NAO vai mudar

- Nenhuma funcionalidade e alterada
- Nenhum componente visual muda
- Nenhuma query e removida ou adicionada
- Os mesmos dados continuam sendo retornados
- O tratamento de erros continua identico

---

## Mudanca 1: Paralelizar queries no `fetchStudyQueue`

**Arquivo:** `src/services/studyService.ts`

Atualmente, apos calcular os `deckIds` e `limitScopeIds`, o codigo faz 2 queries sequenciais (cards + scopeCards) que sao completamente independentes. Vamos roda-las em paralelo com `Promise.all`.

Antes:
```text
cards query -> scopeCards query -> RPC (sequencial)
```

Depois:
```text
[cards query + scopeCards query] -> RPC (paralelo + sequencial)
```

Economia estimada: ~100-300ms

## Mudanca 2: Paralelizar queries no `fetchMissions`

**Arquivo:** `src/services/missionService.ts`

Atualmente faz 5 queries sequenciais. Vamos agrupar:
- Fase 1: `definitions` + `userMissions` em paralelo
- Fase 2: `profile` + `deckCount` + `weeklyCards` em paralelo

Antes:
```text
definitions -> userMissions -> profile -> deckCount -> weeklyCards
```

Depois:
```text
[definitions + userMissions] -> [profile + deckCount + weeklyCards]
```

Economia estimada: ~300-500ms

## Mudanca 3: Lazy load do `ProModelConfirmDialog` no Study

**Arquivo:** `src/pages/Study.tsx`

Esse dialog so aparece quando o usuario tenta trocar para modelo Pro (rarissimo). Pode ser `React.lazy()`.

- Trocar `import ProModelConfirmDialog from ...` por `const ProModelConfirmDialog = lazy(() => import(...))`
- Envolver em `<Suspense fallback={null}>`

Economia: ~5KB removidos do bundle da pagina Study

## Resumo

| Arquivo | Mudanca | Risco |
|---------|---------|-------|
| `src/services/studyService.ts` | `Promise.all` para cards + scopeCards | Zero - mesmas queries, mesmos dados |
| `src/services/missionService.ts` | `Promise.all` em 2 fases | Zero - mesmas queries, mesmos dados |
| `src/pages/Study.tsx` | Lazy load ProModelConfirmDialog | Zero - padrao ja usado no Dashboard |

Nenhuma dessas mudancas altera logica de negocio. Sao puramente otimizacoes de I/O e bundle.

