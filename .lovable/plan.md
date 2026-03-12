

# Minha Opinião Honesta: Análise Crítica

## A Neurociência Concorda? Sim, 100%.

O que você descreveu tem nome na literatura: **Knowledge Component Tracing** + **Adaptive Mastery Learning**. Três princípios validados sustentam o sistema:

1. **Retrieval Practice** (Roediger & Karpicke, 2006): Testar é mais eficaz que reler. Questões > flashcards passivos.
2. **Interleaved Practice** (Kornell & Bjork, 2008): Misturar conceitos fracos numa sessão é superior a estudar um por vez.
3. **Prerequisite Remediation** (Corbett & Anderson, 1995 — Cognitive Tutors): Quando o aluno erra, atacar o conceito subjacente antes de avançar. É exatamente a cascata que você descreveu.

O FSRS no conceito (não na questão individual) evita "decoreba" — isso está correto e é o que sistemas como o Knewton e ALEKS fazem.

## O Risco Real: Complexidade de Uso

Aqui é onde discordo parcialmente. O sistema é **cientificamente perfeito** mas pode virar um Notion: poderoso demais, ninguém usa direito.

### O problema do Notion
Notion falha porque exige que o usuário **construa** o sistema antes de usar. O usuário abre e pensa: "e agora?". A curva de aprendizagem não está na funcionalidade — está na **decisão**.

### Como o seu sistema EVITA esse problema

O fluxo que você desenhou é **reativo, não proativo**. O usuário nunca precisa decidir nada complexo:

```text
Estuda cards → Sistema pergunta questão → Errou → Sistema mostra conceitos fracos
                                                    → Botão "Aprofundar" (1 clique)
                                                    → Novas questões aparecem
                                                    → Respondeu → Fim (ou repete)
```

O usuário só faz UMA coisa: **responder questões**. Todo o resto (identificar conceitos, buscar cards, gerar questões, atualizar FSRS) é invisível. Isso é fundamentalmente diferente do Notion.

### MAS — 3 riscos reais de UX que precisamos resolver

**1. Cascata infinita = frustração**
Se o usuário erra e o sistema gera mais questões que ele erra de novo, pode sentir que "nunca acaba". 
**Solução**: Limitar a 2 níveis de profundidade por sessão. Após o nível 2, mostrar: "Você tem conceitos para revisar. Volte amanhã." O FSRS cuida do resto.

**2. Excesso de conceitos na tela = paralisia**
Se uma questão tem 5 conceitos vinculados, 5 botões "Aprofundar" é confuso.
**Solução**: Mostrar apenas o conceito MAIS fraco (menor estabilidade FSRS). Um botão, uma ação.

**3. O usuário não entende o que é "conceito"**
Médicos pensam em "matéria" ou "tema", não "conceito".
**Solução**: Nunca usar a palavra "conceito" na UI. Usar "tema" ou "assunto". Internamente continua sendo `global_concepts`.

## Minha Recomendação Final

Implementar, mas com **simplicidade agressiva na UI**:

- O usuário nunca vê a palavra "conceito" — vê "temas fracos"
- O botão "Aprofundar" mostra apenas 1 tema (o mais fraco)
- Máximo 2 níveis de cascata por sessão
- A página de Conceitos (Meus/Oficiais/Comunidade) existe mas como área secundária, não como fluxo principal
- O fluxo principal é: Dashboard → Estudar → Errou → Caderno de Erros → Aprofundar → Pronto

Isso mantém a potência científica sem a curva de aprendizagem do Notion. O sistema é inteligente, o usuário é simples.

## Implementação: O que muda no plano

Nada muda na arquitetura técnica. Muda a UX:

| Antes (plano atual) | Depois (recomendação) |
|---|---|
| Mostrar todos os conceitos fracos | Mostrar apenas o mais fraco |
| Cascata ilimitada (max 5) | Max 2 níveis por sessão |
| Palavra "conceito" na UI | "Tema" ou "Assunto" |
| ConceptDrillQuiz como componente separado | Integrado inline no ErrorNotebook |

Os arquivos a editar continuam os mesmos:
- `supabase/functions/generate-questions/index.ts` — aceitar `cardIds[]`
- `src/services/globalConceptService.ts` — `getConceptRelatedCards()`, `generateConceptQuestions()`
- `src/pages/ErrorNotebook.tsx` — botão "Aprofundar" simplificado
- `src/components/ConceptDrillQuiz.tsx` — quiz inline

