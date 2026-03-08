

## Diagnóstico: ActivityView (Golfinho) com dados zerados

### Investigação

Verifiquei o banco de dados: hoje tem **106 reviews com state e elapsed_ms corretos**. A query da ActivityView (`.select('reviewed_at, elapsed_ms, state')`) e a lógica de contagem por state estão corretas no código.

### Causas identificadas

**Bug 1 — Query sem filtro de data (preventivo)**
A query busca até 50.000 registros sem filtro de data. Embora hoje o volume seja baixo (4.454 total), com o crescimento do app isso vai causar perda de dados recentes. É a mesma correção proposta anteriormente.

**Bug 2 — Cache stale ao navegar**
O `staleTime: 60_000` (60 segundos) pode fazer com que, ao abrir a tela de atividade logo após estudar, os dados ainda sejam da consulta anterior (quando não havia reviews hoje). Se o usuário abriu a ActivityView nos últimos 60 segundos e depois estudou, ao voltar veria dados antigos.

**Bug 3 — 672 logs antigos sem `state` (15% do total)**
Dias antigos que não tinham a coluna `state` preenchida caem no fallback como "review" — zerando novos, aprendendo e reaprendendo para esses dias. Isso não afeta hoje mas afeta o histórico.

### Correções

1. **`src/pages/ActivityView.tsx`** — Adicionar filtro `.gte('reviewed_at', oneYearAgo.toISOString())` na query (3 linhas)
2. **`src/pages/ActivityView.tsx`** — Reduzir `staleTime` para `5_000` (5 segundos) para garantir dados frescos ao navegar
3. **`src/pages/ActivityView.tsx`** — Tratar logs com `state === null` separadamente: contar como "Novos" se for a primeira review daquele card, ou manter fallback como "review" para não perder contagem total. Na prática, a melhor solução simples: quando `state` é null, **não contar em nenhuma categoria específica** mas somar no total.

### Arquivos alterados
- `src/pages/ActivityView.tsx` (3 mudanças pontuais)

