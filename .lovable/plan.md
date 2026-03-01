

# Corrigir Calculo de Tempo de Estudo e Adicionar Estatisticas

## Problema

O calculo de tempo de estudo no StatusBar/Dashboard esta inflado (mostra 45min quando foram ~30min reais). A causa esta na funcao `calcMinutesFromLogs` em `studyService.ts`:

1. **Sem validacao de range**: usa `elapsed_ms` direto, sem verificar se esta entre 1.5s e 120s (a tela de Atividade faz essa validacao corretamente)
2. **Possivel dupla contagem**: quando `elapsed_ms` existe, ele e somado integralmente, mas o bonus de sessao tambem pode ser adicionado indiretamente
3. **Falta estatisticas**: nao ha breakdown mostrando distribuicao dos cards por estado (Novos, Aprendendo, Dominados, Reaprendendo)

## Solucao

### Mudanca 1: Corrigir `calcMinutesFromLogs` em `studyService.ts`

Reescrever a funcao para alinhar com a logica correta da `ActivityView`:

- Usar `elapsed_ms` **somente** se estiver entre 1500ms e 120000ms
- Se `elapsed_ms` ausente ou fora do range, usar fallback baseado no gap entre reviews
- Gap > 5min = quebra de sessao, conceder bonus de 15s (nao o gap inteiro)
- Primeiro card da sessao = 15s de estimativa se nao tiver `elapsed_ms`

**Antes (bugado):**
```text
if (log.elapsed_ms) {
  totalMs += log.elapsed_ms;  // Sem validacao!
}
```

**Depois (corrigido):**
```text
if (log.elapsed_ms && log.elapsed_ms >= 1500 && log.elapsed_ms <= 120000) {
  ms = log.elapsed_ms;
} else if (gap >= 1500 && gap <= 120000) {
  ms = gap;
} else if (gap > 120000) {
  ms = 15000; // bonus de sessao
}
```

### Mudanca 2: Adicionar resumo de estatisticas na ActivityView

Adicionar uma secao de estatisticas no `ActivityView.tsx` mostrando:

- Distribuicao por estado: % Novos, % Aprendendo, % Dominados, % Reaprendendo
- Tempo medio por card
- Total acumulado do mes selecionado

Usa os dados de `review_logs` ja carregados (sem chamadas extras ao banco).

## Arquivos modificados

| Arquivo | Mudanca |
|---|---|
| `src/services/studyService.ts` | Reescrever `calcMinutesFromLogs` com validacao de range alinhada ao ActivityView |
| `src/pages/ActivityView.tsx` | Adicionar secao de estatisticas com breakdown por estado dos cards |

## Impacto esperado

- Tempo de estudo no Dashboard/StatusBar passa a bater com o tempo real
- Usuario ve estatisticas uteis sobre a composicao do seu estudo

