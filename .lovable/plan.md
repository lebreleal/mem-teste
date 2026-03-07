

## Problemas Identificados

1. **Custos incorretos na tela admin individual**: O `MODEL_PRICING` no `AdminUsers.tsx` usa preços estáticos que podem não refletir a realidade do console do Google (ex: preços de cached tokens, thinking tokens, etc. são diferentes).

2. **Nomes de feature_key genéricos**: Os logs mostram `generate_deck`, `ai_tutor`, etc. - sem nomes amigáveis em português.

3. **Sem tela global de relatório**: Hoje só se vê consumo ao entrar em um usuário específico. Falta uma visão geral com filtros.

4. **Sem filtro de data**: O detailed log é fixo em 30 dias, sem opção de hoje/7d/personalizado.

## Plano

### 1. Criar RPC `admin_get_global_token_usage` (migration)

Nova função que retorna logs de TODOS os usuários com filtro de data, opcionalmente filtrado por user_id:

```sql
CREATE FUNCTION admin_get_global_token_usage(
  p_user_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid, created_at timestamptz, user_id uuid, user_name text, user_email text,
  feature_key text, model text,
  prompt_tokens integer, completion_tokens integer, total_tokens integer, energy_cost integer
)
```

Faz JOIN com `profiles` para trazer nome/email. Filtros opcionais de user_id e range de datas.

### 2. Criar página `AdminUsageReport.tsx`

Nova rota `/admin/usage` acessível do menu AdminIA. Funcionalidades:

- **Filtros no topo**: Botões rápidos (Hoje / 7 dias / 30 dias / Personalizado com date picker)
- **Filtro por usuário**: Input de busca que filtra por nome/email
- **Tabela cronológica** com colunas: Data/Hora, Usuário, Recurso (nome amigável), Modelo, Tokens (prompt/completion/total), Créditos IA, Custo USD/BRL
- **Card de resumo** no topo: total de chamadas, tokens, custo USD/BRL
- **Nomes amigáveis** para feature_key: `generate_deck` → "Gerar Deck", `ai_tutor` → "Tutor IA", `grade_exam` → "Corrigir Prova", `enhance_card` → "Aprimorar Card", `ai_chat` → "Chat IA", etc.
- Atualizar `MODEL_PRICING` com preços corretos do Google (incluindo cached input pricing)

### 3. Adicionar link no menu AdminIA

Novo card "Relatório de Uso IA" no menu principal do AdminIA, linkando para `/admin/usage`.

### 4. Adicionar rota no App.tsx

Registrar `/admin/usage` com ProtectedRoute.

### 5. Melhorar aba IA do usuário individual

- Adicionar filtros de data (hoje/7d/30d/personalizado) na aba IA do `AdminUsers.tsx`
- Usar os mesmos nomes amigáveis de feature_key

### Arquivos a criar/editar:
- **Criar**: `src/pages/AdminUsageReport.tsx`
- **Criar**: migration SQL para `admin_get_global_token_usage`
- **Editar**: `src/pages/AdminIA.tsx` (link no menu)
- **Editar**: `src/App.tsx` (nova rota)
- **Editar**: `src/pages/AdminUsers.tsx` (filtros de data, nomes amigáveis)
- **Editar**: `src/hooks/useAdminUsers.ts` (suporte a filtro de data nos RPCs existentes)

