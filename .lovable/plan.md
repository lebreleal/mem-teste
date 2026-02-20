

## Bug: "Cartoes para hoje" nao diminui apos estudar

### Causa raiz identificada

A funcao do banco de dados `get_all_user_deck_stats` usa `CURRENT_DATE` (que e baseado em UTC) para determinar quais cards foram estudados "hoje". Porem, o fuso horario do Brasil e UTC-3, entao:

- **Agora no UTC**: 20 de fevereiro (00:21)
- **Agora no Brasil**: 19 de fevereiro (21:21)

Resultado: a funcao acha que **0 cards** foram estudados hoje, quando na verdade **15 cards** ja foram revisados no dia local do usuario.

A fila de estudo (`get_study_queue_limits`) ja recebe o fuso horario do usuario e funciona corretamente. O problema esta **apenas** na funcao que calcula as estatisticas do dashboard.

### Evidencia

```text
Funcao get_all_user_deck_stats (UTC):
  new_reviewed_today = 0    <-- ERRADO
  
Consulta com fuso horario correto:
  cards_reviewed = 15       <-- CORRETO
```

### Plano de correcao

**1. Atualizar `get_all_user_deck_stats` para aceitar timezone**

Adicionar parametro `p_tz_offset_minutes` (igual ao `get_study_queue_limits`) e substituir todas as referencias a `CURRENT_DATE` por calculos com o offset do timezone do usuario.

Antes:
```sql
rl.reviewed_at::date = CURRENT_DATE
```

Depois:
```sql
(rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date 
  = (now() + (p_tz_offset_minutes || ' minutes')::interval)::date
```

**2. Atualizar `get_deck_stats` tambem**

A funcao `get_deck_stats` (usada na pagina de detalhe do deck) tem o mesmo problema com `CURRENT_DATE`. Aplicar a mesma correcao.

**3. Atualizar o frontend para passar o timezone**

- Em `src/services/deckService.ts`: calcular `tzOffsetMinutes` e passar como parametro nas chamadas RPC
- Em qualquer outro lugar que chame `get_deck_stats` ou `get_all_user_deck_stats`

### Detalhes tecnicos

**Migracao SQL** - Recriar as duas funcoes:

- `get_all_user_deck_stats(p_user_id, p_tz_offset_minutes)`: adicionar parametro com default 0 para compatibilidade
- `get_deck_stats(p_deck_id, p_tz_offset_minutes)`: idem

**Arquivos a modificar:**

1. **Nova migracao SQL**: Recriar ambas funcoes com suporte a timezone
2. **`src/services/deckService.ts`**: Passar `p_tz_offset_minutes: -new Date().getTimezoneOffset()` na chamada RPC
3. **Qualquer outro chamador de `get_deck_stats`**: Buscar e atualizar (provavelmente em `DeckDetail` ou hooks relacionados)

### Impacto

- Corrige o contador "Cartoes para hoje" no dashboard
- Corrige o contador na pagina de detalhe do deck
- Alinha o comportamento do dashboard com a fila de estudo (ambos usarao timezone local)
- Nao quebra funcionalidade existente (parametro tem default 0)

