
## Plano: Melhorar clareza e interpretacao do simulador, dashboard e wizard

### Problemas Identificados

1. **Dashboard "Conclusao estimada"**: O texto do gargalo e confuso - diz "limite de 52 novos cards/dia nao e suficiente" e ao mesmo tempo "tem tempo de sobra (39min/dia)", quando na verdade 39min nao e "de sobra". A explicacao precisa ser reescrita para ser direta e compreensivel.

2. **Simulador (grafico 7d/30d/90d/1ano)**: A interpretacao "precisara estudar em media 1min (5 cartoes/dia)" nao faz sentido para o usuario -- os cards novos acabam rapido (em ~8 dias com 412 cards a 52/dia) e depois a carga cai drasticamente, mas o texto calcula a media incluindo todos os dias quase-vazios. Precisa explicar o que esta acontecendo de forma pedagogica.

3. **Wizard "Meta inviavel"**: Os botoes estao OK mas falta contexto explicativo sobre POR QUE e inviavel e o que cada ajuste realmente muda.

### Solucao

#### 1. Reescrever explicacao do gargalo no Dashboard (StudyPlan.tsx ~1498-1504)

Substituir o texto generico por uma explicacao passo-a-passo clara:

- **Quando gargalo = time**: "Com {avgDailyMin}/dia de estudo, apos revisar os cards pendentes (~{reviewMinToday}min), sobram apenas ~{availMinForNew}min para novos cards. Isso permite ~{cardsFitByTime} novos cards/dia, mas voce precisa de {neededPerDay}/dia para cumprir a meta."

- **Quando gargalo = new_limit**: "Seu limite esta em {budget} novos cards/dia. Para cumprir a meta ate {targetDate}, voce precisaria estudar {neededPerDay} novos cards/dia."

Remover terminologia tecnica como "gargalo" e usar linguagem direta.

#### 2. Melhorar interpretacao do simulador (PlanComponents.tsx ~467-520)

O bloco de resumo precisa ser mais inteligente:

- **Detectar fase de "consumo de novos"**: Calcular quantos dias os novos cards duram (`totalNewCards / newCardsPerDay`) e informar: "Nos primeiros {X} dias, voce estudara em media {Y}min/dia (fase intensa). Apos isso, a carga cai para apenas revisoes (~{Z}min/dia)."

- **Quando carga excede meta**: Alem de oferecer botoes, explicar: "Nos primeiros dias a carga sera alta porque voce esta introduzindo {N} novos cards/dia. Depois de ~{X} dias, a carga se estabiliza."

- **Quando tem data limite**: Adicionar: "Para concluir seus {totalNew} cards novos ate {targetDate}, mantenha ao menos {neededPerDay} novos cards/dia."

- **Resumo contextual por periodo**: Em vez de so media geral, destacar:
  - Dias acima da meta (se houver)  
  - Quando a carga se estabiliza
  - Pico vs. media

#### 3. Wizard - adicionar contexto pedagogico (StudyPlan.tsx ~847-882)

Para cada opcao de resolucao, adicionar uma mini-explicacao:

- "Aumentar para X cards/dia" -> adicionar: "Voce estudara mais cards por dia, terminando em {minDaysNeeded} dias"
- "Mudar data" -> adicionar: "Manter o ritmo atual e dar mais tempo para concluir"  
- "Aumentar tempo de estudo" -> adicionar: "Mais tempo por dia permite encaixar mais cards novos alem das revisoes"

---

### Detalhes Tecnicos

**`src/components/study-plan/PlanComponents.tsx` (linhas 467-520):**
- Calcular `daysOfNewCards = Math.ceil(totalNewInPeriod / currentNewCards)` usando dados do simulador
- Separar o resumo em 2 fases: "fase intensa" (enquanto ha novos) e "fase de manutencao" (so revisoes)
- Usar `data.filter(d => d.newCards > 0).length` para contar dias com novos cards
- Adicionar info de data limite se existir (consultar `plansList` que ja e prop)
- Manter botoes de "Reduzir novos cards" e "Aumentar tempo" quando carga excede meta

**`src/pages/StudyPlan.tsx` (linhas 1498-1504):**  
- Reescrever o bloco de explicacao do gargalo com calculo passo-a-passo
- Mostrar: tempo total -> tempo de revisoes -> tempo restante -> cards que cabem -> cards necessarios
- Remover a palavra "gargalo"

**`src/pages/StudyPlan.tsx` (linhas 851-882, wizard):**
- Adicionar `<span>` descritivo abaixo de cada botao de resolucao
- Calcular e mostrar quanto tempo levaria com cada opcao
