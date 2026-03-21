

## Problema Identificado

O contador de "novos" no dashboard (e nas RPCs) está inflado porque inclui **cartões enterrados** (state=0, scheduled_date=amanhã) e **cartões criados que não deveriam entrar na fila de hoje**. O filtro atual apenas exclui cartões congelados (+50 anos), mas não exclui enterrados.

### Causa raiz

Nas RPCs `get_all_user_deck_stats`, `get_deck_stats` e `get_plan_metrics`, o `new_count` usa:
```sql
COUNT(*) FILTER (WHERE c.state = 0 AND c.scheduled_date <= now() + interval '50 years')
```
Isso inclui cartões enterrados (scheduled_date = amanhã). Já a query real do estudo filtra corretamente com `scheduled_date <= endOfToday`.

O resultado: o dashboard mostra 35 cards, mas ao abrir a sessão de estudo, a fila real pode ter menos (ou o mesmo número se não houver enterrados, mas inclui cartões que deveriam estar filtrados).

### Correção

Uma migration SQL para atualizar 3 funções:

1. **`get_all_user_deck_stats`** — Mudar o filtro de `new_count` de `<= 50 years` para `<= end_of_user_today` (usando o timezone offset do usuário):
   ```sql
   -- De:
   COUNT(*) FILTER (WHERE c.state = 0 AND c.scheduled_date <= ft.threshold)
   -- Para:
   COUNT(*) FILTER (WHERE c.state = 0 AND (c.scheduled_date IS NULL OR c.scheduled_date <= (ut.today_date + interval '1 day' - interval '1 second')))
   ```
   Onde `ut.today_date` é o dia do usuário em SP.

2. **`get_deck_stats`** — Mesma correção para `new_count`.

3. **`get_plan_metrics`** — Mantém `total_new` contando TODOS os novos (incluindo enterrados) porque o plano de estudo precisa do total geral para calcular carga futura. Sem alteração aqui.

### Detalhes técnicos

- O `end_of_user_today` será calculado como `(today_date + interval '1 day' - interval '1 second')` usando o `p_tz_offset_minutes`, convertido de volta para UTC para comparar com `scheduled_date` (que está em UTC).
- Expressão correta: `c.scheduled_date <= ((ut.today_date + interval '1 day') AT TIME ZONE 'UTC' - (p_tz_offset_minutes || ' minutes')::interval)` para converter end-of-day local para UTC.
- Cartões congelados (+100 anos) continuam automaticamente excluídos por essa lógica.
- Nenhuma alteração no frontend necessária — os componentes já consomem os valores das RPCs.

