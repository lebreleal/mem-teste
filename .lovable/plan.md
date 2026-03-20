

# Plano: Corrigir Erro de Deploy (Railway/Nixpacks)

## Diagnóstico

Dois problemas no deploy:

1. **Node.js via apt = versão 18** — O `nixpacks.toml` instala Node via `aptPkgs = ["nodejs", "npm"]`, que no Ubuntu Noble entrega Node.js **18.x**. Muitas dependências do projeto (Vite 5, vitest 3, etc.) exigem Node **>=20**.

2. **`SecretsUsedInArgOrEnv`** — Nixpacks injeta as variáveis `VITE_*` como `ENV` no Dockerfile gerado. O Docker BuildKit avisa que isso expõe segredos. Para variáveis VITE públicas (publishable key), isso é apenas um warning, mas pode causar falha dependendo da config do builder.

## Mudança

**Arquivo: `nixpacks.toml`**

Trocar `aptPkgs` por `nixPkgs` com Node.js 20 (que já inclui npm):

```toml
[phases.setup]
nixPkgs = ["nodejs_20"]
aptPkgs = []

[phases.install]
cmds = ["npm install --legacy-peer-deps"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npx serve dist -s -l 3000"
```

Isso resolve ambos os problemas:
- Node 20 é compatível com todas as dependências
- Nixpacks com nixPkgs gerencia o Node corretamente sem conflitos de apt

## Impacto

- Apenas o arquivo `nixpacks.toml` é alterado
- Zero impacto no código ou no preview do Lovable
- Deploy volta a funcionar

