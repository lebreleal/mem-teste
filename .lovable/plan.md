
## Refatoracao completa: Simulador de Estudos

### Diagnostico do problema atual

O simulador atual e confuso porque mistura muitas preocupacoes em um unico componente denso:
- Controles de edicao (cards novos/dia, criados/dia, tempo de estudo) misturados com o grafico
- Legenda complexa com tooltip cheio de numeros que nao ajudam o aluno
- Barras empilhadas por "estado" (novos, aprendendo, reaprendendo, dominados) que nao comunicam o progresso real
- O aluno quer saber: **"quando vou terminar?"** e **"to no ritmo certo?"** — nao detalhes de estados FSRS

### O que alunos de Anki realmente valorizam

1. **"Future Due" simplificado**: quantos cards vou revisar por dia no futuro
2. **Projecao de conclusao**: quando vou terminar todos os novos cards
3. **Carga sustentavel**: estou estudando demais ou de menos?
4. **Feedback imediato**: se eu mudar algo, o que acontece?

### Nova arquitetura da secao

A secao sera dividida em **3 blocos visuais claros** em vez de 1 componente monolitico:

```text
+-----------------------------------------------+
|  RESUMO DO PROGRESSO                           |
|  [===========================------]  78%      |
|  312 de 400 cards iniciados                    |
|  Previsao de conclusao: 15/04/2026             |
|  Status: Em dia                                |
+-----------------------------------------------+

+-----------------------------------------------+
|  CARGA DIARIA PREVISTA          [7d|30d|90d]   |
|                                                |
|  [Grafico de barras simples]                   |
|  Eixo Y = minutos                              |
|  Cor unica (gradiente) + linha de capacidade   |
|  Tooltip: "Seg 24/02 - 45min (32 revisoes,     |
|            8 novos)"                           |
|                                                |
|  --- 60min capacidade ---                      |
+-----------------------------------------------+

+-----------------------------------------------+
|  AJUSTES DA SIMULACAO                          |
|  Cards novos/dia:     [10] [editar]            |
|  Cards criados/dia:   [0]  [editar]            |
|  Tempo de estudo:     60min [editar]           |
|  [Aplicar ao meu plano]                        |
+-----------------------------------------------+
```

### Detalhes tecnicos de implementacao

#### 1. Novo componente: `ProgressSummaryCard`

Substitui a legenda confusa. Mostra:
- Barra de progresso total (cards novos ja iniciados / total)
- Data prevista de conclusao (calculada pelo simulador)
- Status simples com cor (emoji + texto)
- Se ha meta: distancia ate a meta vs projecao

Dados vem do `summary` + `totalNewCards` + `data` existentes.

#### 2. Grafico simplificado

**Remover**: barras empilhadas por estado (reviewMin, learningMin, relearningMin, newMin separados).

**Substituir por**: barra unica `totalMin` com gradiente azul. O tooltip mostra o breakdown mas o grafico visual e limpo — uma barra por dia/semana.

- Manter a `ReferenceLine` de capacidade media
- Barras que excedem a capacidade ficam com cor vermelha/laranja
- Tooltip simplificado: data, total de minutos, breakdown resumido em 2 linhas

#### 3. Painel de controles separado

Mover todos os controles editaveis (cards novos/dia, criados/dia, tempo de estudo) para um card separado abaixo do grafico. Isso desacopla a visualizacao da configuracao.

- Layout em lista vertical simples
- Cada controle: label + valor + botao editar
- Botao "Aplicar ao meu plano" permanece no final

#### 4. Arquivos a editar

**`src/components/study-plan/PlanComponents.tsx`** — Refatorar o componente `ForecastSimulator`:
- Extrair `ProgressSummaryCard` (novo sub-componente)
- Simplificar o grafico para barra unica `totalMin`
- Extrair `SimulationControls` (novo sub-componente)
- Simplificar tooltip para 3-4 linhas max
- Remover modais internos de sobrecarga (informacao ja visivel no resumo)

**`src/workers/forecastWorker.ts`** — Nenhuma mudanca na logica de simulacao. Apenas garantir que os dados `totalMin` ja existem (ja existem).

**`src/pages/StudyPlan.tsx`** — Nenhuma mudanca estrutural. O `ForecastSimulatorSection` continua passando os mesmos props. A refatoracao e 100% visual.

#### 5. Novo tooltip do grafico

```text
Seg, 24 de fev
────────────────
45min de estudo
  32 revisoes · 8 novos · 5 aprendendo

Capacidade: 60min ✓
```

Quando excede:
```text
Seg, 24 de fev
────────────────
78min de estudo
  45 revisoes · 20 novos · 13 aprendendo

Capacidade: 60min ⚠ +18min
```

#### 6. Cores do grafico

- Barra normal: `hsl(217 91% 60%)` (azul primario) com opacity 0.8
- Barra sobrecarregada: parte que excede em `hsl(0 84% 60%)` (vermelho)
- Linha de capacidade: pontilhada cinza (mantida)

Implementacao: usar 2 barras empilhadas — `withinCapacity` e `overCapacity` — em vez de 4 estados.

#### 7. ProgressSummaryCard — detalhes

```typescript
// Dados derivados:
const totalNew = totalNewCards;
const studied = totalNew - remainingNew; // cards com state > 0
const pct = totalNew > 0 ? Math.round((studied / totalNew) * 100) : 100;

// Projecao: ultimo dia do simulador onde ainda ha newCards > 0
const lastNewDay = data.findLast(d => d.newCards > 0);
const completionDate = lastNewDay?.date;
```

Exibe:
- Barra de progresso visual (Progress component)
- `312 de 400 cards iniciados (78%)`
- `Conclusao prevista: 15/04/2026` ou `Voce domina tudo ate DD/MM`
- Badge de status: "Em dia" / "Meta apertada" / "Meta inviavel"

### Resumo

| O que muda | Antes | Depois |
|---|---|---|
| Layout | 1 card com tudo | 3 cards separados |
| Grafico | 4 barras empilhadas por estado | 1 barra unica (totalMin) |
| Tooltip | 8+ linhas com detalhes FSRS | 3-4 linhas simples |
| Controles | Misturados no topo do grafico | Card separado abaixo |
| Progresso | Escondido na legenda | Card dedicado no topo |
| Sobrecarga | Modal popup | Cor vermelha na barra |
