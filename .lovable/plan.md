

# Corrigir Icone PWA que nao aparece

## Problema

O `index.html` nao possui uma tag `<link rel="icon">` referenciando o favicon. Os arquivos de icone existem em `public/` (`favicon.ico`, `pwa-192x192.png`, etc.), mas o HTML nao os referencia para exibicao na aba do navegador.

## Solucao

Adicionar a tag `<link rel="icon">` no `<head>` do `index.html` apontando para o `favicon.ico` que ja existe em `public/`.

## Mudanca

**Arquivo:** `index.html`

Adicionar dentro do `<head>`, logo apos a linha do `apple-touch-icon`:

```html
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
```

## Resultado

- O icone do elefante azul aparecera na aba do navegador
- O icone continuara funcionando no PWA (manifest ja configurado)
- iOS usa o `apple-touch-icon` que ja esta configurado

| Arquivo | Mudanca |
|---------|---------|
| `index.html` | Adicionar `<link rel="icon">` |

