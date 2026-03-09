

# Plano: Nova Aba "Desempenho" no Menu Inferior

## Resumo

Substituir "Perfil" por "Desempenho" no BottomNav e criar uma página completa de estatísticas no estilo Anki, com calendário de atividade, distribuição de cards, intervalos, estabilidade, dificuldade, retenção verdadeira, botões de resposta e carga prevista.

## Arquitetura

```text
BottomNav: Início | IA | Desempenho (BarChart3)
                              ↓
                    /desempenho (nova rota)
                              ↓
              ┌───────────────────────────────┐
              │  Calendário de Atividade       │ (reutiliza lógica do ActivityView)
              │  Resumo do Mês                 │ (X de Y dias, total revisões, média)
              │  Contagem de Cartões           │ (novos/aprendendo/reaprendendo/recentes/maduros/congelados)
              │  Intervalos de Cartões         │ (histograma + percentis p50/p95/max)
              │  Estabilidade                  │ (distribuição: atraso previsto 90% recall)
              │  Dificuldade                   │ (distribuição 1-10)
              │  Recuperabilidade              │ (distribuição atual)
              │  Retenção Verdadeira           │ (acertos/total últimos 30d)
              │  Botões de Resposta            │ (contagem Errei/Difícil/Bom/Fácil)
              │  Carga Diária Prevista         │ (gráfico do forecast worker)
              └───────────────────────────────┘
```

## Mudanças

### 1. BottomNav (`src/components/BottomNav.tsx`)
- Substituir `User`/Perfil por `BarChart3`/Desempenho apontando para `/desempenho`

### 2. ProtectedRoute (`src/components/ProtectedRoute.tsx`)
- Adicionar `/desempenho` ao `showNavRoutes`

### 3. Nova RPC SQL: `get_card_statistics`
Uma única RPC que retorna tudo que a página precisa a partir de `cards` e `review_logs`:

- **card_counts**: contagem por estado (0=novo, 1=aprendendo, 2=revisão, 3=reaprendendo) + maduros (state=2, stability>=21d) vs recentes (state=2, stability<21d) + congelados (cards com scheduled_date > 1 ano no futuro, se houver)
- **interval_distribution**: array de intervalos em dias de todos cards state=2 (para histograma) + percentis p50, p95, max
- **stability_distribution**: array de estabilidades de cards state=2
- **difficulty_distribution**: array de dificuldades de cards state=2
- **retrievability_distribution**: calculado via FSRS: R = (1 + elapsed/stability * 19/81)^-0.5 para cada card state=2
- **true_retention**: COUNT(rating>=2) / COUNT(*) dos review_logs state=2 últimos 30d
- **button_counts**: COUNT por rating (1,2,3,4) dos review_logs últimos 30d
- **month_summary**: dias estudados no mês atual, total revisões no mês, média revisões/dia

### 4. Novo hook: `src/hooks/useCardStatistics.ts`
Chama a RPC e mapeia para tipos TypeScript.

### 5. Nova página: `src/pages/StatsPage.tsx`
Seções com scroll vertical, usando Cards e gráficos do Recharts:

- **Calendário**: Reutiliza a mesma lógica da RPC `get_activity_daily_breakdown` (já existe)
- **Resumo do mês**: 3 cards em grid (dias estudados X/Y, total revisões, média/dia)
- **Contagem de cartões**: Barra horizontal com cores por categoria + quantidade e %
- **Intervalos**: BarChart (histograma) + badges p50/p95/max
- **Estabilidade**: BarChart com faixas (0-7d, 7-30d, 30-90d, 90-365d, >365d)
- **Dificuldade**: BarChart 1-10
- **Recuperabilidade**: Gauge ou distribuição
- **Retenção verdadeira**: Número grande com barra de progresso
- **Botões de resposta**: 4 barras coloridas (Errei=vermelho, Difícil=laranja, Bom=verde, Fácil=azul)
- **Carga prevista**: Integra o `useForecastSimulator` e exibe o AreaChart de carga (como já existe no StudyPlan)

### 6. Rota no App.tsx
Adicionar `/desempenho` -> `StatsPage`

## Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/components/BottomNav.tsx` | Editar: trocar Perfil por Desempenho |
| `src/components/ProtectedRoute.tsx` | Editar: adicionar `/desempenho` |
| `src/App.tsx` | Editar: adicionar rota |
| Nova migration SQL | Criar RPC `get_card_statistics` |
| `src/hooks/useCardStatistics.ts` | Criar hook |
| `src/pages/StatsPage.tsx` | Criar página completa |

