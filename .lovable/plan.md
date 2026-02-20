

# Refatoracao do PlanDashboard - Hero Card Unificado + Drag-and-Drop

## Resumo

Reescrever o componente `PlanDashboard` (linhas 392-796 de `src/pages/StudyPlan.tsx`) para criar um dashboard compacto, unificado e de alto impacto visual conforme especificado.

---

## Mudancas no arquivo `src/pages/StudyPlan.tsx`

### 1. Hero Card Unificado (Secao A)

Substituir os elementos separados (HealthRing + StudyLoadBar + botao contextual) por um unico `Card` com gradiente dinamico:

- Fundo: `bg-gradient-to-br from-emerald-50/50 to-white` (green), `from-amber-50/50` (yellow), `from-orange-50/50` (orange), `from-red-50/50` (red)
- Borda sutil colorida: `border-emerald-200/60`, etc.
- Conteudo vertical sem separacoes internas:
  - HealthRing centralizado (mantido como esta)
  - StudyLoadBar logo abaixo, sem card proprio, apenas como elemento inline
  - Botao "Ajustar Plano" / "Resolver Atraso" como rodape do card, visivel apenas quando `needsAttention`

### 2. Card "Meus Objetivos" Compacto (Secao B)

Manter a estrutura atual dos 3 pilares mas:

- Reduzir padding de `p-5` para `p-4`
- O feedback de impacto do slider aparece como banner sutil (`bg-amber-50 text-amber-700 rounded-lg px-3 py-1.5 text-xs`) imediatamente abaixo do slider, nao em card separado
- Integrar sugestoes de cobertura diretamente abaixo da barra de progresso (em vez de card separado de Sugestoes)

### 3. Lista de Baralhos com Drag-and-Drop Real (Secao C)

- Importar `useDragReorder` de `@/hooks/useDragReorder`
- Remover a funcao `handleReorder` manual (setas up/down)
- Remover os botoes `ChevronUp`/`ChevronDown`
- Usar `useDragReorder({ items: planDecks, getId: d => d.id, onReorder })` onde `onReorder` chama `onUpdatePlan({ deck_ids: reordered.map(d => d.id) })`
- Cada item usa `{...getHandlers(deck)}` + icone `GripVertical` como alca visual com `cursor-grab`
- Itens mais compactos: `p-2` em vez de `p-2.5`

### 4. Eliminar Card de Sugestoes Separado (Secao D)

- Remover o card "Sugestoes" separado
- Integrar alertas relevantes:
  - Alerta de consistencia baixa: dentro do Hero Card, como texto pequeno abaixo do HealthRing
  - Alerta de backlog: no botao contextual do Hero Card
  - Alerta de cobertura: inline no card de Metas, abaixo da barra de progresso

### 5. Limpeza de Espacamento

- Container principal: `space-y-3` (era `space-y-5`)
- CardContent: `p-4` (era `p-5`)
- Remover imports nao usados: `ChevronUp`, `ChevronDown`, `Info` (apos remover sugestoes separadas)

### 6. Confirmacao Dupla para Excluir

- No Dialog de Settings, ao clicar "Excluir plano", abrir um `AlertDialog` de confirmacao com texto "Tem certeza? Esta acao nao pode ser desfeita." + botoes "Cancelar" / "Excluir"
- Importar `AlertDialog` components de `@/components/ui/alert-dialog`

---

## Secao Tecnica

### Arquivo unico modificado

`src/pages/StudyPlan.tsx` - reescrita da funcao `PlanDashboard` (linhas 392-796)

### Novos imports necessarios

```typescript
import { useDragReorder } from '@/hooks/useDragReorder';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
```

### Imports removidos

`ChevronUp`, `ChevronDown` (setas de reordenacao manual), `Info` (card de sugestoes)

### Estrutura do Hero Card

```text
+─────────────────────────────────+
│  bg-gradient-to-br (por status) │
│                                  │
│       [HealthRing 128x128]       │
│         "No Caminho"             │
│    "Consistencia: 85%"           │
│                                  │
│  Carga de hoje          45min    │
│  [====verde===][amarelo][verm]   │
│  15min Revisoes + 30min Novos    │
│                                  │
│  [  Ajustar Plano  ] (se alert)  │
+─────────────────────────────────+
```

### Drag-and-Drop na lista

```typescript
const { getHandlers, displayItems } = useDragReorder({
  items: planDecks,
  getId: (deck: any) => deck.id,
  onReorder: async (reordered) => {
    await onUpdatePlan({ deck_ids: reordered.map((d: any) => d.id) });
  },
});

// Render:
{displayItems.map((deck) => {
  const handlers = getHandlers(deck);
  return (
    <div key={deck.id} {...handlers} className={cn("flex items-center gap-2 p-2 rounded-xl border bg-card", handlers.className)}>
      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab" />
      <p className="text-sm font-medium truncate flex-1">{deck.name}</p>
    </div>
  );
})}
```

