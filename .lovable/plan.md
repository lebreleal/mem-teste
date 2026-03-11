

## Diagnóstico Real

O problema **não é** falta de pós-processamento. O problema é que o `flash-lite` recebe o **mesmo prompt gigante** (200+ linhas) que o Pro. Modelos menores não conseguem seguir instruções longas e complexas — eles se perdem e geram cards malformados.

A solução correta: **criar um prompt otimizado e mais curto para o flash-lite**, enquanto o Pro continua usando o prompt atual sem nenhuma alteração.

## Plano

### Arquivo: `supabase/functions/generate-deck/index.ts`

**O que muda:**
- Criar um `FLASH_SYSTEM_PROMPT` simplificado (~40% do tamanho atual), com as mesmas regras mas escritas de forma mais direta e curta, sem exemplos extensos e sem redundâncias
- Criar uma versão simplificada do `getFormatInstructions()` para flash — instruções de cloze mais curtas, sem exemplos "ERRADO/CERTO" repetidos, regras condensadas
- Na hora de montar o request (linha ~316), checar se o modelo selecionado é flash-lite: se sim, usar o prompt simplificado; se não, usar o prompt atual (Pro permanece 100% inalterado)

**O que NÃO muda:**
- O prompt do Pro (nenhuma linha alterada)
- O modelo mapeado (flash-lite permanece)
- O schema de tool call
- O pós-processamento existente (linhas 432-453)
- Nenhuma outra edge function

### Lógica

```text
if modelo == flash-lite:
  systemPrompt = FLASH_SYSTEM_PROMPT (curto, direto)
  formatInstructions = versão condensada
else:
  systemPrompt = DEFAULT_SYSTEM_PROMPT (atual, sem mudanças)
  formatInstructions = versão atual completa
```

### Por que funciona

Modelos menores seguem melhor instruções **curtas e diretas**. O flash-lite não é burro — ele é sobrecarregado com 200+ linhas de regras e exemplos. Reduzindo o prompt para ~80 linhas com as mesmas regras essenciais, o flash-lite vai gerar cards de qualidade significativamente melhor sem custar mais.

### Resumo

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/generate-deck/index.ts` | Adicionar prompt simplificado para flash-lite; Pro inalterado |

