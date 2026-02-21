

# Corrigir Alocacao de Cards Novos: Unificar Logica e Eliminar Divergencias

## Problema Central

A logica de alocacao de cards novos por dia esta DUPLICADA em dois arquivos independentes:
- `src/hooks/useStudyPlan.ts` (calcula para exibicao no dashboard/plano)
- `src/services/studyService.ts` (calcula para a fila de estudo real)

Esses dois caminhos usam fontes de dados diferentes (RPC `get_all_user_deck_stats` vs query direta na tabela `cards`) e podem divergir, causando o bug onde o display mostra um numero mas a fila entrega outro.

## Dados Verificados

**Perfil 06cfa099** (Histologia + Fisiopatologia):
- Budget global: 50 cards/dia
- Histologia (root a9c13602): 243 cards novos
- Fisiopatologia (root b651b080): 320 cards novos
- Alocacao esperada: ~22 Histo + ~28 Fisiopato = 50

**Perfil 73ac68a8** (Psiquiatria + Urgencia + Ginecologia):
- Budget global: 40 cards/dia
- Psiquiatria: 90 novos, Urgencia: 8 novos, Ginecologia: 325 novos
- Alocacao esperada: ~9 + ~2 + ~29 = 40

## Solucao: Extrair Logica Compartilhada

### Passo 1: Criar funcao pura de alocacao em `src/lib/studyUtils.ts`

Extrair a logica de alocacao proporcional para uma funcao pura reutilizavel:

```text
function computeNewCardAllocation(params: {
  globalBudget: number;
  plans: { id: string; deck_ids: string[]; target_date: string | null; priority: number }[];
  newPerRoot: Record<string, number>;  // cards novos por root ID
  findRoot: (id: string) => string;
}): { perDeck: Record<string, number>; perPlan: Record<string, number> }
```

Esta funcao:
- Recebe dados ja processados (sem dependencia de Supabase)
- Calcula pesos por root (urgencia = remaining / daysLeft)
- Distribui budget proporcionalmente com piso minimo de 5%
- Deduplica roots compartilhados entre planos (globalClaimedRoots)
- Retorna tanto alocacao por deck (root) quanto por plano

### Passo 2: Atualizar `useStudyPlan.ts`

Substituir a logica inline (linhas 322-390) pela chamada da funcao compartilhada, passando `perDeckNewCounts` do RPC.

### Passo 3: Atualizar `studyService.ts`

Substituir a logica inline (linhas 152-219) pela mesma funcao compartilhada, passando `newPerRoot` da query direta. Garantir que:
- `expandedPlanDeckIds` inclui roots dos deck IDs do plano (nao apenas descendentes)
- A contagem de cards novos agrega corretamente por root incluindo o proprio root

### Passo 4: Corrigir contagem de cards novos no `studyService.ts`

Bug sutil: quando o plano seleciona sub-decks mas NAO o root, a `expandedPlanDeckIds` (linha 144-150) expande a partir de `allPlanDeckIds` sem incluir os roots. Isso faz com que cards diretamente no root nao sejam contados no `newPerRoot`.

Correcao: ao expandir para contagem, incluir tambem os roots dos IDs do plano:

```text
const expandedPlanDeckIds = new Set<string>();
for (const id of Array.from(allPlanDeckIds)) {
  expandedPlanDeckIds.add(id);
  // Incluir root ancestor para contar cards no root
  const rootId = findRootAncestorId(allDecks ?? [], id);
  expandedPlanDeckIds.add(rootId);
  // Incluir descendentes
  const descs = collectDescendantIds(allDecks ?? [], id);
  for (const d of descs) expandedPlanDeckIds.add(d);
}
```

## Resumo de Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/studyUtils.ts` | Adicionar `computeNewCardAllocation()` - funcao pura compartilhada |
| `src/hooks/useStudyPlan.ts` | Substituir logica inline pela funcao compartilhada |
| `src/services/studyService.ts` | Substituir logica inline pela funcao compartilhada + fix da expansao de IDs |

## Resultado Esperado

1. Display e fila de estudo usam EXATAMENTE a mesma logica de alocacao
2. Qualquer perfil com qualquer combinacao de objetivos/decks/subdecks recebe alocacao consistente
3. Budget global sempre respeitado (soma das alocacoes = daily_new_cards_limit)
4. Correcoes aplicadas uma unica vez na funcao compartilhada beneficiam ambos os caminhos
