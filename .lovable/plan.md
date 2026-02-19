
# Corrigir Bug de Fuso Horario nos Limites Diarios

## Problema

A funcao `get_study_queue_limits` no banco de dados usa `CURRENT_DATE` do Postgres (UTC) para contar quantos cards novos e de revisao foram estudados "hoje". Como o usuario esta no Brasil (UTC-3), a partir das 21h (meia-noite UTC) o contador zera e o sistema libera mais 20 cards novos indevidamente.

Dados reais do banco:
- 20+ reviews feitas no dia 18/fev entre 22:00-23:41 UTC
- Servidor agora em 19/fev UTC = ainda 18/fev no Brasil
- RPC retorna `new_reviewed_today = 1` (so conta 1 review apos meia-noite UTC)

## Solucao

Passar o offset de timezone do cliente para a funcao RPC, para que ela calcule "hoje" no fuso horario do usuario.

### 1. Alterar a funcao RPC no banco

Adicionar parametro `p_tz_offset_minutes` (inteiro, ex: -180 para UTC-3):

```sql
CREATE OR REPLACE FUNCTION public.get_study_queue_limits(
  p_user_id uuid,
  p_card_ids uuid[],
  p_tz_offset_minutes integer DEFAULT 0
)
RETURNS TABLE(new_reviewed_today bigint, review_reviewed_today bigint)
LANGUAGE sql STABLE
AS $$
  WITH user_today AS (
    SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
  ),
  today_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM review_logs rl, user_today ut
    WHERE rl.card_id = ANY(p_card_ids)
      AND rl.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut.today_date
  ),
  prior_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM review_logs rl, user_today ut
    WHERE rl.card_id = ANY(p_card_ids)
      AND rl.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date < ut.today_date
  )
  SELECT
    COUNT(*) FILTER (WHERE tr.card_id IS NOT NULL AND pr.card_id IS NULL) AS new_reviewed_today,
    COUNT(*) FILTER (WHERE tr.card_id IS NOT NULL AND pr.card_id IS NOT NULL) AS review_reviewed_today
  FROM today_reviewed tr
  LEFT JOIN prior_reviewed pr ON pr.card_id = tr.card_id;
$$;
```

### 2. Atualizar `fetchStudyQueue` em `src/services/studyService.ts`

Passar o offset do timezone do navegador na chamada RPC:

```typescript
const tzOffsetMinutes = -new Date().getTimezoneOffset(); // JS retorna invertido

const { data: limits } = await supabase.rpc('get_study_queue_limits', {
  p_user_id: userId,
  p_card_ids: limitCardIds,
  p_tz_offset_minutes: tzOffsetMinutes,
});
```

Nota: `new Date().getTimezoneOffset()` retorna 180 para UTC-3, mas com sinal invertido (positivo = atras de UTC). Multiplicamos por -1 para obter o offset correto (-180 para UTC-3).

### 3. Atualizar o filtro de cards na mesma funcao

O filtro OR na query de cards tambem precisa considerar o timezone para a data atual:

```typescript
const now = new Date();
// ... existing code ...
```

Esse trecho ja usa `new Date()` do JavaScript (que e local), entao esta correto.

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| Nova migration SQL | Alterar funcao `get_study_queue_limits` para aceitar timezone |
| `src/services/studyService.ts` | Passar `p_tz_offset_minutes` na chamada RPC |

## Resultado

- O limite diario de 20 cards novos sera calculado com base no dia do usuario (horario de Brasilia)
- O contador so vai zerar a meia-noite no fuso do usuario, nao a meia-noite UTC
- Compativel com qualquer timezone (o offset e calculado no navegador)
