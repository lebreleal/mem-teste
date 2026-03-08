

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

### 6. Otimização de Múltipla Escolha (MC)
- Distribuição: Cloze 55%, Basic 35%, MC 10% (antes 50/30/20)
- MC só para diferenciação de 3+ conceitos similares
- Opções limitadas a exatamente 4, max 8 palavras cada
- Economia estimada: ~25% tokens de output

## Trade-offs
- +3x mais chamadas API (mais créditos gastos por geração)
- Mais cards gerados por batch
- Melhor cobertura especialmente para conteúdo denso (medicina, direito, etc.)
- MC mais focado e pedagógico (diferenciação, não trivial)

---

# Rebalanceamento da Economia de Créditos IA

## Implementado

### 1. Redução de recompensas de missões (~75%)
| Missão | Antes | Depois |
|--------|-------|--------|
| daily_study_5 | 3 | 1 |
| daily_study_20 | 5 | 2 |
| daily_study_50 | 10 | 3 |
| daily_minutes_10 | 3 | 1 |
| daily_minutes_30 | 8 | 2 |
| weekly_100 | 15 | 5 |
| weekly_300 | 30 | 8 |

Total mensal free: ~1.500 → ~270 créditos.

### 2. Milestones de estudo removidos
Removidos os bônus de +5 (50 cards) e +10 (100 cards) do energyService.ts.

### 3. Bônus mensal premium implementado
500 créditos/mês concedidos automaticamente via check-subscription.
Usa reference_id único por período para evitar duplicatas.

### 4. Copy do PremiumModal atualizado
"1.500 créditos por mês" → "500 créditos por mês".

---

# Transação com Rollback de Créditos em Edge Functions

## Implementado

### 1. RPC `refund_energy` criada no banco
Função PostgreSQL que incrementa `energy` no perfil do usuário para devolver créditos.

### 2. `refundEnergy()` em `_shared/utils.ts`
Helper que chama a RPC com tratamento de erro silencioso (log only).

### 3. Rollback em todas as 5 edge functions
- `generate-deck`: refund em erros AI (429/502/503), parse errors, 0 cards gerados
- `enhance-card`: refund em erros AI e parse errors
- `enhance-import`: refund em erros AI e parse errors
- `ai-tutor`: refund em erros pré-stream (429/502/503/connection error)
- `ai-chat`: refund em erros pré-stream (429/502/503/connection error)

### Nota sobre streaming
Para `ai-tutor` e `ai-chat`, o refund só ocorre se a API falhar ANTES de iniciar o stream.
Se o stream já começou, os créditos são considerados consumidos legitimamente.
