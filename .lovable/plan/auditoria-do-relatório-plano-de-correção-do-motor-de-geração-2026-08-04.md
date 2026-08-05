# Auditoria do relatório + plano de correção do motor de geração por IA

## Veredito curto

O diagnóstico está majoritariamente **correto e verificado no código**. Mas o prompt proposto, se colado como está, **quebra o pipeline**. E o relatório erra o alvo em um ponto importante: a maior causa de card ruim hoje não é a temperatura, é a **cota de cartões por lote**.

## O que confirmei no código (fatos, não opinião)

- **O prompt bom nunca roda — confirmado.** `generate-deck/index.ts` faz `promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT`. A linha `generate_deck` em `ai_prompts` tem **393 caracteres** ("Crie cards claros, precisos..."), enquanto o `DEFAULT_SYSTEM_PROMPT` do código tem ~4.000. O prompt das 20 Regras está morto em produção.
- **Temperatura — confirmado.** `ai_prompts.temperature = 0.7` para `generate_deck` (o fallback do código é 0.5). `tool_choice` já é forçado.
- **Cloze inválido vira lixo visível — confirmado.** Sem `{{c1::`, o card é reclassificado para basic com `back: "Informação não fornecida"`.
- **DOCX/PPTX anunciado e não suportado — confirmado.** Estão em `ACCEPTED_FILE_TYPES`, mas `handleFileSelect` só trata PDF e texto; qualquer outro cai em "Formato não suportado".
- **Overlap zero — confirmado.** Lotes de 3 páginas, fatias sequenciais sem sobreposição; `splitTextIntoPages` também corta sem overlap.
- **Falha parcial silenciosa — confirmado.** `failedCount` é contado, mas só aparece na UI quando **zero** cartões voltam. 1 de N falhando passa batido e ainda cobra energia do lote.
- **Preso ao ciclo de vida da aba — confirmado.** `usePendingDecks` é Zustand em memória; F5 perde tudo.
- **Sem visão — confirmado.** As thumbnails existem (`pdfUtils`), mas nunca são enviadas ao modelo.

## Advogado do diabo: onde o relatório erra ou é incompleto

1. **O prompt proposto não é "colar direto na tabela" — ele quebra coisas.**
   - Ele define a saída como `{"flashcards":[{"frente","verso"}]}`. O código usa function calling com schema `front`/`back`/`type` e parser em cima disso. Schema divergente = zero cards.
   - Ele **elimina cloze**. O app depende de cloze (formato escolhido pelo usuário, `{{c1::}}`, e o `back` vazio obrigatório). Um prompt só de pergunta/resposta desliga metade do produto.
   - Ele é **específico de medicina**. O `ai_prompts` é global; usuários de direito/engenharia receberiam um prompt que manda descartar tudo que não é "core clínico".
   - Regras de formato (cloze, distribuição, proibições) **já são injetadas pelo código** via `getFormatInstructions`. Duplicar no system prompt gera instruções conflitantes.

2. **A causa raiz nº 1 não está na lista dele: a cota de cartões.** Com `detailLevel: comprehensive`, `densityFactor = 80` → um lote de 3 páginas (~6.000 caracteres) pede ~75 cartões. O modelo não tem 75 fatos ali; ele **fabrica, fatia trivialidades e repete**. Nenhuma temperatura conserta uma cota irreal. Baixar temperatura com cota inflada só torna o preenchimento mais monótono. Isso precisa virar **teto sugerido, não meta**.

3. **"Descarte o cloze inválido" contradiz o objetivo de não perder conteúdo.** Descarte cego joga fora fato bom por erro de sintaxe. Regra melhor: se o card tem `back` com conteúdo real, converte para basic (sem inventar texto); só descarta quando `back` está vazio ou é placeholder. Nunca escrever "Informação não fornecida".

4. **Temperatura 0.15–0.2 é razoável, mas não é o herói.** Vale fazer, é uma linha. Não espere ganho grande sozinho.

5. **Visão/OCR tem um obstáculo prático que o relatório ignora:** a thumbnail atual é `scale: 0.4` em JPEG 0.7 — ilegível para texto. Usar visão exige re-renderizar a página em escala ~2.0 sob demanda, o que muda custo, payload e tempo. É P2 de verdade, não "só mandar a thumbnail".

6. **Retry no cliente sem idempotência dobra o custo em energia.** Hoje cada lote debita energia no servidor; retry ingênuo = cobrança dupla. O retry precisa vir junto do reembolso/marcação de lote.

## Plano de correção, em ordem

### P0 — hoje (config e poucas linhas)

1. **Sincronizar `ai_prompts.generate_deck`**: substituir o prompt de 5 linhas por uma versão que mescla o `DEFAULT_SYSTEM_PROMPT` das 20 Regras com as melhorias reais do relatório — informação mínima, isolamento de variáveis, siglas testadas nos dois sentidos, tratamento de correção de termos, proibição de setas/markdown/emoji, elementos químicos por extenso, zero alucinação. Mantendo: neutro de domínio, **sem** definir schema de saída (o function calling manda), **sem** regras de formato duplicadas.
2. **`temperature` → 0.2** para `generate_deck` na tabela.
3. **Fim do "Informação não fornecida"**: cloze sem sintaxe vira basic apenas se houver `back` útil; caso contrário é descartado e contabilizado.
4. **`ACCEPTED_FILE_TYPES`**: remover DOCX/PPTX/DOC até existir extração real.

### P1 — semana (esforço médio)

5. **Cota de cartões realista**: `densityFactor` passa a ser piso/teto ("gere até N, menos se o conteúdo não sustentar") em vez de meta rígida; `comprehensive` sai de 80 para algo defensável (~150–200 chars/card) e o prompt do usuário deixa explícito que qualidade vence quantidade.
6. **Overlap no chunking**: as 2–3 últimas frases do lote anterior entram como bloco `[CONTEXTO ANTERIOR — não gere cartões daqui]`.
7. **Falha parcial visível + retry**: um retry por lote falho (com backoff), e ao final, se `failedCount > 0`, aviso "gerado parcialmente: X de Y trechos falharam" com ação de regenerar só o trecho faltante. Reembolso de energia dos lotes que falharam definitivamente.
8. **Sobreviver ao F5**: persistir o job de geração (id, deck, lotes concluídos, cartões parciais) para retomar após recarregar a aba.

### P2 — depois

9. **Roteamento por página**: páginas com pouco texto extraído re-renderizadas em alta escala e enviadas como imagem ao modelo multimodal.
10. **DOCX/PPTX de verdade** (mammoth e equivalente), religando os tipos no seletor.
11. **Dedup mais leve** que o O(n²) atual e vínculo com tags/conceitos.

## Detalhes técnicos

- Arquivos: `supabase/functions/generate-deck/index.ts` (mapCardType, densityFactor, prompt default), `src/components/ai-deck/useAIDeckFlow.ts` (overlap, retry, aviso parcial, persistência), `src/lib/pdfUtils.ts` (overlap no split, render em alta escala), `src/types/ai.ts` (`ACCEPTED_FILE_TYPES`), `src/stores/usePendingDecks.ts` (persistência), linha `ai_prompts.generate_deck` (prompt + temperature, via ferramenta de dados).
- Nada de mudança no FSRS, no schema de cards ou na UI de estudo.

## Validação

- Rodar o mesmo PDF de teste antes e depois do P0 e comparar: cartões com "Informação não fornecida" (deve ir a zero), respostas com mais de um item independente, siglas não expandidas, cards com fonte referenciada.
- Teste de lote falho simulado: confirmar aviso de geração parcial e ausência de cobrança dupla.
- Suíte Vitest existente deve continuar verde.
