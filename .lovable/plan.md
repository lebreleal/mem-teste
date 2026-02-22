

## Correcao: Media no tooltip baseada na semana visivel

### Problema
O tooltip mostra as medias "Seg-Sex" e "7 dias" vindas do `summary` global (media do ano inteiro = ~11min/dia). Quando o usuario olha a semana S5 que tem 7h1min total, espera ver ~60min/dia, nao 11min.

### Solucao
No componente `SimulatorTooltip`, quando o ponto exibido e uma semana agregada (horizonte > 30d), calcular a media **localmente a partir dos dados daquele ponto** em vez de usar o `summary` global.

### Mudanca

**Arquivo: `src/components/study-plan/PlanComponents.tsx`**

Na funcao `SimulatorTooltip` (linha ~214):

- Detectar se o ponto e uma semana agregada (ex: `d.day` comeca com "S" ou o `date` contem " - ")
- Se for semana agregada:
  - Media 7 dias = `Math.round(d.totalMin / 7)`
  - Media Seg-Sex = `Math.round(d.totalMin / 5)` (aproximacao, pois a semana tem ~5 dias uteis)
- Se for ponto diario: manter o `summary` global normalmente (ou simplesmente nao mostrar medias, ja que e um unico dia)

Logica:

```text
Se ponto e semanal (agregado):
  avg7dias = totalMin / 7
  avgSegSex = totalMin / 5
Senao:
  usar summary global (ou ocultar medias)
```

Isso resolve o problema sem precisar alterar o Worker, o hook ou a estrutura de dados.
