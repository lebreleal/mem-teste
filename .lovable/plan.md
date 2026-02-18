
# Impersonar Usuario (Admin)

## Resumo

Criar um sistema seguro de impersonacao onde o admin pode "entrar" na conta de qualquer usuario, ver e interagir com tudo como se fosse ele, e depois voltar para a sessao admin.

## Como Funciona

1. Na tela de AdminUsers, ao abrir um usuario, aparece um botao "Entrar como este usuario"
2. Uma edge function (com service role) gera um magic link para o email do usuario alvo
3. O frontend salva a sessao admin atual no sessionStorage
4. O frontend usa o token do magic link para autenticar como o usuario alvo
5. Um banner fixo aparece no topo da tela indicando "Voce esta como [nome] - Voltar para Admin"
6. Ao clicar "Voltar", restaura a sessao admin original

## Seguranca

- A edge function valida que quem esta chamando e admin (via `has_role`)
- O service role key ja esta configurado como secret
- A sessao admin original fica apenas em sessionStorage (nao persiste entre abas)
- Se fechar o navegador, a sessao de impersonacao expira normalmente

## Detalhes Tecnicos

### 1. Edge Function `admin-impersonate`

- Recebe `target_user_id`
- Valida que o caller e admin usando `getClaims` + checagem no banco
- Busca o email do usuario alvo via `auth.admin.getUserById`
- Gera link via `auth.admin.generateLink({ type: 'magiclink', email })`
- Retorna o `hashed_token` extraido da URL

### 2. Frontend - Fluxo de Impersonacao

No `AdminUsers.tsx`:
- Botao "Entrar como usuario" no perfil do usuario selecionado
- Ao clicar:
  - Salva sessao atual em `sessionStorage.setItem('admin_session', JSON.stringify(session))`
  - Chama a edge function
  - Usa `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` para autenticar
  - Redireciona para `/dashboard`

### 3. Banner de Impersonacao

Novo componente `ImpersonationBanner.tsx`:
- Fica fixo no topo da tela quando `sessionStorage.getItem('admin_session')` existe
- Mostra nome do usuario sendo impersonado
- Botao "Voltar para Admin" que:
  - Faz `signOut`
  - Restaura a sessao admin via `supabase.auth.setSession(adminSession)`
  - Remove do sessionStorage
  - Redireciona para `/admin/users`

### 4. Integracao

- `ProtectedRoute.tsx`: renderiza o `ImpersonationBanner` quando ativo
- `supabase/config.toml`: adiciona config da nova function com `verify_jwt = false`

### Arquivos

| Acao | Arquivo |
|------|---------|
| Criar | `supabase/functions/admin-impersonate/index.ts` |
| Criar | `src/components/ImpersonationBanner.tsx` |
| Editar | `src/pages/AdminUsers.tsx` - botao de impersonar |
| Editar | `src/components/ProtectedRoute.tsx` - renderizar banner |
| Editar | `supabase/config.toml` - config da function |
