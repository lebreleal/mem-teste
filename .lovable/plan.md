
## Adicionar medias de estudo (Seg-Sex e 7 dias) ao resumo do simulador

### O que muda

Atualmente o `SimulatorSummary` so tem `avgDailyMin` (media de todos os dias). Vamos adicionar duas novas metricas:

- **Media Seg-Sex**: media de minutos considerando apenas dias uteis (indices de dia 1-5, segunda a sexta)
- **Media 7 dias**: media de minutos considerando todos os 7 dias da semana

Isso permite que quem nao estuda no fim de semana veja uma media mais realista (Seg-Sex), e quem estuda todos os dias veja a media completa (7 dias).

### Exibicao

Abaixo da mini-legenda do grafico, um bloco compacto com 2 metricas lado a lado:

```text
+----------------------------+----------------------------+
|   Seg-Sex                  |   7 dias                   |
|   ~45min/dia               |   ~38min/dia               |
+----------------------------+----------------------------+
```

Estilo: fundo `bg-muted/50`, texto pequeno (`text-xs`), valores em negrito. Icones de calendario (BriefCase para Seg-Sex, Calendar para 7 dias).

---

### Detalhes tecnicos

**1. Atualizar `SimulatorSummary` em `src/types/forecast.ts`**

Adicionar dois campos opcionais:
- `avgWeekdayMin: number` (media seg-sex)
- `avgAllDaysMin: number` (media 7 dias)

**2. Calcular no worker `src/workers/forecastWorker.ts`**

Na secao de Summary (linhas ~471-488), iterar pelos `points` (dados diarios, antes da agregacao semanal) e separar os dias por dia da semana (usando o indice do dia + `startDate` para determinar o `getDay()`):

- Somar minutos dos dias com `getDay()` entre 1-5 -> dividir pelo count -> `avgWeekdayMin`
- Somar minutos de todos os dias -> dividir pelo count -> `avgAllDaysMin`

**3. Exibir em `src/components/study-plan/PlanComponents.tsx`**

Abaixo da mini-legenda (apos linha ~629), adicionar um grid 2-colunas mostrando as duas medias quando `summary` existe e o chart tem dados. Usar `formatMinutes()` para formatar os valores.
