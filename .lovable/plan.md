

# Correcao do Timing na RPC get_forecast_params

## O que muda

Atualizar a RPC `get_forecast_params` com 3 correcoes no bloco `timing`:

1. **Corte de sessao**: Gaps > 5 minutos (300s) entre reviews sao descartados (eram pausas/intervalos entre sessoes, nao tempo real de estudo)
2. **Cap reduzido**: De 90s para 60s por card
3. **Heuristica melhorada**: Para dados historicos sem `state`, usa gap > 1 dia para classificar como "dominado" (state 2) -- revisoes programadas tem gaps de dias

Nenhuma mudanca no frontend. Apenas 1 migration SQL atualizando a RPC.

## Detalhes tecnicos

Nova migration SQL com `CREATE OR REPLACE FUNCTION get_forecast_params` onde o bloco `timing` passa a:

- Calcular `raw_gap` via `LAG()` primeiro
- Descartar pontos com `raw_gap > 300` (gap entre sessoes)
- Aplicar cap de 60s nos pontos validos
- Usar `COALESCE(rl.state, heuristica)` onde a heuristica considera `raw_gap > 86400` (1 dia) para state 2
- Manter mediana (`PERCENTILE_CONT(0.5)`) em vez de media

