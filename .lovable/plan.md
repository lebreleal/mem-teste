

## Simplificação: 3 abas → 2 abas (Home + Perfil)

### Problema atual
O usuário precisa navegar entre 3 telas (Dashboard, Temas, Desempenho) para entender o que fazer. Isso fragmenta a experiência e aumenta a fricção.

### Solução: 2 abas

**Aba 1 — Home (ação)**
Tudo que o usuário precisa fazer, numa única tela com seções empilhadas:

```text
┌─────────────────────────────┐
│  Header (logo + avatar)     │
├─────────────────────────────┤
│  🔥 Streak + Mini Stats    │  ← resumo compacto (streak, cards hoje, XP)
├─────────────────────────────┤
│  🕐 Temas para revisar (X) │  ← seção colapsável dos temas due
│     [Estudar tudo]          │
├─────────────────────────────┤
│  📚 Meus Baralhos           │  ← lista/carousel atual de decks
│     (due badges em cada)    │
├─────────────────────────────┤
│  🎯 Missão do dia           │  ← missão ativa (se houver)
└─────────────────────────────┘
```

**Aba 2 — Perfil (info + gestão)**
Tudo que é consulta, configuração e gestão avançada:

```text
┌─────────────────────────────┐
│  Avatar + Nome + Nível      │
├─────────────────────────────┤
│  📊 Estatísticas detalhadas │  ← heatmap, gráficos (StatsPage atual)
├─────────────────────────────┤
│  🧠 Biblioteca de Temas     │  ← gestão completa de conceitos
│     (editar, importar, etc) │
├─────────────────────────────┤
│  ⚙️ Configurações           │  ← tema, plano, conta
└─────────────────────────────┘
```

### Mudanças técnicas

1. **`BottomNav.tsx`** — Reduzir de 3 para 2 abas: Home (🏠) e Perfil (👤)

2. **`Dashboard.tsx`** — Adicionar 2 novas seções inline:
   - **Mini Stats Strip**: streak + cards revisados hoje + XP (dados já disponíveis via `useStudyPlan` e `useStudyStats`)
   - **Temas Due Section**: reutilizar a lógica do grupo "Para revisar agora" do `ConceptGroupedList`, mas como seção compacta com botão "Estudar tudo"

3. **`Profile.tsx`** — Expandir para incluir:
   - Seção "Estatísticas" (conteúdo migrado do `StatsPage`)
   - Seção "Biblioteca de Temas" (conteúdo migrado do `Concepts.tsx`)
   - Links para configurações existentes

4. **Rotas** — `/conceitos` e `/desempenho` continuam existindo como deep-links mas deixam de ser destinos primários na navegação

### O que NÃO muda
- Toda a lógica de FSRS, estudo, conceitos, diagnóstico continua igual
- Sub-páginas (DeckDetail, Study, ManageDeck, etc.) continuam como estão
- StudyMode e DiagnosticMode continuam sendo modais/overlays lançados de onde estiverem

