

# Corrigir Login com Google

## Problema
Duas causas identificadas:

1. **Provider Google nao habilitado no Supabase** -- o erro `validation_failed: Unsupported provider` confirma isso
2. **OAuth via redirect nao funciona em iframe** -- o preview do Lovable roda em iframe, e navegadores bloqueiam cookies de terceiros no redirect

## O que voce precisa fazer (configuracao externa)

1. Acesse o painel do Supabase: https://supabase.com/dashboard/project/sansumuehxdnmvnswygr/auth/providers
2. Encontre **Google** na lista de providers
3. Ative o toggle
4. Insira o **Client ID** e **Client Secret** do Google Cloud Console
5. Salve

Se ainda nao criou as credenciais no Google Cloud Console:
- Acesse https://console.cloud.google.com/apis/credentials
- Crie um **OAuth Client ID** (tipo: Web application)
- Em **Authorized JavaScript origins**, adicione: `https://memocards.com.br` e `https://id-preview--cf7450a5-4ce6-4136-b663-b06c2fe28ed3.lovable.app`
- Em **Authorized redirect URIs**, adicione: `https://sansumuehxdnmvnswygr.supabase.co/auth/v1/callback`

## Alteracao no codigo

### Arquivo: `src/hooks/useAuth.tsx`
- Alterar `signInWithGoogle` para usar **popup** ao inves de redirect
- Usar `skipBrowserRedirect: true` para obter a URL do OAuth
- Abrir essa URL em `window.open()` (popup)
- Isso resolve o problema de cookies bloqueados em iframe

### Arquivo: `src/pages/Auth.tsx`
- Atualizar `handleGoogle` para tratar o caso do popup ser bloqueado pelo navegador
- Mostrar mensagem amigavel se o popup for bloqueado

## Secao tecnica

```text
signInWithGoogle mudanca:
  ANTES:  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ... } })
  DEPOIS: supabase.auth.signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true } })
          + window.open(data.url, popup)
          + listener para detectar conclusao do login
```

Arquivos modificados: 2 (`useAuth.tsx`, `Auth.tsx`)
