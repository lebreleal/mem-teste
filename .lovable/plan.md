

## Plano: Remover PdfCanvasViewer e manter BuyCreditsDialog

### O que muda

1. **Deletar `src/components/lesson-detail/PdfCanvasViewer.tsx`** — o viewer de PDF em canvas

2. **Atualizar `src/components/lesson-detail/LessonDialogs.tsx`**:
   - Remover o lazy import do `PdfCanvasViewer` (linha 18)
   - Remover o import de `Suspense` se não for mais usado
   - Remover o bloco do PDF Preview Dialog (linhas ~183-197) — o dialog que abre quando clica em "Visualizar PDF"
   - Remover as props `pdfPreviewUrl`, `setPdfPreviewUrl`, `pdfPreviewRestricted` da interface e dos parâmetros do componente

3. **Atualizar quem chama `LessonDialogs`** — remover a passagem das props `pdfPreviewUrl`, `setPdfPreviewUrl`, `pdfPreviewRestricted` no componente pai (provavelmente `LessonDetail.tsx` ou `LessonContent.tsx`)

### O que NÃO muda

- `BuyCreditsDialog.tsx` — **mantido** para futura integração de pagamento

### Impacto

- Usuários não poderão mais pré-visualizar PDFs dentro das aulas (o botão de preview será removido ou ficará sem ação)
- ~85 linhas removidas

