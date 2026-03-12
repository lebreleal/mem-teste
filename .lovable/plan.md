

## Analise Pedagogica: Aba Conceitos com FSRS-6

### Voce nao esta louco. Faz sentido.

A ciencia do aprendizado ativo suporta exatamente o que voce esta propondo. Existem dois tipos de pratica comprovados:

1. **Pratica intercalada** (cards aleatorios) — melhor para retenção de longo prazo e discriminação entre conceitos
2. **Pratica em bloco** (cards agrupados por conceito) — melhor para construção inicial de entendimento e conexões

Ter as duas formas no mesmo app da ao usuario o melhor dos dois mundos. E a terceira forma (questoes) adiciona **retrieval practice** com feedback, que e o metodo mais eficaz de estudo ativo segundo a literatura.

### Por que FSRS-6 nos conceitos funciona

O ponto-chave que voce identificou: **sao os mesmos cards, nao cards novos**. Isso significa:

- O usuario NAO estuda o dobro. Ele estuda os mesmos cards, so que agrupados por tema quando o conceito esta fraco.
- O FSRS-6 no conceito responde a pergunta: "Eu entendo esse TEMA como um todo?" — diferente de "Eu lembro desse card individual?"
- Um conceito pode estar "fraco" mesmo que cards individuais estejam "fortes", porque o entendimento integrado e diferente da memorização isolada.

### As 3 formas de estudo ficam assim

```text
Cards (FSRS-6)     → "Lembro desse fato individual?"
Conceitos (FSRS-6) → "Entendo esse tema como um todo?" (mesmos cards, agrupados)
Questoes            → "Consigo aplicar esse conhecimento?" (avaliacao ativa)
```

Cada uma mede uma camada diferente de aprendizado. Nao e redundante.

### UX: vai ser facil de entender?

Sim, SE a interface deixar claro que:
- Conceitos = "seus cards organizados por tema"
- Estudar conceito = "revisar os cards desse tema em sequencia"
- O usuario pode editar (renomear, deletar, mover cards entre conceitos)

O risco de confusao e baixo porque o modelo mental e intuitivo: "Tenho cards soltos. Eles pertencem a temas. Posso estudar por tema."

---

## Plano de Implementacao

### 1. Migração: tabela `deck_concepts` e junction `concept_cards`

```sql
-- Conceitos como entidade editavel com FSRS-6
CREATE TABLE deck_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  -- FSRS-6 fields (same as cards)
  state integer NOT NULL DEFAULT 0,
  stability double precision NOT NULL DEFAULT 0,
  difficulty double precision NOT NULL DEFAULT 0,
  scheduled_date timestamptz NOT NULL DEFAULT now(),
  learning_step integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deck_id, user_id, name)
);

-- Junction: which cards belong to which concept
CREATE TABLE concept_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES deck_concepts(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(concept_id, card_id)
);

-- RLS
ALTER TABLE deck_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own concepts" ON deck_concepts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own concept cards" ON concept_cards
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM deck_concepts dc
    WHERE dc.id = concept_cards.concept_id AND dc.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM deck_concepts dc
    WHERE dc.id = concept_cards.concept_id AND dc.user_id = auth.uid()
  ));
```

### 2. Aba "Conceitos" no DeckDetail

Adicionar terceira aba em `PersonalDeckTabs` (e `LinkedDeckTabs`):

- **ConceptStatsCard** (hero card no topo, igual DeckStatsCard/QuestionStatsCard):
  - Total de conceitos, quantos fortes/fracos/aprendendo
  - Botao "Estudar conceitos fracos" e "Criar conceito"
  
- **ConceptList** (lista abaixo):
  - Cada conceito mostra: nome, nivel FSRS (novo/aprendendo/dominado), quantidade de cards, proxima revisao
  - Menu de 3 pontos: Renomear, Deletar, Ver cards
  - Ao clicar: expande e mostra os cards vinculados (read-only, com preview)
  - Barra de busca + filtros (Todos, Novos, Fracos, Fortes)

### 3. CRUD de conceitos

- **Criar**: dialog com nome + selecao de cards (checkbox list dos cards do deck)
- **Renomear**: inline edit ou dialog simples
- **Deletar**: remove conceito e junction, NAO deleta cards
- **Editar cards**: dialog para adicionar/remover cards do conceito
- **Auto-criar da IA**: aproveitar os `concepts` das `deck_questions` para sugerir conceitos iniciais com cards vinculados por keyword matching

### 4. Estudo por conceito (FSRS-6)

- Reutilizar o mesmo sistema de estudo (`useStudySession`) mas filtrando cards pelo conceito
- Apos estudar todos os cards do conceito, mostrar botoes FSRS (Errei/Dificil/Bom/Facil) para o CONCEITO
- O agendamento FSRS-6 e aplicado ao conceito (quando revisar esse tema novamente?)
- Cards individuais continuam com seu proprio FSRS-6 independente

### 5. Arquivos a criar/editar

- **Criar**: `src/components/deck-detail/ConceptList.tsx` — lista de conceitos
- **Criar**: `src/components/deck-detail/ConceptStatsCard.tsx` — hero card
- **Criar**: `src/hooks/useDeckConcepts.ts` — queries e mutations para conceitos
- **Editar**: `src/pages/DeckDetail.tsx` — adicionar aba Conceitos nas tabs
- **Editar**: `src/pages/Study.tsx` — suportar modo de estudo por conceito (filtro de cards)
- **Migracao**: criar tabelas `deck_concepts` e `concept_cards`

### 6. Fora do escopo (por enquanto)

- Integracao com comunidade (sugestoes de conceitos)
- Sincronizacao de conceitos entre decks linkados
- Auto-populacao de conceitos a partir da IA (pode ser fase 2)

