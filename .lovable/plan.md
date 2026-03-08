

## Análise: Múltipla Escolha — Custo vs Qualidade

### O que especialistas dizem

A comunidade SuperMemo/Anki é clara: **reconhecimento (MC) é inferior a recall (cloze/basic)** para retenção de longo prazo. MC testa se o aluno "reconhece" a resposta entre opções — cloze/basic forçam "recuperação ativa" da memória, que é 2-3x mais eficaz para retenção.

MC tem valor **apenas** para diferenciação de conceitos similares (ex: "Qual enzima? Tripsina vs Quimotripsina vs Pepsina"). Fora desse caso, é desperdício.

### Problema de custo com MC

Um card MC consome **3-4x mais tokens de output** que um cloze:

```text
Cloze:  ~40 tokens (front com lacuna, back vazio)
Basic:  ~50 tokens (front + back curto)
MC:     ~150 tokens (front + 4-5 opções longas + correctIndex)
```

Com 20% dos cards sendo MC e output a $2.50/M (Flash) ou $10/M (Pro), isso representa ~35% do custo de output sendo gasto no formato MENOS eficaz pedagogicamente.

### Problemas no prompt atual de MC

1. **Opções muito longas** — o prompt não limita o tamanho das alternativas
2. **20% é alto demais** — especialistas recomendam MC apenas para diferenciação específica (~5-10%)
3. **Distratores genéricos** — apesar do prompt pedir distratores do material, o modelo às vezes inventa

### Plano de melhorias (3 mudanças)

**1. Reduzir MC de 20% → 10% e opções curtas (max 8 palavras)**

No prompt de MC, adicionar: opções devem ter no máximo 8 palavras cada. Isso corta ~50% dos tokens de MC sem perder qualidade.

Mudar distribuição: Cloze 55%, Basic 35%, MC 10%.

**2. MC apenas para diferenciação (reforçar no prompt)**

Adicionar instrução explícita: "Use MC EXCLUSIVAMENTE quando existirem 3+ conceitos similares no material que precisam ser diferenciados. Se não há conceitos confundíveis, NÃO gere MC — use cloze ou basic."

**3. Limitar opções a 4 (nunca 5)**

O prompt atual permite 4-5 opções. Pesquisa mostra que 4 opções é tão eficaz quanto 5, mas com ~20% menos tokens. Fixar em exatamente 4.

### Impacto estimado

| Métrica | Antes | Depois |
|---|---|---|
| Tokens de output por deck (20 cards) | ~1,400 | ~1,050 |
| % gasto em MC | ~35% do output | ~12% do output |
| Qualidade pedagógica MC | Média | Alta (só diferenciação) |
| Economia total de output | — | ~25% |

### Arquivos a editar
- `supabase/functions/generate-deck/index.ts` — prompt MC (opções curtas, 4 fixas, só diferenciação), distribuição 55/35/10

