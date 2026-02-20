

# Redesign Visual do PlanDashboard - Cards Horizontais por Baralho

## Resumo

Inspirado no layout de referencia (carrossel horizontal de aulas), redesenhar a secao de baralhos do PlanDashboard para exibir cards horizontais deslizaveis com progresso individual, tempo estimado e acoes rapidas -- adaptado ao contexto de flashcards.

---

## Estrutura Final do Dashboard

```text
+───────────────────────────────────────+
│  Header: "Meu Plano de Estudos"  [⚙] │
+───────────────────────────────────────+
│                                       │
│  [Para estudar]  [Concluidos]         │
│                          Semana: 17-23/02 │
│                                       │
│  Baralhos da semana                   │
│  3 de 5 concluidos                    │
│                                       │
│  ┌──────────┐ ┌──────────┐ ┌────────  │
│  │ Anatomia │ │ Fisiolog │ │ Bioqui  │
│  │          │ │          │ │         │
│  │ 45 cards │ │ 32 cards │ │ 28 car  │
│  │ ⏱ 1h30   │ │ ⏱ 55min  │ │ ⏱ 45m  │
│  │ [══70%══]│ │ [══40%══]│ │ [═20%═  │
│  │          │ │          │ │         │
│  │[Estudar→]│ │[Estudar→]│ │[Estuda  │
│  └──────────┘ └──────────┘ └────────  │
│         ← deslizar →                  │
│                                       │
│  ┌───────────────────────────────────┐│
│  │ Carga de hoje        45min       ││
│  │ [====verde====][amarelo][vermelho]││
│  │ 15min Revisoes + 30min Novos     ││
│  └───────────────────────────────────┘│
│                                       │
│  ┌───────────────────────────────────┐│
│  │ Grafico Semanal (barras)         ││
│  │ Seg Ter Qua Qui Sex Sab Dom     ││
│  └───────────────────────────────────┘│
│                                       │
│  ┌───────────────────────────────────┐│
│  │ Meus Objetivos                   ││
│  │ Data | Retencao | Capacidade     ││
│  └───────────────────────────────────┘│
│                                       │
+───────────────────────────────────────+
```

---

## Mudancas Detalhadas

### 1. Carrossel Horizontal de Baralhos (nova secao principal)

Substituir a lista vertical de "Prioridade dos Baralhos" por um carrossel horizontal deslizavel, similar ao layout de referencia.

**Cada card de baralho mostra:**
- Nome do baralho (titulo em negrito)
- Badges: quantidade de cards novos, cards de revisao
- Tempo estimado (icone relogio + "Est. 1h30")
- Barra de progresso (cards estudados / total)
- Botao "Estudar" (navega para `/study/{deckId}`) + "Pular" (ghost)

**Implementacao:**
- Container com `flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2` e `scrollbar-hide`
- Cada card com `min-w-[260px] max-w-[300px] snap-start` e borda arredondada
- Calcular progresso por deck usando dados de `metrics` (total_new, total_review por deck)
- Como nao temos metricas individuais por deck na RPC atual, usar proporcao: `deckProgress = (totalCards - newCards - reviewCards) / totalCards`

### 2. Tabs "Para estudar" / "Concluidos"

Acima do carrossel, adicionar duas tabs simples:
- **Para estudar**: mostra baralhos com cards pendentes (novos ou revisao)
- **Concluidos**: mostra baralhos onde todos os cards ja foram vistos hoje

Usar estado local `activeTab` com estilo de toggle compacto (botoes outline/default).

### 3. Header da Semana

Linha com "Semana: 17/02 a 23/02" (calculada dinamicamente) ao lado das tabs, similar ao layout de referencia.

### 4. Contador de Progresso

Texto "X de Y baralhos" acima do carrossel indicando quantos ja foram estudados hoje.

### 5. Reorganizar Ordem do Dashboard

Nova ordem das secoes:
1. Tabs + Semana header
2. Carrossel de baralhos (nova secao principal)
3. Hero Card (Carga de hoje + StudyLoadBar) - compactado
4. Grafico semanal (WeeklyCardChart)
5. Card "Meus Objetivos" (data, retencao, capacidade)

O Hero Card e o grafico semanal sao separados em cards distintos para clareza visual.

### 6. Manter Drag-and-Drop via Settings

A reordenacao de prioridade (drag-and-drop) sera movida para dentro do dialog de Settings, pois a ordem no carrossel ja reflete a prioridade (deck_ids). Na tela principal, nao ha mais grip handles -- a ordem segue o plano.

---

## Secao Tecnica

### Arquivo modificado

`src/pages/StudyPlan.tsx` - reescrita da funcao `PlanDashboard`

### Novos imports

Nenhum pacote novo. Usa `flex overflow-x-auto` nativo do CSS (sem Embla/Swiper).

### Calculo de progresso por deck

Como a RPC `get_plan_metrics` retorna totais agregados (nao por deck), o progresso individual sera estimado:

```typescript
// Para cada deck, buscar contagem de cards
const deckCards = allCards.filter(c => c.deck_id === deck.id);
const newCount = deckCards.filter(c => c.state === 0).length;
const reviewCount = deckCards.filter(c => c.state === 2 && new Date(c.scheduled_date) <= new Date()).length;
const totalCount = deckCards.length;
const progressPercent = totalCount > 0 ? Math.round(((totalCount - newCount - reviewCount) / totalCount) * 100) : 0;
```

Alternativa mais simples (sem buscar todos os cards): usar `deck.new_count`, `deck.review_count` e `deck.card_count` que ja existem nos dados dos decks retornados por `useDecks`.

### Estrutura do DeckStudyCard

```typescript
function DeckStudyCard({ deck, avgSecondsPerCard }: { deck: any; avgSecondsPerCard: number }) {
  const navigate = useNavigate();
  const totalCards = deck.card_count ?? 0;
  const newCards = deck.new_count ?? 0;
  const reviewCards = deck.review_count ?? 0;
  const pendingCards = newCards + reviewCards;
  const doneCards = Math.max(0, totalCards - pendingCards);
  const progressPercent = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;
  const estimatedMinutes = Math.round((pendingCards * avgSecondsPerCard) / 60);

  return (
    <div className="min-w-[260px] max-w-[300px] snap-start flex flex-col rounded-xl border bg-card p-4 space-y-3">
      <h4 className="font-semibold text-sm truncate">{deck.name}</h4>
      <div className="flex gap-1.5 flex-wrap">
        {newCards > 0 && <Badge variant="outline">{newCards} novos</Badge>}
        {reviewCards > 0 && <Badge variant="outline">{reviewCards} revisoes</Badge>}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Inicie seu estudo</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> Est. {formatMinutes(estimatedMinutes)}
        </span>
      </div>
      <Progress value={progressPercent} className="h-1.5" />
      <p className="text-[10px] text-muted-foreground">{progressPercent}% concluido</p>
      <div className="flex items-center gap-2 mt-auto">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => navigate(`/study/${deck.id}`)}>
          Estudar
        </Button>
        <Button size="icon" variant="default" className="h-8 w-8 rounded-full shrink-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

### CSS para scrollbar invisivel

Adicionar ao `index.css`:
```css
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
```

### Reordenacao no Settings Dialog

Mover a lista de drag-and-drop para dentro do Dialog de Settings, mantendo o `useDragReorder` hook ja implementado.

