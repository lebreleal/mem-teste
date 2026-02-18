

# Corrigir deploy no Coolify - package-lock.json desatualizado

## Problema

O deploy falha no passo `npm ci` porque o `package-lock.json` esta desatualizado em relacao ao `package.json`. O Lovable usa `bun` internamente e atualiza o `bun.lockb`, mas o `package-lock.json` fica desatualizado.

Erro principal:
```
npm ci can only install packages when your package.json and package-lock.json are in sync
```

## Solucao

Regenerar o `package-lock.json` deletando o arquivo atual e recriando-o. Isso forca o Lovable a gerar um lockfile novo e sincronizado.

### Mudanca

| Arquivo | Acao |
|---------|------|
| `package-lock.json` | Deletar e recriar (regenerar) |

## Recomendacao extra (no Coolify)

Para evitar que isso aconteca novamente no futuro, configure o Coolify para usar `npm install` em vez de `npm ci` nas configuracoes de build. O `npm install` e mais tolerante com lockfiles desatualizados.

No painel do Coolify:
1. Va nas configuracoes do recurso
2. Procure "Install Command" ou crie um Nixpacks config
3. Mude de `npm ci` para `npm install`

Isso resolve o problema permanentemente sem precisar mexer no codigo.
