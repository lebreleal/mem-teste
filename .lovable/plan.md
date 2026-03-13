

## Plano: Edição de Conceitos + Reuso Inteligente pela IA (sem injeção massiva)

### Problema Atual
1. **EditQuestionDialog** edita apenas enunciado e alternativas -- sem conceitos
2. `generate-questions` e `ai-tutor` **não reutilizam** conceitos existentes (apenas `parse-questions` faz)
3. Injetar 100k conceitos no prompt é inviável (custo + limite de tokens)

### Solução para Reuso: Busca Semântica por Deck (não injeção total)

Em vez de injetar TODOS os conceitos do usuário, a estratégia é:

1. **No edge function**: buscar apenas conceitos **já vinculados a cards do mesmo deck** (via `question_concepts` → `deck_questions` → `deck_id`). Isso limita a ~50-200 conceitos relevantes por deck
2. **Fallback**: se o deck não tem conceitos prévios, buscar os top 100 conceitos mais usados do usuário (`ORDER BY correct_count + wrong_count DESC LIMIT 100`)
3. **Mesmo padrão do `parse-questions`**: injetar a lista curta no prompt com instrução de reutilizar

Isso garante relevância contextual sem explodir custos.

### Mudanças

#### 1. EditQuestionDialog — adicionar seção de conceitos

Expandir o dialog existente (linha 2106) com:
- Estado `concepts` (string[]) e `explanation` (string) inicializados do `question`
- **Chips removíveis** para conceitos atuais (X para remover)
- **Input de busca** que consulta `global_concepts` do usuário (debounced, `ilike` no nome, limit 20)
- Dropdown de sugestões com badge "Meu" ou texto livre "Criar novo"
- Campo de **explicação** (Textarea) editável
- Ao salvar: atualiza `deck_questions.concepts`, `deck_questions.explanation`, e chama `linkQuestionsToConcepts` para sincronizar `question_concepts`

#### 2. Reuso inteligente nos Edge Functions

**`generate-questions/index.ts`**:
- Antes de chamar a IA, buscar conceitos do deck: `SELECT DISTINCT gc.name FROM question_concepts qc JOIN global_concepts gc ON gc.id = qc.concept_id JOIN deck_questions dq ON dq.id = qc.question_id WHERE dq.deck_id = $deckId AND gc.user_id = $userId LIMIT 200`
- Se zero resultados, fallback: `SELECT name FROM global_concepts WHERE user_id = $userId ORDER BY (correct_count + wrong_count) DESC LIMIT 100`
- Injetar no prompt o mesmo bloco usado em `parse-questions`

**`ai-tutor/index.ts`** (type `question-concepts`):
- Mesmo padrão: buscar conceitos do deck via `deckId` passado no body
- Injetar lista curta no prompt

#### 3. Conceito clicável — ver/editar detalhes

No EditQuestionDialog, ao clicar num chip de conceito:
- Se é conceito do usuário (`global_concepts`): expande inline para editar nome e descrição
- Popover com: nome editável, descrição editável, botão salvar
- Chama `updateConceptMeta` do `globalConceptService`

### Arquivos Afetados
- **Editar**: `src/components/deck-detail/DeckQuestionsTab.tsx` (EditQuestionDialog expandido)
- **Editar**: `supabase/functions/generate-questions/index.ts` (busca contextual + injeção de conceitos do deck)
- **Editar**: `supabase/functions/ai-tutor/index.ts` (busca contextual para `question-concepts`)

### Resumo Técnico

```text
Fluxo de Reuso de Conceitos:

  AI gera questão
       │
       ▼
  Busca conceitos do DECK (via question_concepts)
  ~50-200 conceitos relevantes
       │
       ▼
  Injeta no prompt: "REUTILIZE estes conceitos se aplicável"
       │
       ▼
  AI retorna nomes existentes quando possível
       │
       ▼
  ensureGlobalConcepts() faz slug-match → reusa IDs
```

Custo: ~200 nomes curtos = ~500 tokens extras (centavos, não reais).

