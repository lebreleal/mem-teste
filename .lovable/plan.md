
## Plano: Mini-Game no Loading, Somente Texto (sem imagens), Formatos Respeitados, Remover Analise de Cobertura

### Resumo das Mudancas

Tres grandes melhorias + uma remocao:

1. **Loading interativo com mini-game do dinossauro** durante a geracao
2. **Remover processamento de imagens** - usar apenas texto extraido do PDF (mais rapido, mais barato)
3. **Forcar formatos selecionados pelo usuario** no backend
4. **Remover funcionalidade de analise de cobertura** (analyze + fill-gaps)

---

### 1. Mini-Game do Dinossauro no Loading

**Arquivo:** `src/components/ai-deck/GenerationProgress.tsx`

Reescrever completamente com:

- Canvas com mini-game estilo dino do Chrome: personagem pula (click/touch/space) sobre obstaculos
- Score visivel enquanto joga
- Status de progresso real abaixo do game: "Lote 2 de 5 - Criando seus flashcards..."
- Barra de progresso com percentual e creditos
- Dicas motivacionais rotativas ("Flashcards aumentam retencao em 50%!")
- Funciona em mobile (touch) e desktop (click/space)

Logica do game:
- Canvas ~280x120
- Dino: retangulo/emoji na esquerda, gravidade simula pulo
- Cactos: obstaculos movendo da direita pra esquerda
- Colisao reseta score
- requestAnimationFrame loop
- Cleanup no unmount

---

### 2. Remover Processamento de Imagens (Somente Texto)

A decisao e usar **apenas texto extraido** do PDF. Motivos:
- Enviar imagens para GPT-4o custa ~10x mais tokens
- A maioria dos PDFs academicos tem texto rico que o pdf.js ja extrai bem
- Elimina a necessidade de usar gpt-4o (vision), pode usar modelo mais barato
- Geracao fica ~50% mais rapida

**Arquivos afetados:**

| Arquivo | Mudanca |
|---|---|
| `src/lib/pdfUtils.ts` | Remover geracao de `imageBase64` e `aiCanvas`. Manter apenas thumbnail + texto |
| `src/components/ai-deck/useAIDeckFlow.ts` | Remover envio de `pageImages` no batch. Filtrar pages apenas por `textContent.trim().length > 0` |
| `supabase/functions/generate-deck/index.ts` | Remover toda logica de `hasPageImages`, `visionModel`, `pageImages`, content multimodal. Sempre usar modelo texto (`selectedModel`) |
| `src/services/aiService.ts` | Remover `pageImages` do `GenerateDeckParams` |
| `src/types/ai.ts` | Remover `imageBase64` do `PageItem` |

---

### 3. Forcar Formatos do Usuario no Backend

**Arquivo:** `supabase/functions/generate-deck/index.ts`

Problema atual: linha 253-255 mapeia qualquer tipo desconhecido para "basic", mesmo que o usuario nao tenha selecionado "qa".

Mudancas:
- No mapeamento final de tipos (linha 253-257), se o tipo retornado pela IA nao esta nos `formats` permitidos, converter para o **primeiro formato permitido** (ex: se usuario escolheu `['cloze', 'multiple_choice']`, converter "basic" para "cloze")
- Adicionar instrucao explicita no prompt: "PROIBIDO gerar cartoes do tipo X" para formatos nao selecionados
- Gerar exemplos de saida APENAS com os formatos selecionados

---

### 4. Remover Analise de Cobertura

Remover completamente as funcionalidades "Analisar Cobertura" e "Preencher Lacunas".

**Arquivos afetados:**

| Arquivo | Mudanca |
|---|---|
| `src/components/ai-deck/AnalysisStep.tsx` | Deletar arquivo |
| `src/components/ai-deck/types.ts` | Remover steps `'analyzing'` e `'analysis'` do tipo `Step` |
| `src/components/ai-deck/useAIDeckFlow.ts` | Remover `handleAnalyze`, `handleFillGaps`, state `analysis`, e exportacoes relacionadas |
| `src/components/ai-deck/CardReviewStep.tsx` | Remover botao "Analisar cobertura" e prop `onAnalyze` |
| `src/components/AICreateDeckDialog.tsx` | Remover import do `AnalysisStep`, remover bloco de render do step `analysis`, remover props `onAnalyze`/`onFillGaps` |
| `src/services/aiService.ts` | Remover `analyzeCoverage()`, `fillGaps()`, e interfaces `AnalyzeCoverageParams`, `FillGapsParams` |
| `src/types/ai.ts` | Remover interface `CoverageAnalysis` |
| `supabase/functions/generate-deck/index.ts` | Remover blocos `action === "analyze"` e `action === "fill-gaps"` |

---

### Detalhes Tecnicos

**Ordem de implementacao:**
1. Remover analise de cobertura (limpar codigo morto primeiro)
2. Remover processamento de imagens (simplificar pipeline)
3. Forcar formatos no backend
4. Implementar mini-game no loading

**Deploy:** Edge function `generate-deck` sera redeployada apos as mudancas.
