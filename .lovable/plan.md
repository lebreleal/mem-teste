
# Corrigir Grafico de Previsao de Carga

## Problema
O grafico atual mostra apenas 2 barras (Revisoes e Novos) e muda a cor de tudo para vermelho/laranja quando ha sobrecarga. Resultado: impossivel distinguir o que e o que. A intensidade por cor "sobrescreve" a identidade de cada tipo de card.

## Solucao: 3 Barras com Cores Fixas + Indicador de Sobrecarga Separado

Seguindo o padrao do Anki e apps de SRS consolidados, cada tipo de card tera sua cor fixa e permanente:

- **Novos** -- Azul (`hsl(217 91% 60%)`) -- cards nunca vistos
- **Aprendendo** -- Laranja/Amber (`hsl(38 92% 50%)`) -- cards em fase de aprendizado (state=1)
- **Revisao** -- Verde (`hsl(152 69% 47%)`) -- cards dominados sendo revisados (state=2)
- **Capacidade diaria** -- Linha tracejada horizontal (ja existe)

A sobrecarga sera indicada de forma separada, sem alterar as cores das barras:
- Uma marca vermelha sutil (ponto ou borda superior) nos dias que ultrapassam a capacidade
- O fundo da coluna fica com um leve tom vermelho quando excede

## Mudancas Tecnicas

### 1. Worker (`src/workers/forecastWorker.ts`)
- Linha 334: Separar `learningMin` em campo proprio em vez de somar com `reviewMin`
- Adicionar `learningMin` ao `ForecastPoint`

### 2. Tipos (`src/types/forecast.ts`)
- Adicionar `learningMin: number` ao `ForecastPoint`

### 3. Grafico (`src/components/study-plan/PlanComponents.tsx`)
- Trocar de 2 barras empilhadas para 3: `newMin`, `learningMin`, `reviewMin`
- Cores fixas por tipo (nunca mudam com sobrecarga)
- Tooltip mostrando os 3 tipos com contagem de cards + minutos
- Legenda clara: quadrado colorido + nome + descricao curta
- Remover a escala de intensidade confusa (ok/leve/pesado/critico)
- Nos dias com sobrecarga, adicionar um pequeno indicador vermelho no topo da barra (marcador sutil)

### 4. Legenda simplificada
```
[azul] Novos (cards nunca vistos)
[laranja] Aprendendo (em fase de memorizacao)
[verde] Revisao (cards dominados)
[--- tracejado] Capacidade diaria
```

### 5. Tooltip melhorado
Ao passar o mouse em uma barra:
```
Seg 24/02
  12 novos -- 6min
  8 aprendendo -- 2min
  45 revisoes -- 6min
  Total: 14min / 30min capacidade
```
