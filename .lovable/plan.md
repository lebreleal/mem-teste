

# Corrigir Geração de Cartões de Múltipla Escolha

## Causa Raiz

O prompt atual usa linguagem restritiva demais para múltipla escolha:
- "~20% (MAXIMO)" -- o modelo lê como "pode ser 0%"
- "SOMENTE para diferenciação" -- o modelo interpreta como condicional

Enquanto para Cloze e Basic a linguagem é imperativa ("formato com MAIOR poder", "OBRIGATORIO"), para MCQ é defensiva.

## Solucao

**Arquivo:** `supabase/functions/generate-deck/index.ts`

Alterar a distribuicao na funcao `getFormatInstructions()` para tornar MCQ obrigatorio:

1. Trocar "~20% (MAXIMO)" por "~20% dos cartoes (OBRIGATORIO — nao pode ser 0%)"
2. Adicionar instrucao explicita: "Voce DEVE gerar pelo menos 1 cartao de multipla escolha para cada 5 cartoes gerados"
3. Manter a restricao pedagogica de que distratores devem ser conceitos reais do material

### Texto atualizado para quando os 3 formatos estao selecionados:

```
DISTRIBUICAO PEDAGOGICA (SuperMemo) — OBRIGATORIA, todos os formatos DEVEM aparecer:
- Cloze: ~50% dos cartoes — formato com MAIOR poder mnemonico.
- Pergunta/Resposta (basic): ~30% dos cartoes — para raciocinio e causa-efeito.
- Multipla Escolha: ~20% dos cartoes (MINIMO 15%) — OBRIGATORIO para diferenciacao de conceitos similares. Voce DEVE gerar cartoes deste tipo. Se gerar 20 cartoes, pelo menos 3-4 DEVEM ser multipla escolha.
```

### Mudanca similar para combinacoes de 2 formatos:

- Cloze + MCQ: "Cloze ~70%, Multipla Escolha ~30% (OBRIGATORIO)"
- Basic + MCQ: "Basic ~70%, Multipla Escolha ~30% (OBRIGATORIO)"

## Escopo

- **1 arquivo**: `supabase/functions/generate-deck/index.ts` (apenas a funcao `getFormatInstructions`, linhas 115-133)
- Nenhuma mudanca no frontend, schema ou logica de validacao
