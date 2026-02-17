
# Enviar Paginas como Imagens para a IA (Vision API)

## Problema Atual

O sistema so extrai **texto** dos PDFs/documentos. Paginas com diagramas, graficos, formulas, tabelas visuais ou imagens sao tratadas como "sem conteudo" e geram cards ruins ou nenhum card. Isso e muito comum em materiais de faculdade (slides com imagens, esquemas, fotos de experimentos, etc).

## Solucao

Enviar cada pagina como **imagem** (base64) para a API da OpenAI usando o recurso de **Vision**. Os modelos GPT-4o e GPT-4o-mini ja suportam receber imagens e "ler" tudo: texto, diagramas, graficos, formulas, tabelas.

O texto extraido continua sendo enviado junto como complemento, mas a imagem passa a ser a fonte principal de informacao.

## Como vai funcionar para o usuario

Nada muda na interface. O usuario continua fazendo upload do arquivo, selecionando paginas e gerando cards. A diferenca e que a IA agora "enxerga" as paginas em vez de apenas ler o texto, gerando cards muito melhores para conteudo visual.

## Mudancas Tecnicas

### 1. `src/lib/pdfUtils.ts` -- Renderizar paginas em resolucao maior

Atualmente as paginas sao renderizadas em `scale: 0.4` (so para thumbnail). Vamos adicionar um segundo render em `scale: 1.0` para gerar uma imagem de qualidade suficiente para a IA interpretar.

- Novo campo `imageBase64` no tipo `PDFPageData` -- contem a imagem da pagina em base64 (JPEG, qualidade 0.6)
- A thumbnail continua em `scale: 0.4` para a UI
- A imagem para IA usa `scale: 1.0` (boa qualidade sem ser excessivamente grande)

### 2. `src/types/ai.ts` -- Adicionar campo `imageBase64` ao `PageItem`

```text
export interface PageItem {
  pageNumber: number;
  thumbnailUrl?: string;
  textContent: string;
  imageBase64?: string;   // <-- novo: imagem da pagina para enviar a IA
  selected: boolean;
}
```

### 3. `src/lib/docUtils.ts` -- Para PPTX/DOCX

Documentos Office nao podem ser renderizados como imagem no browser facilmente. Para esses formatos, o comportamento atual (so texto) sera mantido. Apenas PDFs enviarao imagens.

### 4. `src/components/ai-deck/useAIDeckFlow.ts` -- Enviar imagens junto com texto

Na funcao `handleGenerate`, ao montar os batches (de 4 paginas):
- Se a pagina tem `imageBase64`, inclui na chamada
- O campo `pageImages` (array de strings base64) e enviado junto com `textContent`

### 5. `src/services/aiService.ts` -- Novo campo `pageImages`

Adicionar campo opcional `pageImages?: string[]` ao `GenerateDeckParams` e passa-lo para a edge function.

### 6. `supabase/functions/generate-deck/index.ts` -- Usar Vision API

Esta e a mudanca principal. Quando `pageImages` estiver presente:

- Montar o campo `content` da mensagem do usuario como um array (formato multimodal da OpenAI):
  - Primeiro item: texto (o prompt com instrucoes + texto extraido)
  - Itens seguintes: cada imagem como `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }`
- O modelo GPT-4o e GPT-4o-mini ja aceitam esse formato nativamente
- Quando nao tem imagens, continua funcionando exatamente como hoje (so texto)

Exemplo do formato multimodal:
```text
messages: [
  { role: "system", content: "..." },
  { role: "user", content: [
    { type: "text", text: "prompt com instrucoes..." },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/..." } },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/..." } },
  ]}
]
```

### 7. Batch de 4 paginas (conforme ja aprovado)

O batching de 4 paginas continua valendo. Cada batch envia ate 4 imagens + texto combinado. Isso mantem o tamanho da requisicao gerenciavel (~200-400KB por batch com JPEG comprimido).

## Limites e protecoes

- Imagens renderizadas em JPEG qualidade 0.6 e `scale: 1.0` -- cada pagina fica ~50-100KB
- Maximo de 4 imagens por chamada (batch de 4)
- Texto continua sendo enviado como complemento (ajuda a IA quando o OCR dela falhar em algo)
- Para DOCX/PPTX: continua so texto (sem imagem) -- limitacao tecnica do browser
- Custo de energia nao muda para o usuario

## Resumo das alteracoes

| Arquivo | O que muda |
|---|---|
| `src/types/ai.ts` | Novo campo `imageBase64` em `PageItem` |
| `src/lib/pdfUtils.ts` | Render em `scale:1.0` e exportar base64 |
| `src/services/aiService.ts` | Novo campo `pageImages` no `GenerateDeckParams` |
| `src/components/ai-deck/useAIDeckFlow.ts` | Batch de 4 + enviar imagens |
| `supabase/functions/generate-deck/index.ts` | Formato multimodal (vision) na chamada OpenAI |
