

## Diagnóstico: Por que a cobertura não chega a 100%

Analisei o fluxo completo (useAIDeckFlow → generate-deck edge function) e identifiquei **4 causas raiz**:

### Causa 1: PAGES_PER_BATCH = 10 (muito alto)
O código atual envia **10 páginas por lote** ao modelo. Com PDFs densos (ex: slides médicos), isso resulta em ~15-40K caracteres por chamada. O modelo "escaneia" superficialmente em vez de fazer varredura exaustiva. A memória do projeto recomenda **3 páginas por lote**, mas o código atual usa 10.

### Causa 2: densityFactor subestima a quantidade necessária
O cálculo automático de cards por batch usa `chars / densityFactor`:
- Standard: 250 chars/card → PDF de 10K chars = apenas 40 cards
- Comprehensive: 120 chars/card → PDF de 10K chars = 83 cards

Para conteúdo denso (medicina), 250 chars/card é muito alto — um único parágrafo de 250 chars pode conter 3-5 conceitos distintos.

### Causa 3: Resposta JSON pode ser truncada
O modelo usa `max_tokens: 65000`, mas com thinking tokens consumindo parte do budget, a resposta efetiva pode ser menor. Se `finish_reason: "length"`, cards são perdidos. O código tenta recuperar JSON truncado, mas cards incompletos são descartados.

### Causa 4: Deduplicação remove cards legítimos
O threshold de similaridade é 0.8 (80% de palavras em comum). Para conteúdo médico onde termos se repetem (ex: "pressão", "artéria", "ventrículo"), cards sobre subtópicos diferentes podem ser classificados como duplicatas.

---

## Plano de Correção

### 1. Reduzir PAGES_PER_BATCH de 10 → 3
**Arquivo**: `src/components/ai-deck/useAIDeckFlow.ts` (linha 311)

Menos texto por chamada = análise mais profunda. Trade-off: mais chamadas API (mais créditos), mas cobertura significativamente melhor. Isso alinha com a configuração original documentada no projeto.

### 2. Reduzir densityFactor para gerar mais cards
**Arquivo**: `src/components/ai-deck/useAIDeckFlow.ts` (linha 335)

Valores atuais → novos:
- Essential: 600 → 400
- Standard: 250 → 150
- Comprehensive: 120 → 80

Isso aumenta a quantidade de cards solicitados por batch, forçando o modelo a cobrir mais conteúdo.

### 3. Usar Structured Output (tool calling) no generate-deck
**Arquivo**: `supabase/functions/generate-deck/index.ts`

Trocar JSON livre por tool calling (como já usado no enhance-card e enhance-import). Benefícios:
- Elimina problemas de parsing JSON truncado
- Garante schema correto (front/back/type/options)
- O modelo não "gasta" tokens com markdown/formatação
- Reduz finish_reason=length porque a resposta é mais eficiente

### 4. Reduzir threshold de deduplicação de 0.8 → 0.9
**Arquivo**: `src/components/ai-deck/useAIDeckFlow.ts` (linha 267)

Apenas cards com 90%+ de palavras idênticas serão removidos, preservando cards sobre subtópicos similares.

### 5. Adicionar instrução de "checklist de cobertura" no prompt
**Arquivo**: `supabase/functions/generate-deck/index.ts`

Adicionar ao final do user prompt: uma instrução para o modelo verificar se cada seção/parágrafo do conteúdo tem pelo menos um card correspondente antes de finalizar.

### Resumo de impacto

| Mudança | Impacto na cobertura | Impacto no custo |
|---|---|---|
| PAGES_PER_BATCH 10→3 | Alto (principal) | +3x mais chamadas |
| densityFactor reduzido | Médio | Neutro (mesmo nº chamadas) |
| Tool calling | Médio (menos truncamento) | Neutro |
| Threshold dedup 0.8→0.9 | Baixo | Neutro |
| Checklist no prompt | Baixo-médio | +tokens thinking |

### Arquivos a editar:
- `src/components/ai-deck/useAIDeckFlow.ts` — PAGES_PER_BATCH, densityFactor, threshold dedup
- `supabase/functions/generate-deck/index.ts` — tool calling, checklist prompt

