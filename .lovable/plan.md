

## Plano: Melhorar clareza da conclusao, gargalo, grafico e remover icones coloridos

### 1. Remover emojis coloridos do status (HEALTH_CONFIG)

No arquivo `src/components/study-plan/constants.ts`, substituir os emojis coloridos (🟡, 🟠, 🔴) por icones de texto simples consistentes:
- green: "✓" (ja esta ok)
- yellow: "!" (em vez de 🟡)  
- orange: "!!" (em vez de 🟠)
- red: "⚠" (em vez de 🔴)

### 2. Botao combinado "Aplicar ambos" quando meta esta em risco

No `src/pages/StudyPlan.tsx` (secao "Conclusao estimada", linhas ~1488-1527), quando `willMissTarget`:
- Manter os 2 botoes individuais mas adicionar um **terceiro botao combinado**: "Aplicar ambos (X cards + Ymin/dia)" que ajusta cards E tempo simultaneamente
- Remover o texto confuso "Seu gargalo e o..." e substituir por uma explicacao direta e simples:
  - Se gargalo for `new_limit`: "Seu limite de **X novos cards/dia** nao e suficiente. Voce tem tempo de sobra (**Ymin/dia**), mas precisa estudar mais cards."
  - Se gargalo for `time`: "Seu tempo de **Xmin/dia** nao e suficiente. Apos as revisoes, cabem apenas **~Y novos cards/dia**."
- Cada botao individual tera descricao clara do que muda: "Manter tempo atual (Xmin) e aumentar cards para Y/dia" vs "Manter cards atual (X/dia) e aumentar tempo para Ymin/dia"

### 3. Melhorar interpretacao do grafico de previsao

No `src/components/study-plan/PlanComponents.tsx` (linhas ~467-493), melhorar o bloco de resumo/interpretacao abaixo do grafico:
- Quando `!isBelowCapacity` (carga excede meta), alem do aviso generico, oferecer **solucoes concretas** com botoes:
  - "Reduzir novos cards/dia" com botao para abrir configuracoes
  - "Aumentar tempo de estudo" com botao para abrir configuracoes
- Quando `isBelowCapacity`, manter texto positivo atual
- Adicionar informacao sobre data limite se existir: "Para cumprir sua meta ate DD/MM, voce precisa manter esse ritmo."

### 4. Wizard de edicao de planos

Na secao `feasibilityBlock` (linhas ~837-866), a informacao ja esta boa. Garantir que o texto "em Meu Plano -> Configuracoes" aponte para a acao correta e incluir botoes diretos para ajustar (em vez de apenas texto orientador), similar ao que ja existe na conclusao estimada.

---

### Detalhes Tecnicos

**`src/components/study-plan/constants.ts`:**
- Alterar `emoji` de yellow para `'!'`, orange para `'!!'`, red para `'⚠'`

**`src/pages/StudyPlan.tsx` (linhas ~1462-1555):**
- Reescrever bloco de gargalo com texto mais claro e direto
- Adicionar terceiro botao "Aplicar ambos" que chama `updateNewCardsLimit` + `updateCapacity` em sequencia
- Cada botao individual explicar o que mantem e o que muda

**`src/components/study-plan/PlanComponents.tsx` (linhas ~467-493):**
- Adicionar botoes de acao no bloco de interpretacao quando carga excede meta
- Repassar props `updateCapacity` e callbacks para ajuste de novos cards (ja recebe `updateCapacity` como prop do `ForecastSimulatorSection`)

**`src/pages/StudyPlan.tsx` (wizard, linhas ~837-866):**
- Adicionar botoes de acao rapida nas 3 opcoes de resolucao (aumentar cards, mudar data, aumentar tempo) em vez de apenas texto
