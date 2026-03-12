

# Conceitos Globais + Repetição Espaçada nos Conceitos (não nas questões)

## O problema que você identificou

Existem dois extremos ruins:

1. **SR nas questões** → O aluno decora a questão específica ("a resposta é letra C"), não aprende o conceito
2. **Sem SR nas questões** → Questões respondidas corretamente nunca mais são revisitadas, mesmo que o conceito por trás delas se deteriore com o tempo

## A solução correta: SR no CONCEITO, variação na QUESTÃO

O agendamento FSRS fica no **conceito global**, não na questão individual. Quando um conceito está "due" para revisão, o sistema seleciona uma **questão diferente** que testa aquele conceito — nunca a mesma questão repetida.

```text
FLUXO:

Conceito "Fisiopatologia da ICC direita" (FSRS: due hoje)
  ↓
Sistema busca questões vinculadas a esse conceito
  → Q1 (já respondida 2x), Q2 (já respondida 1x), Q3 (nunca respondida)
  ↓
Prioriza Q3 (nunca vista) ou a menos recente
  ↓
Usuário responde → resultado atualiza o FSRS do CONCEITO (não da questão)
  ↓
Se acertou → conceito reagendado (ex: revisão em 7 dias)
Se errou → conceito volta pra fila curta (ex: revisão em 1 dia)
```

Isso resolve os dois problemas:
- **Não decora questão** — cada revisão usa uma questão diferente
- **Não esquece conceito** — o FSRS garante revisão antes do esquecimento
- **Questões corretas voltam** — se o conceito decai, uma questão sobre ele será selecionada (pode ser qualquer uma do pool)

## Onde os conceitos vivem

**Global, fora do deck.** Uma nova aba de estudo (ou seção em Performance/Dashboard) mostra todos os conceitos do usuário com seu status FSRS. O conceito "Fisiopatologia da ICC direita" pode ter questões de 3 decks diferentes — todas alimentam o mesmo conceito.

## Como funciona com questões da comunidade/plataforma

Quando o usuário importa um deck da comunidade que tem questões com conceitos:
- Os conceitos são normalizados (slug/match) contra os conceitos globais do usuário
- Se o conceito já existe → as novas questões são vinculadas ao conceito existente (aumenta o pool)
- Se não existe → conceito é criado como novo
- Resultado: mais questões por conceito = melhor variação nas revisões

## Mudanças necessárias

### Banco de dados
1. **`deck_concept_mastery`** ganha campos FSRS (`stability`, `difficulty`, `state`, `scheduled_date`) — ou reutilizamos `deck_concepts` que já tem esses campos
2. Remover a dependência de `deck_id` como chave primária do conceito — conceito vira global por `user_id` + `concept_name_normalized`
3. Tabela `question_tags` (ou similar) para vincular questões a conceitos por ID

### Edge function `generate-questions`
- Já corrigido: gera Knowledge Components (nomes curtos)
- Pós-processamento normaliza e vincula a conceitos globais

### Frontend
- **Remover** aba Conceitos de dentro do DeckDetail
- **Criar** seção global de Conceitos (nova página ou aba em Performance)
- Fila de estudo de conceitos: seleciona conceitos "due", apresenta questão variada
- ConceptMasterySection pós-questão continua existindo (atualiza o FSRS do conceito global)

### Questões dentro do deck
- Continuam existindo na aba Questões do deck (para prática livre/manual)
- Mas a **revisão espaçada** acontece na seção global de conceitos

## Resumo do modelo

| Entidade | SR? | Onde vive | O que testa |
|----------|-----|-----------|-------------|
| Card | Sim (FSRS) | Deck | Recall de fato isolado |
| Questão | Não | Deck | Instrumento de avaliação (não é agendada) |
| Conceito | Sim (FSRS) | Global | Compreensão temática (usa questões como instrumento) |

A questão é o **instrumento**. O conceito é a **unidade de conhecimento** que tem agendamento. Quando o conceito precisa ser revisado, uma questão é selecionada para testar. Nunca a mesma duas vezes seguidas.

