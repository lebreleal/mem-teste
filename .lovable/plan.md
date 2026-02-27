

## Plano: Otimizar Carregamento de Imagens de Oclusao

### Problema
As imagens de oclusao sao armazenadas em tamanho original (ate 5MB) no Supabase Storage. Quando o usuario estuda, cada card carrega a imagem completa, causando lentidao -- especialmente em redes moveis.

### Solucao: Compressao no Upload + Transformacao no Display

#### 1. Comprimir imagens no momento do upload (client-side)

Criar uma funcao utilitaria `compressImage` em `src/lib/imageUtils.ts` que:
- Usa Canvas API para redimensionar a imagem antes do upload
- Limita a largura maxima a 1200px (suficiente para oclusao com boa qualidade)
- Converte para WebP (80% qualidade) quando o browser suportar, senao JPEG 85%
- Resultado tipico: imagem de 3MB vira ~100-200KB

**Arquivo novo:** `src/lib/imageUtils.ts`

#### 2. Aplicar compressao em todos os pontos de upload de imagem

Modificar os seguintes arquivos para usar `compressImage` antes de fazer upload:
- `src/services/cardService.ts` (`uploadCardImage`) -- usado pela maioria dos fluxos
- `src/pages/ManageDeck.tsx` -- upload direto no editor de oclusao
- `src/components/RichEditor.tsx` -- upload de imagens dentro de cards basicos
- `src/components/deck-detail/DeckDetailContext.tsx` -- upload via attach/paste de oclusao

#### 3. Usar Supabase Image Transformation para imagens existentes

O Supabase Storage suporta transformacao de imagens on-the-fly via query parameters. Para imagens ja existentes (que nao foram comprimidas), modificar a URL no momento da renderizacao:

- Na funcao `renderOcclusion` em `FlashCard.tsx`, adicionar parametros de transformacao a URL da imagem:
  `imageUrl + '?width=800&quality=75'` (se for URL do Supabase)
- Isso funciona como cache automatico no CDN do Supabase

**Nota:** Image Transformations precisa estar habilitado no projeto Supabase (e um recurso do plano Pro). Se nao estiver disponivel, as imagens existentes continuarao carregando normalmente, mas as novas ja serao comprimidas.

#### 4. Lazy loading e placeholder

Adicionar `loading="lazy"` nas tags `<img>` geradas por `renderOcclusion` para que o browser so carregue quando necessario.

### Detalhes tecnicos

**`src/lib/imageUtils.ts` (novo):**
```typescript
export async function compressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.82
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Se ja e pequena, retorna original
      if (img.width <= maxWidth && file.size < 300_000) {
        resolve(file);
        return;
      }
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // fallback ao original se ficou maior
            return;
          }
          const ext = blob.type.includes('webp') ? 'webp' : 'jpg';
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, `.${ext}`), { type: blob.type }));
        },
        'image/webp', // tenta WebP primeiro
        quality
      );
    };
    img.src = URL.createObjectURL(file);
  });
}
```

**Modificacao em `uploadCardImage`:**
```typescript
import { compressImage } from '@/lib/imageUtils';

export async function uploadCardImage(userId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Maximo 5MB');
  const compressed = await compressImage(file); // <-- nova linha
  const ext = compressed.name.split('.').pop() || 'webp';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(path, compressed);
  // ...
}
```

**Modificacao em `renderOcclusion` (lazy loading):**
```html
<img src="${imageUrl}" loading="lazy" style="..." />
```

### Resumo de arquivos

| Arquivo | Acao |
|---------|------|
| `src/lib/imageUtils.ts` | Criar (funcao de compressao) |
| `src/services/cardService.ts` | Editar (usar compressImage no upload) |
| `src/pages/ManageDeck.tsx` | Editar (usar compressImage no upload) |
| `src/components/RichEditor.tsx` | Editar (usar compressImage nos 2 uploads) |
| `src/components/FlashCard.tsx` | Editar (adicionar loading="lazy" na renderOcclusion) |

### Impacto esperado

- Imagens novas: ~80-90% menores (3MB -> 200KB tipico)
- Carregamento durante estudo: significativamente mais rapido
- Imagens existentes: melhoria com lazy loading; transformacao server-side se o plano suportar
- Qualidade visual: imperceptivel para uso em flashcards (1200px de largura e mais que suficiente)

