

# Correcao: Importacao de .apkg grandes trava/nao carrega

## Problema

O parser atual do Anki (`src/lib/ankiParser.ts`) extrai **todas** as midias do arquivo .apkg de uma vez, convertendo cada uma para data URL (base64) via `FileReader`. Isso e:

1. **Extremamente lento** -- cada arquivo passa por: descompressao ZIP -> blob -> FileReader -> base64. Sequencialmente.
2. **Consome muita memoria** -- um .apkg com 500 imagens de 200KB cada = ~100MB de data URLs em memoria (base64 infla ~33%).
3. **Bloqueia a thread principal** -- nao ha feedback de progresso, o app parece travar.

O Anki desktop lê do disco sob demanda; nosso parser tenta tudo de uma vez no browser.

## Solucao

Substituir data URLs por **Blob URLs** (`URL.createObjectURL`) e fazer a extracao de forma **lazy** (sob demanda) + **paralela** (em lotes).

### Mudanca 1: Extracao lazy com Blob URLs

**Arquivo:** `src/lib/ankiParser.ts` -- funcao `extractMedia`

Em vez de ler todos os arquivos e converter para base64:
- Ler apenas o mapeamento JSON (`media` file) para saber quais nomes existem
- Criar um `LazyMediaMap` que resolve midias sob demanda quando referenciadas
- Usar `URL.createObjectURL(blob)` em vez de `FileReader.readAsDataURL` (instantaneo, sem overhead de encoding)

Isso reduz o tempo de parse de minutos para segundos, pois so descomprime as midias que sao realmente usadas nos cards.

### Mudanca 2: Resolver midias apenas nos cards referenciados

**Arquivo:** `src/lib/ankiParser.ts` -- funcao `replaceMediaRefs` e fluxo principal

- Apos construir os cards, fazer um scan dos `src="..."` para identificar quais midias sao realmente usadas
- Extrair apenas essas do ZIP (em paralelo, lotes de 20)
- Substituir as referencias nos cards com os Blob URLs

### Mudanca 3: Feedback de progresso durante o parse

**Arquivo:** `src/components/ImportCardsDialog.tsx`

- Adicionar um estado de progresso (`ankiProgress`) com mensagens tipo "Lendo banco de dados...", "Extraindo imagens (42/180)..."
- Mostrar uma barra de progresso durante o carregamento do Anki
- Para isso, `parseApkgFile` recebera um callback opcional `onProgress`

## Detalhes tecnicos

### Nova funcao `extractMedia` (simplificada)

```typescript
async function extractMedia(
  zip: JSZip,
  referencedFiles: Set<string>,
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, string>> {
  // 1. Ler mapeamento
  const mediaMapping = JSON.parse(await zip.files['media'].async('text'));

  // 2. Filtrar apenas midias referenciadas
  const needed = Object.entries(mediaMapping)
    .filter(([_, name]) => referencedFiles.has(name as string));

  // 3. Extrair em lotes paralelos com Blob URLs
  const BATCH = 20;
  const mediaMap = new Map<string, string>();
  for (let i = 0; i < needed.length; i += BATCH) {
    const batch = needed.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([num, name]) => {
      const blob = await zip.files[num].async('blob');
      mediaMap.set(name, URL.createObjectURL(blob));
    }));
    onProgress?.(Math.min(i + BATCH, needed.length), needed.length);
  }
  return mediaMap;
}
```

### Fluxo revisado no `parseApkgFile`

1. Abrir ZIP e banco SQLite (rapido)
2. Parsear models e construir cards **sem midias** (rapido)
3. Scan dos cards para coletar nomes de midias referenciadas
4. Extrair apenas midias usadas, em paralelo, com Blob URLs
5. Substituir referencias nos cards

### Limpeza de Blob URLs

Adicionar limpeza dos Blob URLs quando o dialog fecha ou o import finaliza, para evitar memory leaks. Isso sera feito no `reset()` do `ImportCardsDialog`.

## Arquivos modificados

| Arquivo | Mudanca |
|---|---|
| `src/lib/ankiParser.ts` | Refatorar `extractMedia` para lazy + Blob URLs; adicionar callback `onProgress`; reordenar fluxo para extrair midia apos scan dos cards |
| `src/components/ImportCardsDialog.tsx` | Adicionar estado de progresso; passar callback; limpar Blob URLs no reset |

## Impacto esperado

- Arquivo com 1000+ midias: de **minutos** (ou timeout) para **segundos**
- Uso de memoria: reducao de ~33% (sem overhead de base64)
- UX: usuario ve progresso em vez de tela travada
