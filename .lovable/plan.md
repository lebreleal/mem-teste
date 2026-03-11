

# Sistema Inteligente de Questões com Aprendizagem Adaptativa

## Análise: Como as grandes plataformas fazem?

Plataformas como Estratégia Concursos, QConcursos e sistemas de estudo ativo usam abordagens diferentes de flashcards para questões:

- **Flashcards**: Repetição espaçada pura (FSRS/SM-2) — foca em **recall** de informação
- **Questões**: Foca em **aplicação** de conceitos — o importante não é "repetir a mesma questão", mas sim **dominar os conceitos** necessários para resolver questões similares

A repetição espaçada "pura" em questões não funciona bem porque:
1. O usuário decora a resposta da questão específica, não aprende o conceito
2. Questões testam múltiplos conceitos ao mesmo tempo
3. O valor está em resolver questões **novas** sobre o mesmo tema, não repetir as mesmas

## Proposta: Sistema de Conceitos + Caderno de Erros + IA Adaptativa

### 1. Barra de Estatísticas (como a screenshot)
Seção visual na aba Questões mostrando:
- Total de questões no banco
- Questões respondidas / não respondidas / acertadas / erradas
- Barra de progresso colorida (verde = acertou, vermelho = errou, cinza = não respondida)
- Taxa de acerto geral

### 2. Caderno de Erros (Error Notebook)
- Questões erradas ficam automaticamente no "Caderno de Erros"
- Filtro rápido para revisar apenas questões erradas
- Quando o usuário acerta uma questão que antes errou, ela sai do caderno
- Badge visual mostrando quantas questões pendentes no caderno de erros

### 3. Mapeamento de Conceitos por IA (o diferencial)
Ao criar/gerar questões, a IA identifica os **conceitos-chave** necessários:
- Nova coluna `concepts` (jsonb) na tabela `deck_questions` — ex: `["Princípio da Legalidade", "Art. 37 CF"]`
- Quando o usuário **erra** uma questão, a IA:
  - Mostra quais conceitos ele precisava dominar
  - Verifica se já existem cards no deck sobre esses conceitos
  - **Sugere criar cards** para os conceitos que faltam (com 1 clique)
- Isso cria um ciclo: Errou questão → IA cria cards → Estuda cards → Volta e acerta questões similares

### 4. Repetição Inteligente (não espaçada pura)
Em vez de FSRS nas questões, usamos um sistema de **prioridade por conceito fraco**:
- Cada conceito tem um "score" baseado nas respostas (acertou/errou questões com aquele conceito)
- Na próxima sessão de questões, prioriza questões com conceitos fracos
- Nova tabela `deck_question_concepts` para trackear domínio por conceito

## Mudanças Técnicas

### Database (nova migration)
```sql
-- Adicionar coluna de conceitos nas questões
ALTER TABLE deck_questions ADD COLUMN concepts text[] DEFAULT '{}';

-- Tabela de domínio de conceitos por usuário
CREATE TABLE deck_concept_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  concept text NOT NULL,
  correct_count int DEFAULT 0,
  wrong_count int DEFAULT 0,
  mastery_level text DEFAULT 'weak', -- weak, learning, strong
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, deck_id, concept)
);
```

### Frontend — DeckQuestionsTab.tsx
1. **Stats bar** no topo (igual screenshot): total, respondidas, acertadas, erradas com barra colorida
2. **Filtros**: Todas | Não respondidas | Caderno de Erros | Por conceito
3. **Após errar**: seção "Conceitos desta questão" com status de domínio + botão "Criar cards para este conceito"
4. **Badge "Caderno de Erros"** com contador

### Edge Function — ai-tutor (novo type: `question-concepts`)
- Recebe a questão + alternativas
- Retorna lista de conceitos-chave necessários
- Executado automaticamente na criação de questões

### Edge Function — ai-tutor (novo type: `generate-concept-cards`)
- Recebe conceito + contexto do deck
- Gera 2-3 flashcards focados naquele conceito específico
- Adicionados ao deck automaticamente

## Fluxo do Usuário

```text
Aba Questões
├── Stats Bar: "42 questões · 28 respondidas · 71% acerto · 8 no caderno de erros"
├── Filtros: [Todas] [Não respondidas] [Caderno de Erros ⑧]
├── Lista de questões (preview com cor: verde/vermelho/cinza)
└── [Estudar Questões] → Modo prática
    ├── Responde questão
    ├── Se ERROU:
    │   ├── Mostra explicação
    │   ├── "Conceitos necessários: [Princípio X] [Art. Y]"
    │   ├── Score do conceito: "Fraco — você errou 3/4 questões sobre isso"
    │   └── [🤖 Criar cards para este conceito] → IA gera cards no deck
    └── Se ACERTOU:
        ├── Atualiza mastery do conceito
        └── Remove do caderno de erros (se estava lá)
```

## Resumo: 5 entregas

1. **Stats bar** com contadores e barra de progresso na aba Questões
2. **Caderno de Erros** com filtro e badge
3. **Conceitos por questão** (coluna `concepts` + extração por IA)
4. **Mastery tracking** por conceito (tabela + UI mostrando domínio)
5. **Geração de cards por conceito** (IA cria cards quando o usuário erra)

