

# Otimizacao do Prompt de Geracao de Cards com IA

## Mudancas no prompt (6 melhorias)

### Mudanca 1: Adicionar regra de PROGRESSAO LOGICA (nova regra 11)

**ANTES:** Nao existe instrucao sobre conectar cards entre si.

**DEPOIS:**
```
11. PROGRESSAO LOGICA: Os cartoes devem construir uma NARRATIVA de aprendizado.
    Antes de testar um detalhe, garanta que o conceito-pai ja foi coberto.
    Ex: primeiro "O que o diafragma faz na inspiracao", depois
    "Por que a paralisia do diafragma causa dispneia".
```

---

### Mudanca 2: Cobertura "standard" -- varredura por FOLHA, nao por paragrafo

**ANTES:**
```
"COBERTURA COMPLETA: Crie cartoes para TODOS os topicos, conceitos e
mecanismos presentes no conteudo. NAO pule NENHUM tema..."
```

**DEPOIS:**
```
"COBERTURA COMPLETA: Faca uma varredura FOLHA POR FOLHA do conteudo
fornecido. Para cada folha/secao, identifique os conceitos-chave e
crie cartoes que cubram os pontos principais. Conecte conceitos entre
folhas quando relevante. Ao final, verifique: cada secao do conteudo
esta representada? Se nao, adicione os cartoes faltantes."
```

**Por que:** "Paragrafo por paragrafo" geraria centenas de cards desnecessarios. "Folha por folha" e o nivel certo -- garante cobertura sem explodir a quantidade, ja que cada folha/pagina do PDF e uma unidade natural de conteudo.

---

### Mudanca 3: Refinar regra 5 de redundancia

**ANTES:**
```
"5. REDUNDANCIA ESTRATEGICA: crie cartoes que testem o MESMO conceito
de angulos diferentes. Ex: 'X causa Y' num cartao e 'Y e causado por
{{c1::X}}' em outro."
```

**DEPOIS:**
```
"5. REDUNDANCIA ESTRATEGICA: Para conceitos CENTRAIS, teste ANGULOS
COGNITIVOS DISTINTOS:
   - Angulo 1: FATO (o que e/qual valor)
   - Angulo 2: MECANISMO (como funciona)
   - Angulo 3: CONSEQUENCIA (o que acontece se falhar)
   ERRADO: 'X causa Y' + 'Y e causado por X' (mesma informacao invertida)
   CERTO: 'X causa Y' + 'Se X falhar, qual a consequencia?'
   Use redundancia apenas para conceitos CENTRAIS, nao para cada detalhe."
```

---

### Mudanca 4: Reforcar limite de resposta em basic (regra 2)

**ANTES:** `"Resposta concisa (1 frase, maximo 2) no verso."`

**DEPOIS:** `"Resposta concisa no verso: MAXIMO 15 palavras. Se precisa de mais, divida em 2 cartoes. REGRA DE OURO: se a resposta nao cabe em 1 linha, o cartao esta mal formulado."`

---

### Mudanca 5: Teste de qualidade para cloze

**ANTES:** `"A frase deve ser respondivel quando a lacuna estiver oculta."`

**DEPOIS:**
```
"TESTE DE QUALIDADE: Leia a frase COM a lacuna oculta. Se houver MAIS
DE UMA resposta plausivel, o card esta ruim -- adicione mais contexto.
ERRADO: 'O {{c1::diafragma}} e importante para a respiracao'
CERTO: 'O principal musculo motor da inspiracao em repouso e o
{{c1::diafragma}}, que se contrai e achata durante a inspiracao.'"
```

---

### Mudanca 6: Anti-padrao de cards triviais

**ANTES:** Nao existe regra contra cards obvios.

**DEPOIS (adicionar aos anti-padroes existentes):**
```
- Cards que testam informacao OBVIA que qualquer leigo saberia
  (ex: "O coracao bombeia {{c1::sangue}}")
- Cards com respostas que podem ser adivinhadas sem estudar o conteudo
```

---

## Detalhes tecnicos

**Arquivo unico:** `supabase/functions/generate-deck/index.ts`

1. **DEFAULT_SYSTEM_PROMPT** (linhas 5-40): Adicionar regra 11 (progressao logica), refinar regra 5 (redundancia com angulos distintos), reforcar limite de 15 palavras na regra 2, adicionar 2 anti-padroes de cards triviais
2. **getDetailInstruction** (linha 46, case default/standard): Trocar texto por varredura folha-por-folha
3. **getFormatInstructions** (linhas 64/85, bloco cloze): Adicionar teste de qualidade cloze com exemplos certo/errado
4. Deploy automatico da edge function

Sem mudancas no frontend -- todas as melhorias sao no prompt do backend.

