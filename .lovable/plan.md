
# Refatoracao v4.0 - Ecossistema de Estudo Inteligente

## Resumo

Remover o conceito de "Plano Principal" e centralizar a capacidade de estudo no perfil do usuario. Todos os objetivos sao ativos simultaneamente. O carrossel do Dashboard (Inicio) mostra decks de TODOS os objetivos. A previsao de carga e metricas sao consolidadas globalmente.

---

## 1. Migracao de Banco de Dados

Adicionar colunas de capacidade global na tabela `profiles`:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_study_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS weekly_study_minutes jsonb DEFAULT NULL;
```

Adicionar coluna de prioridade na tabela `study_plans` (para drag-and-drop de objetivos):

```sql
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
```

---

## 2. Hook `useStudyPlan.ts` - Capacidade Global + Metricas Consolidadas

Mudancas principais:

- **Buscar capacidade do perfil**: Nova query para `profiles.daily_study_minutes` e `profiles.weekly_study_minutes` (substitui `plan.daily_minutes` como fonte de capacidade).
- **Agregar deck_ids**: Unir `deck_ids` de TODOS os planos, removendo duplicatas. Passar essa lista unificada para `get_plan_metrics`.
- **Metricas globais**: O `computed` (PlanMetrics) passa a usar a capacidade do perfil e a soma de cards de todos os objetivos.
- **Metricas por objetivo**: Nova propriedade retornada - `objectiveMetrics: Map<string, { health, coverage, totalNew, totalReview }>` - calculada dividindo a capacidade proporcionalmente entre objetivos por prioridade.
- **Previsao consolidada**: `forecastData` usa TODOS os deck_ids de todos os objetivos (deduplicados) vs capacidade global.
- **calcImpact multi-objetivo**: Feedback do slider mostra impacto em cada objetivo individualmente (ex: "ENARE ficara em risco").
- **Remover `selectPlan`**: A mutation `selectPlan` (que setava `selected_plan_id`) sera removida.
- **Salvar capacidade no perfil**: Nova mutation `updateCapacity` que faz `profiles.update({ daily_study_minutes, weekly_study_minutes })`.
- **Salvar prioridade**: Nova mutation `reorderObjectives` que atualiza `study_plans.priority` para cada objetivo.
- **Remover query `selected-plan-id`**: Nao e mais necessaria.
- A propriedade `plan` (plano selecionado) sera substituida por `allDeckIds` (uniao deduplicada) e `globalCapacity`.

---

## 3. Pagina `StudyPlan.tsx` - Dashboard Unificado

### Home View (sem PlanDashboard separado):

**Hero Card Global:**
- HealthRing + StudyLoadBar usando metricas consolidadas de TODOS os objetivos vs capacidade global do perfil.
- Remover referencia a `plan` individual. Usar `metrics` global.

**Meus Objetivos:**
- Remover badge "Principal", botao Target/Estrela e `handleSelectPrincipal`.
- Cada card mostra: nome, data limite, dot de saude individual (calculado por objetivo), barra de cobertura individual, grip para drag-and-drop de prioridade.
- Drag-and-drop persiste em `study_plans.priority` via nova mutation.
- Ao expandir um objetivo, mostrar decks com drag-and-drop interno (reordena `deck_ids` dentro do plano).

**Capacidade Diaria Global:**
- Slider altera `profiles.daily_study_minutes` (nao mais `study_plans.daily_minutes`).
- Feedback multi-objetivo: mostra impacto em cada objetivo.
- Opcao "por dia da semana" altera `profiles.weekly_study_minutes`.

**Previsao de Carga:**
- Grafico usa dados consolidados (todos objetivos).

**Baralhos por Objetivo:**
- Mantido como esta, mas com drag-and-drop real dentro de cada objetivo (reordena `deck_ids` no plano).

### Wizard View:
- Step 3 (capacidade) vira informativo: "Sua capacidade global atual e X min/dia" com link para ajustar no dashboard.
- Criar objetivo nao altera mais `selected_plan_id` no perfil.

---

## 4. Dashboard (Inicio) - Carrossel sem "Principal"

### `Dashboard.tsx`:
- Substituir `plan?.deck_ids` por uniao de `deck_ids` de TODOS os planos.
- Mudar de `const { plan, avgSecondsPerCard } = useStudyPlan()` para `const { plans, avgSecondsPerCard, allDeckIds } = useStudyPlan()`.
- Passar `hasPlan={plans.length > 0}` e `planDeckIds={allDeckIds}`.

### `DeckCarousel.tsx`:
- Nenhuma mudanca estrutural necessaria. Ele ja recebe `planDeckIds` como prop e filtra por root ancestor. Agora recebera a uniao de todos os objetivos.

---

## 5. Deletar `PlanDashboard.tsx`

O arquivo `src/components/study-plan/PlanDashboard.tsx` (774 linhas) sera deletado. Toda a logica ja esta consolidada em `StudyPlan.tsx`.

---

## Secao Tecnica - Fluxo de Dados

```text
profiles.daily_study_minutes ──> Capacidade Global (Single Source)
profiles.weekly_study_minutes ──> Capacidade por dia da semana
                                       |
study_plans[] (todos) ──> Uniao de deck_ids (dedup) ──> get_plan_metrics(all_deck_ids)
                                       |
                              Metricas Consolidadas (Hero Card + Forecast)
                                       |
                    +──────────────────+──────────────────+
                    |                                     |
        Por Objetivo (individual)              Previsao 7 dias (consolidada)
        - saude = f(cards_obj, capacity_share)  - revisoes de todos objetivos
        - cobertura = cards_dominados / total   - novos cards alocados por prioridade
        - prioridade = study_plans.priority     - vs capacidade global
```

### Calculo de Saude por Objetivo:
- Para cada objetivo com `target_date`: capacidade_alocada = global * (peso / soma_pesos). Cobertura = capacidade_cards/dia / cards_necessarios/dia.
- Peso = f(proximidade_data, prioridade_manual).
- Verde >= 100%, Amarelo >= 70%, Laranja >= 50%, Vermelho < 50%.

### Arquivos Modificados:
1. **Migracao SQL** - colunas no profiles + priority no study_plans
2. **`src/hooks/useStudyPlan.ts`** - capacidade global, metricas consolidadas, remover selectPlan, novas mutations
3. **`src/pages/StudyPlan.tsx`** - remover "Principal", capacidade global, drag-and-drop persistente
4. **`src/pages/Dashboard.tsx`** - planDeckIds = uniao de todos
5. **`src/components/study-plan/PlanDashboard.tsx`** - DELETAR
6. **`src/components/study-plan/PlanComponents.tsx`** - manter (componentes reutilizaveis)
7. **`src/components/study-plan/constants.ts`** - manter
