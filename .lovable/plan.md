

# Estrategia de Intercalacao Cientifica + Verificacao de Configuracoes do Usuario

## Problema Atual

O prompt ainda contem a "REGRA DE COBERTURA TRIPLA" (linhas 95-105 do edge function) que triplica os cards por conceito, gerando excesso e diluindo qualidade. Precisa ser revertido para a estrategia de intercalacao (1 conceito = 1 card, alternando formatos).

Alem disso, preciso verificar se todas as configuracoes do usuario (nivel de detalhe, formatos, quantidade, instrucoes adicionais) estao sendo corretamente passadas e respeitadas no prompt.

## Diagnostico das Configuracoes

Apos analise do fluxo completo (ConfigStep -> useAIDeckFlow -> edge function):

| Configuracao | Passada corretamente? | Respeitada no prompt? |
|---|---|---|
| Nivel de detalhe (essential/standard/comprehensive) | Sim - `detailLevel` | Sim - `getDetailInstruction()` funciona bem |
| Formatos do cartao | Sim - `cardFormats[]` | Sim - `getFormatInstructions()` lista os formatos |
| Quantidade (auto vs manual) | Sim - `targetCardCount` | Sim - mas precisa ajuste no modo auto |
| Instrucoes adicionais | Sim - `customInstructions` | Sim - inseridas no prompt |
| Modelo de IA | Sim - `model` | Sim - `MODEL_MAP` resolve |

**Problema encontrado no modo "Auto"**: Quando `cardCount = 0` (auto), o prompt diz "Crie a quantidade ideal para cobrir o conteudo de forma completa" mas NAO reforça que deve cobrir 100% do conteudo. Precisa integrar melhor com o `detailLevel`.

## Mudancas Planejadas

### 1. Edge Function (`supabase/functions/generate-deck/index.ts`)

**A) Reverter "Cobertura Tripla" para "Intercalacao Cientifica"** (linhas 94-106):

Substituir por regra de intercalacao:
- Cada conceito recebe exatamente 1 card em 1 formato
- Formatos se alternam sequencialmente (basic -> cloze -> multiple_choice -> basic -> ...)
- Distribuicao final equilibrada (diferenca maxima de 1 card entre formatos)
- Cada card individual deve ser profundo e rico em contexto
- Manter ordem cronologica do material

**B) Melhorar instrucao de quantidade no modo auto** (linha 189):

Quando `requestedCount = 0` (auto), integrar com o nivel de detalhe:
- Essential: "poucos cards, 3-5 conceitos fundamentais"
- Standard: "cubra todos os topicos mencionados"
- Comprehensive: "cubra 100% do conteudo, nenhum detalhe ignorado"

Isso ja existe em `getDetailInstruction()` mas a linha 189 do prompt apenas diz "quantidade ideal" sem reforcar o nivel de cobertura. Vou unificar para evitar conflito.

**C) Reforcar ordem cronologica**: A instrucao de ordem ja existe (linha 195), esta ok.

**D) Instrucoes adicionais**: Ja funcionam (linha 196), esta ok.

### 2. UX de Carregamento (`GenerationProgress.tsx`)

Substituir os dots de lote por uma barra de progresso suave e moderna:
- Barra com gradiente animado e transicao CSS suave (`transition: width 700ms ease-out`)
- Sem porcentagem numerica (evita o bug de pular numeros)
- Texto de fase rotativo (ja existe) + indicador textual "Lote X de Y"
- Layout mais limpo e centralizado
- Manter dicas educativas e botao "Continuar em segundo plano"

---

## Detalhes Tecnicos

### Edge Function - Nova regra de distribuicao (linhas 94-106)

A secao multi-formato sera substituida por:

```typescript
parts.push(`\nREGRA DE INTERCALAÇÃO (OBRIGATÓRIA):
1. Cada conceito/tópico deve ser coberto por APENAS UM formato — NUNCA repita o mesmo assunto em formatos diferentes.
2. ALTERNE os formatos na sequência: ${formatNames.join(" → ")} → ${formatNames[0]} → ... (ciclo contínuo).
3. Distribuição IGUAL: cada formato deve ter aproximadamente o mesmo número de cartões (diferença máxima de 1).
4. PROFUNDIDADE: cada cartão deve ser RICO em contexto e testar compreensão real, não apenas memorização superficial.

EXEMPLO com ${count} formatos e 6 conceitos:
Conceito 1 → ${formatNames[0]}
Conceito 2 → ${formatNames[1 % count]}
Conceito 3 → ${formatNames[2 % count]}
Conceito 4 → ${formatNames[3 % count]}
Conceito 5 → ${formatNames[4 % count]}
Conceito 6 → ${formatNames[5 % count]}`);
```

### Edge Function - Quantidade auto melhorada (linha 189)

```typescript
// Antes:
`Crie a quantidade ideal para cobrir o conteúdo de forma completa.`

// Depois — integra com detailLevel:
requestedCount > 0
  ? `Crie exatamente ${requestedCount} cartões.`
  : `Crie a quantidade NECESSÁRIA de cartões para o nível de cobertura solicitado abaixo. NÃO limite artificialmente — gere tantos cartões quantos forem necessários.`
```

### GenerationProgress - Barra suave

- Calcular progresso como `genProgress.current / genProgress.total`
- Usar componente `Progress` do shadcn com gradiente customizado
- Transicao CSS suave sem numeros pulando
- Texto descritivo "Lote X de Y" abaixo da barra

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/generate-deck/index.ts` | Reverter tripla -> intercalacao + melhorar auto count |
| `src/components/ai-deck/GenerationProgress.tsx` | Redesign com barra suave sem porcentagem |

Nenhuma mudanca necessaria em `useAIDeckFlow.ts` — a logica de lotes, background e passagem de parametros esta correta.

