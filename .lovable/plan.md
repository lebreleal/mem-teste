

# Corrigir Lock File - Adicionar Dependencias Transitivas Ausentes

## Problema

O `package-lock.json` tem o `@testing-library/jest-dom` registrado, mas esta faltando 11 dependencias transitivas que o `npm ci` exige. As tentativas anteriores de remover/adicionar o pacote nao resolveram porque o sistema de build do Lovable nao regenera completamente as sub-dependencias.

## Solucao

Adicionar manualmente as 11 entradas ausentes diretamente no `package-lock.json`. Cada entrada precisa ter: version, resolved URL, integrity hash, e license.

## Pacotes a adicionar

1. `@testing-library/dom@10.4.1` - dependencia peer do jest-dom
2. `@babel/code-frame@7.29.0` - sub-dep do testing-library/dom
3. `@babel/helper-validator-identifier@7.28.5` - sub-dep do code-frame
4. `@types/aria-query@5.0.4` - tipos para aria-query
5. `aria-query@5.3.0` - versao especifica requerida (lock tem 5.3.2 mas precisa de 5.3.0 tambem)
6. `dom-accessibility-api@0.5.16` - versao especifica (lock tem 0.6.3 mas precisa de 0.5.16 tambem)
7. `lz-string@1.5.0` - compressao de strings
8. `pretty-format@27.5.1` - formatacao de saida
9. `ansi-regex@5.0.1` - sub-dep do pretty-format
10. `ansi-styles@5.2.0` - sub-dep do pretty-format
11. `react-is@17.0.2` - sub-dep do pretty-format

## Detalhes Tecnicos

Cada pacote sera inserido como entrada em `node_modules/` dentro do `package-lock.json` com os campos obrigatorios (`version`, `resolved`, `integrity`, `license`). Pacotes que ja existem em versoes diferentes (como `aria-query@5.3.2`) serao adicionados como entradas aninhadas dentro de `@testing-library/dom/node_modules/` para evitar conflitos.

## Arquivos Modificados

- `package-lock.json` - Adicionar as 11 entradas de dependencias transitivas ausentes

