

# Melhorar cobertura de conteúdo na geração de decks por IA

## Implementado

### 1. PAGES_PER_BATCH reduzido de 10 → 3
Menos texto por chamada = análise mais profunda e exaustiva do conteúdo.

### 2. densityFactor reduzido
- Essential: 600 → 400
- Standard: 250 → 150
- Comprehensive: 120 → 80
Mais cards solicitados por batch, forçando cobertura mais completa.

### 3. Structured Output (tool calling) no generate-deck
Substituído JSON livre por tool calling com schema definido. Elimina truncamento de JSON e garante schema correto.

### 4. Threshold de deduplicação: 0.8 → 0.9
Apenas cards com 90%+ de palavras idênticas são removidos, preservando subtópicos similares.

### 5. Checklist de cobertura no prompt
Instrução adicionada ao final do prompt para o modelo verificar que cada parágrafo tem pelo menos 1 card.

## Trade-offs
- +3x mais chamadas API (mais créditos gastos por geração)
- Mais cards gerados por batch
- Melhor cobertura especialmente para conteúdo denso (medicina, direito, etc.)
