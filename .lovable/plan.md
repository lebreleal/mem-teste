

## Plano: Redesign do card de visão geral + 3 novos gráficos

### 1. Substituir contadores de estado por métricas do dia (card do topo)

O card atual mostra Novos/Aprendendo/Dominados/Reaprendendo — isso já aparece na seção "Contagem de Cartões" mais abaixo. Vou trocar por:

```text
🔥 12 dias  ·  ✅ 47 revisões  ·  🕐 23 min
```

- **Streak** (Flame) — mantém como está
- **Revisões hoje** (CheckCircle2) — usa `todayCards` já calculado na linha 369
- **Tempo hoje** (Clock) — usa `todayStats?.minutes ?? 0` já disponível no `dayMap`

Remover: 4 botões de estado, 4 dialogs de info, `cardStateCounts` useMemo, imports `SquarePlus`/`Layers`/`RotateCcw`.
Adicionar: 2 botões (revisões + tempo) com dialogs de info simples.

### 2. Novo gráfico: Retenção ao longo do tempo

Gráfico de linha mostrando a taxa de acerto (%) por semana nos últimos meses. Os dados já existem no `dayMap` — cada dia tem `cards` e podemos calcular acerto via `review_logs`. Porém, para precisão real, vou usar os dados da RPC `get_activity_daily_breakdown` que já retorna contagens por estado.

Abordagem simples: agrupar os dados do `dayMap` por semana, e para retenção usar a RPC `get_card_statistics` que já retorna `true_retention`. Para evolução temporal, vou criar uma query adicional que busca taxa de acerto agrupada por semana (últimos 90 dias) — ou alternativamente calcular a partir dos review_logs com uma nova RPC.

**Decisão**: Usar uma nova RPC `get_retention_over_time` que retorna `{week, correct, total}` para os últimos 12-24 semanas. Isso é mais preciso que calcular no cliente.

### 3. Novo gráfico: Cards Adicionados vs Revisados

Gráfico de barras agrupadas mostrando por dia/semana quantos cards foram criados vs quantos foram revisados. Dados de revisão já estão no `dayMap`. Para cards adicionados, preciso buscar `cards.created_at` agrupado por dia.

**Abordagem**: Nova RPC `get_cards_added_per_day` que retorna `{day, count}` para os últimos 90 dias, ou calcular no cliente buscando os `created_at` dos cards.

### 4. Novo gráfico: Tempo médio por card

Linha mostrando a evolução da velocidade (segundos/card) por semana. Indica melhoria de fluência ao longo do tempo.

**Abordagem**: Calcular a partir do `dayMap` existente — `minutes * 60 / cards` por dia, agregado por semana.

### Resumo técnico de mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/pages/StatsPage.tsx` | Redesign card topo, adicionar 3 novos gráficos |
| Nova migration SQL | RPC `get_retention_over_time(p_user_id, p_days)` |
| Nova migration SQL | RPC `get_cards_added_per_day(p_user_id, p_days)` |

### Ordem dos gráficos (final)
1. Card topo: Streak + Revisões hoje + Tempo hoje
2. Resumo (filtro de período)
3. Horas Estudadas
4. Revisões por Dia
5. **Retenção ao longo do tempo** (NOVO)
6. **Cards Adicionados vs Revisados** (NOVO)
7. Horário de Estudo
8. Atividade (heatmap)
9. **Tempo médio por card** (NOVO)
10. Retenção (gauges existentes)
11. Respostas
12. Contagem de Cartões
13. Conhecimento Estimado
14. Intervalos / Estabilidade / Dificuldade / Recuperabilidade
15. Ranking

