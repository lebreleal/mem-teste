## Plano: Corrigir simulador de estudos — CONCLUÍDO ✅

Todas as correções foram implementadas:

1. **Worker: capacidade limita novos cards** — Reviews/learning/relearning são processados ANTES de introduzir novos cards. O tempo restante limita quantos novos cards entram (`effectiveNewLimit`). Mudar o tempo de estudo agora afeta o gráfico.

2. **Wizard: feasibility consistente** — Margem reduzida de 1.3x para 1.1x no check `isTight`. Margem de 1.3x mantida apenas na sugestão de data. Dashboard e wizard agora usam a mesma lógica de `effectiveRate`.

3. **Textos reformulados** — Todos os textos agora explicam que a meta é "dominar/iniciar o estudo de todos os cards novos ANTES da data limite".

4. **Sugestão de data correta** — Usa `effectiveRate = min(budget, cardsFitByTime)` em vez de cap fixo de 50.
