

# Analise: O que e um "Conceito" segundo a Ciencia da Aprendizagem

## O que o sistema faz HOJE (errado)

O prompt atual (linhas 113-136 do edge function) diz explicitamente:

```
O campo "concepts" NÃO deve conter nomes de conceitos soltos.
Em vez disso, cada item deve ser uma PERGUNTA DE COMPREENSÃO:
- "Você conseguiu identificar que uma coleção de pus localizada é um abscesso?"
```

Isso NAO e um conceito. Isso e uma pergunta de autoavaliacao. O campo se chama "concepts" mas gera perguntas. E o user prompt (linha 153) contradiz pedindo "2-5 conceitos-chave testados". O sistema esta confuso consigo mesmo.

## O que a ciencia diz que um conceito DEVE ser

Na teoria de **Knowledge Components** (Koedinger, Corbett, Ritter — Carnegie Learning, 1998) e nos trabalhos de **Bjork sobre desirable difficulties**, um conceito e um **componente de conhecimento** — a menor unidade que pode ter sua propria trajetoria de dominio.

### Definicao correta:
> Um conceito e uma unidade atomica de conhecimento que pode ser avaliada independentemente e que o aprendiz pode dominar ou nao dominar.

### Exemplos por granularidade:

```text
MUITO AMPLO (inutil):
  "Cardiologia"
  "Farmacologia"
  → Nao da pra medir dominio de algo tao vago

GRANULARIDADE CORRETA (Knowledge Component):
  "Mecanismo de acao dos IECA"
  "Diferenca entre abscesso e flegmao"
  "Criterios de Light para derrame pleural"
  "Fisiopatologia da insuficiencia cardiaca"
  → Pode ser avaliado: o aluno domina ou nao
  → Pode ter multiplas questoes testando angulos diferentes
  → E reutilizavel entre disciplinas

MUITO ESTREITO (ruido):
  "Dose de Captopril 25mg"
  "pH normal do sangue = 7.35-7.45"
  → Isso e um FATO, nao um conceito
  → Pertence a um card, nao a um conceito
```

### Taxonomia de Bloom aplicada:

Um conceito correto vive nos niveis **Compreender** e **Aplicar**. Fatos isolados vivem em **Lembrar** (e sao cards). Conceitos NAO sao:
- Perguntas ("Voce entendeu X?") — isso e metacognicao, nao conceito
- Fatos ("A pressao normal e 120/80") — isso e um card
- Disciplinas ("Cardiologia") — isso e uma pasta/folder

### Bjork (1994) — Desirable Difficulties:

Para que spacing e interleaving funcionem, o aprendiz precisa de unidades de conhecimento com **granularidade intermediaria**. Se o conceito e muito amplo, spacing nao tem efeito (tudo e "pratica de cardiologia"). Se e muito estreito, interleaving nao faz sentido (nao ha o que misturar).

A granularidade ideal e: **algo que pode ser testado por 3-10 questoes diferentes, de angulos diferentes**.

## O que deve mudar

### No prompt da IA:

O campo `concepts` deve conter **nomes de Knowledge Components** com estas regras:

1. **2-6 palavras** — substantivo + qualificador (ex: "Fisiopatologia da ICC", "Criterios de Light")
2. **Nivel Compreender/Aplicar** de Bloom — nao fatos, nao disciplinas
3. **Testavel por multiplas questoes** — se so cabe 1 questao, e estreito demais
4. **Reutilizavel** — o mesmo conceito pode aparecer em questoes de decks diferentes
5. **1-3 conceitos por questao** (nao 4-5) — cada conceito deve ser relevante, nao decorativo

### Exemplo concreto:

```text
QUESTAO: "Paciente com dispneia, edema de MMII e PVC elevada.
Qual mecanismo explica a congestao sistemica?"

ERRADO (atual):
  concepts: [
    "Voce conseguiu identificar que a ICC direita causa congestao sistemica?",
    "Voce entendeu o papel da PVC elevada?",
    "Voce diferenciou ICC esquerda de direita?",
    "Voce sabe o que e edema de MMII?"
  ]

CORRETO (Knowledge Components):
  concepts: [
    "Fisiopatologia da ICC direita",
    "Semiologia da congestao sistemica"
  ]
```

## Resumo: Conceito ≠ Pergunta ≠ Fato ≠ Disciplina

| Tipo | Exemplo | Onde vive |
|------|---------|-----------|
| Fato | "PA normal = 120/80" | Card (FSRS) |
| Conceito (KC) | "Fisiopatologia da hipertensao" | Conceito (mastery dashboard) |
| Pergunta de autoavaliacao | "Voce entendeu X?" | Nenhum lugar (eliminar) |
| Disciplina | "Cardiologia" | Pasta/Folder |

## Plano de implementacao

### 1. Corrigir o prompt do edge function `generate-questions`

Substituir a secao "CONCEPTS — PERGUNTAS DE AUTOAVALIAÇÃO" (linhas 113-136) por:

```
CONCEPTS — KNOWLEDGE COMPONENTS:
O campo "concepts" deve conter NOMES de componentes de conhecimento (Knowledge Components).
Regras:
- 2-6 palavras: substantivo + qualificador
- Nivel Compreender/Aplicar de Bloom (nao fatos isolados, nao disciplinas amplas)
- Cada conceito deve ser testavel por multiplas questoes de angulos diferentes
- 1-3 conceitos por questao (apenas os CENTRAIS, nao todos tangenciais)
- Reutilizavel entre disciplinas

Exemplos CORRETOS: "Mecanismo de acao dos IECA", "Criterios de Light", "Diferenca abscesso vs flegmao"
Exemplos ERRADOS: "Cardiologia" (amplo demais), "Dose de Captopril" (fato isolado), "Voce entendeu X?" (pergunta)
```

Tambem atualizar o tool schema (linha 175-179) para refletir isso.

### 2. Atualizar o user prompt (linha 153)

Mudar de "2-5 conceitos-chave testados" para "1-3 Knowledge Components centrais testados nesta questao".

### 3. Atualizar o edge function e re-deploy

Unica mudanca: o prompt. Nenhuma mudanca de schema ou frontend necessaria neste momento — os conceitos continuam sendo strings no campo `concepts[]`, mas agora serao nomes curtos e corretos em vez de perguntas.

