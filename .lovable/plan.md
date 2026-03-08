
# Análise: Uso de Dados Reais vs Estimativas no Sistema

## Problemas Identificados

### 1. **RPC `get_avg_seconds_per_card` - Estimativas Baseadas em Intervalos**
- **PROBLEMA**: Usa gaps entre `reviewed_at` timestamps em vez do campo `elapsed_ms` que contém o tempo real
- **CONSEQUÊNCIA**: Inclui tempo de pausa, troca de app, distrações
- **SOLUÇÃO**: Criar RPC baseada em `elapsed_ms` real por estado de card

### 2. **Multiplicadores em `studyUtils.ts` - Estimativas Teóricas**
- **PROBLEMA**: Usa multiplicadores fixos (novos×3, aprendendo×1.5) em vez de dados históricos reais
- **CONSEQUÊNCIA**: Não reflete o comportamento real do usuário específico
- **SOLUÇÃO**: Calcular quantas vezes cada card realmente retorna na sessão baseado no histórico

### 3. **Fallbacks Genéricos - Chutes Globais**
- **PROBLEMA**: Para usuários novos, usa 30s fixo ou média dos top-10 usuários
- **CONSEQUÊNCIA**: Não representa o perfil real do usuário
- **SOLUÇÃO**: Usar dados reais assim que disponível, fallback mínimo apenas para primeiros dias

### 4. **Capacidade Global - Estimativa Teórica**
- **PROBLEMA**: `daily_study_minutes` no perfil pode ser um valor desejado, não real
- **CONSEQUÊNCIA**: Planejamento baseado em intenção, não realidade
- **SOLUÇÃO**: Calcular capacidade real baseada no histórico de `elapsed_ms` dos últimos 30 dias

## Implementação da Solução

### A. Nova RPC: `get_user_real_study_metrics`
```sql
-- Retorna métricas reais do usuário baseadas em elapsed_ms:
-- - Tempo médio por estado de card (new, learning, review)
-- - Tempo real de estudo por dia (últimos 30 dias)
-- - Taxa de retenção de cards na sessão por estado
-- - Padrão real de repetições por card novo
```

### B. Substituir `estimateStudySeconds` por `calculateRealStudyTime`
- Input: contadores de cards + métricas reais do usuário
- Lógica: usar dados históricos reais de elapsed_ms por estado
- Fallback: apenas para primeiros 5 cards de cada tipo

### C. Capacidade Real vs Teórica
- Calcular capacidade real baseada no histórico de `elapsed_ms`
- Usar como base para planejamento em vez do valor "desejado" no perfil
- Mostrar diferença entre "meta" (perfil) e "realidade" (histórico)

### D. Métricas de Sessão Reais
- Rastrear quantas vezes cada card retorna na mesma sessão
- Usar esse padrão real para próximas estimativas
- Adaptar conforme o algoritmo FSRS/SM2 real do usuário

## Arquivos a Modificar

### Database
- **Nova migration**: RPC `get_user_real_study_metrics`
- **Atualizar**: RPC existente para incluir breakdown por estado

### Core Logic
- **`src/lib/studyUtils.ts`**: Substituir estimativas por cálculos reais
- **`src/services/studyService.ts`**: Integrar métricas reais
- **`src/hooks/useStudyPlan.ts`**: Usar dados reais em vez de estimativas

### UI Components
- **`src/components/dashboard/DeckCarousel.tsx`**: Exibir tempo real vs estimado
- **`src/components/study-plan/PlanComponents.tsx`**: Mostrar dados reais
- **`src/components/study-plan/StudyPlanHome.tsx`**: Indicadores de precisão

## Resultado Esperado

1. **Zero estimativas** - Apenas dados reais do usuário
2. **Precisão alta** - Previsões baseadas no comportamento real
3. **Transparência** - Usuário vê diferença entre meta e realidade
4. **Adaptação** - Sistema aprende com padrões reais do usuário
5. **Fallback mínimo** - Apenas para primeiros dias/cards de cada tipo

## Validação

- Comparar previsão com sessão real após implementação
- Verificar se tempo estimado ≈ tempo real (margem ±10%)
- Confirmar que não há mais multiplicadores teóricos
- Garantir que todos os cálculos usam `elapsed_ms` real
