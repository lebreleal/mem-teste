

# Plano: Reorganizar StatsPage + Adicionar Funcionalidades Essenciais do Anki

## Problemas Atuais
1. Ícone do filtro usa `SlidersHorizontal` — usuário quer **engrenagem** (`Settings2`)
2. Texto "Custom" no filtro está em inglês — deveria ser "Personalizado"
3. Organização das seções pode ser melhorada
4. Faltam funcionalidades essenciais que o Anki oferece

## Funcionalidades Essenciais Faltando (baseado em fóruns do Anki)

1. **Revisões por Dia** — gráfico de barras empilhadas (aprender/jovens/maduros/reaprender) ao longo do tempo. É o gráfico mais icônico do Anki.
2. **Horário de Estudo** — gráfico de barras mostrando revisões por hora do dia (0-23h) + taxa de acerto por hora como linha sobreposta. Ajuda o usuário a identificar seu melhor horário.
3. **Retenção Expandida** — tabela com retenção de cards "Jovens" (intervalo < 21d) vs "Maduros" (intervalo ≥ 21d). Atualmente mostra só um número geral.
4. **Conhecimento Total Estimado** — métrica: `recuperabilidade média × total de cards revisados`. Simples de calcular com dados existentes.

## Alterações Planejadas

### 1. Trocar ícone do filtro
- `SlidersHorizontal` → `Settings2` (engrenagem) no `PeriodFilterIcon`

### 2. Traduzir "Custom" → "Personalizado"
- Na constante `PERIOD_OPTIONS`, trocar `label: 'Custom'` para `label: 'Personalizado'`

### 3. Reorganizar ordem das seções
```text
 1. Quick Stats (streak, cards hoje, revisões, congelados)
 2. Resumo do Período (com filtro ⚙️)
 3. Horas Estudadas (com filtro ⚙️)
 4. Revisões por Dia [NOVO] (barras empilhadas, com filtro ⚙️)
 5. Horário de Estudo [NOVO] (barras por hora + linha de acerto)
 6. Atividade (heatmap)
 7. Retenção (expandida com jovens/maduros)
 8. Respostas (botões)
 9. Contagem de Cartões
10. Conhecimento Total Estimado [NOVO]
11. Intervalos / Estabilidade / Dificuldade / Recuperabilidade
12. Ranking Global
13. Carga Prevista (link)
```

### 4. Novo: Revisões por Dia
- Gráfico de barras empilhadas usando `recharts` `StackedBarChart`
- Categorias: Aprendendo (azul), Jovens (verde), Maduros (roxo), Reaprendendo (vermelho)
- Dados extraídos do `dayMap` existente (já tem `cards` por dia)
- Filtro ⚙️ individual com `usePeriodFilter`
- Agrupa por semana automaticamente se período > 60 dias

### 5. Novo: Horário de Estudo
- Gráfico `ComposedChart` com `Bar` (volume de revisões) + `Line` (taxa de acerto %)
- Eixo X: horas 0-23h
- Requer dados por hora — se o `dayMap` não tiver granularidade horária, adicionar uma query leve ao `get_activity_daily_breakdown` ou criar RPC separada
- Cor primária para barras, cor de sucesso para linha de acerto

### 6. Expandir Retenção
- Manter o número geral atual
- Adicionar tabela abaixo: "Jovens (< 21d)" e "Maduros (≥ 21d)" com % de acerto de cada
- Dados calculados client-side a partir de `intervalDistribution` + `trueRetention` existentes, ou adicionados ao RPC `get_card_statistics`

### 7. Novo: Conhecimento Total Estimado
- Card simples com número grande
- Fórmula: `média da recuperabilidade × cards com pelo menos 1 revisão`
- Dados já disponíveis: `retrievabilityDistribution` (média) e `cardCounts` (total - new)
- Inclui ícone de info explicando o cálculo

### Notas técnicas
- Todas as alterações em `src/pages/StatsPage.tsx`
- Novos imports do recharts: `ComposedChart`, `Line`, `Area` (se necessário)
- Dados horários podem precisar de nova RPC ou campo adicional no `get_activity_daily_breakdown`
- Filtros individuais reutilizam o hook `usePeriodFilter` existente

