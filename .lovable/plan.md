
Objetivo
- Garantir que o agendamento FSRS respeite exatamente o tempo exibido na UI e que nenhum card volte antes da hora.
- Entregar uma suíte robusta com 100+ cenários de teste (incluindo os fluxos que você descreveu: erra, erra de novo, bom/fácil, volta e erra etc.) para validar algoritmo + integração de fila.

Diagnóstico (o que encontrei)
1) Ponto crítico de integração na sessão de estudo (principal suspeita de “voltar antes do tempo”)
- Em `src/pages/Study.tsx`, após avaliar um card:
  - hoje o código remove da fila local apenas quando `rating > 2`;
  - quando `rating <= 2`, mantém o card na fila e atualiza `scheduled_date`.
- Problema: para card em revisão (`state=2`) com nota **Difícil (2)**, o FSRS pode devolver próximo agendamento para amanhã (ex.: `1d`), mas o card fica na fila local da sessão.  
- Como `getNextReadyIndex` (`src/lib/studyUtils.ts`) considera `state=2` sempre elegível na etapa de “new/review”, esse card pode reaparecer antes do horário agendado.

2) Evidência real em dados
- Consulta em `review_logs` mostrou casos de card com `state=2`, rating `2`, `scheduled_date` no dia seguinte, mas revisado novamente minutos depois (antes do `scheduled_date`).
- Isso confirma falha de integração fila/sessão, não apenas matemática do FSRS.

3) Algoritmo FSRS em si
- `src/lib/fsrs.ts` está bem coberto por testes básicos/intermediários e a matemática geral está consistente.
- O maior risco atual está na regra de reentrada na fila local (integração), não no núcleo da fórmula.

4) Observação
- Session replay retornou vazio nesta captura, então usei leitura de código + logs de banco para isolar a causa.

Plano de implementação (quando você aprovar)
1) Corrigir regra de permanência do card na fila local
- Arquivo: `src/pages/Study.tsx`
- Trocar regra baseada em `rating` por regra baseada no `result` real do agendamento:
  - Reenfileirar somente quando próximo agendamento é de curto prazo (ex.: `interval_days === 0`, típico de learning/relearning).
  - Remover da fila quando o card foi para revisão futura (ex.: `interval_days > 0`), mesmo que a nota tenha sido 2.
- Resultado esperado: card não reaparece antes da hora se UI disse 10min/15min/1d.

2) Blindagem adicional contra inconsistência de clique/concorrência na sessão
- Ainda em `Study.tsx`, adicionar trava síncrona (ref) para impedir dupla submissão do mesmo card no mesmo instante.
- Evita logs e agendamentos duplicados por cliques rápidos.

3) (Opcional, mas recomendado) Extrair lógica de atualização da fila para função pura testável
- Criar helper em `src/lib/studyUtils.ts` (ou novo util de sessão) para:
  - aplicar resultado da revisão na fila local;
  - decidir keep/remove de forma determinística.
- Benefício: permite testar integração sem depender de componente React.

Plano de testes (100+ cenários, como você pediu)
A) FSRS unitário (expandir `src/test/fsrs.test.ts` para 100+)
- Meta: adicionar matriz grande de casos parametrizados.
- Blocos:
  1. Novos cards: combinações de steps customizados (1m/10m, 1m/15m, 5m/30m), retenção, maxInterval.
  2. Learning/Relearning: sequências longas (Again→Again→Good, Again→Hard→Good, etc.).
  3. Review: overdue leve/médio/extremo + hard/good/easy ordering.
  4. Invariantes: limites de dificuldade [1,10], estabilidade >= 0.1, monotonicidade esperada.
  5. Cadeias completas de 10–20 passos por card simulando uso real.
- Total planejado aqui: ~70–90 casos.

B) Integração fila/agendamento (novo arquivo de teste, ex. `src/test/studySessionFlow.test.ts`)
- Simular a mesma lógica da sessão:
  - card novo erra -> volta em step curto;
  - erra de novo -> respeita step;
  - depois bom/fácil -> sai da sessão;
  - review com hard -> NÃO pode reaparecer antes da data.
- Adicionar regressão explícita para o bug atual.
- Total planejado aqui: ~20–40 casos.

C) Verificação de consistência UI x agendamento
- Garantir que rótulo de intervalo exibido (preview) corresponde ao resultado usado para atualizar card.
- Cobrir FSRS com configurações reais de deck (`learning_steps`, `requested_retention`, `max_interval`).

Validação final
1) Rodar testes automatizados
- `vitest` no arquivo novo + suíte completa.
- Critério: 100+ cenários passando, incluindo regressão do bug reportado.

2) Teste manual end-to-end (fundamental)
- Fluxo guiado no Study:
  - cenário que você descreveu (erra/erra/bom/fácil/erra de novo);
  - confirmar com relógio que card só reaparece após o tempo prometido;
  - confirmar que “Difícil 1d” não reaparece na mesma sessão.

Arquivos previstos para alteração
- `src/pages/Study.tsx` (correção principal da integração)
- `src/lib/studyUtils.ts` (helper puro opcional para teste)
- `src/test/fsrs.test.ts` (expansão para 100+)
- `src/test/studySessionFlow.test.ts` (novo, integração/regras de fila)

Riscos e mitigação
- Risco: corrigir fila e afetar dinâmica “furar fila” de learning/relearning.
- Mitigação: manter prioridade existente de `state 1/3` vencidos e cobrir com testes específicos.
- Risco: falso positivo por múltiplas abas.
- Mitigação: trava de submissão local + teste de não duplicidade no fluxo.

Entregável esperado após implementação
- Correção objetiva do reaparecimento precoce.
- Cobertura massiva de testes (100+), com cenários reais de uso e regressão do problema reportado.
