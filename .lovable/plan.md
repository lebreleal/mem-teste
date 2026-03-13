

# Auditoria Brutal: Contradições e Pontas Soltas

Vou ser direto. Há problemas reais que eu encobri ao dizer "80% alinhado".

---

## CONTRADIÇÃO 1: FSRS no conceito é aplicado MAS ignorado na prática

**O que dizemos**: "FSRS é aplicado ao conceito, não à questão, para evitar decoreba."

**O que o código faz**: O `StudyMode` chama `onRate(concept, 3, true)` que roda `fsrsSchedule` e atualiza `scheduled_date` do conceito. Mas **o StudyMode nunca consulta se o conceito está due**. O `ErrorNotebook` mostra conceitos com `state !== 2`, independente de `scheduled_date`. O `StudyMode` vindo do ErrorNotebook não respeita o agendamento FSRS — o aluno pode estudar um conceito que o FSRS diz para revisar daqui a 30 dias.

**Resultado real**: O FSRS está atualizando campos que ninguém lê nesse fluxo. O agendamento é decorativo no ErrorNotebook. A única tela que respeita `scheduled_date` é a aba "Meus" na página de Conceitos (`dueConcepts`).

**O que deveria acontecer**: Se o aluno dominou um conceito (state=2), ele deve sair do ErrorNotebook (isso funciona). Mas se ele errou e o FSRS agendou para daqui a 10 minutos, o ErrorNotebook deveria indicar "revisão em 10min" em vez de permitir estudo imediato infinito. Caso contrário, o espaçamento (a base inteira do FSRS) é ignorado.

---

## CONTRADIÇÃO 2: `markConceptMastered` no DiagnosticMode bypassa o FSRS

**Linha 1169-1181** (`globalConceptService.ts`): `markConceptMastered` seta `stability: 10, difficulty: 0.3, scheduled_date: +30 dias` manualmente. Isso **sobrescreve** completamente o estado FSRS com valores hardcoded.

**Problema**: Se o aluno acertou 2 questões no diagnóstico, marcamos stability=10 e dificuldade=0.3 — valores arbitrários que não vieram do algoritmo FSRS. O FSRS foi projetado para calcular esses valores a partir do histórico real. Ao forçar valores, estamos **corrompendo o modelo**.

**O que deveria acontecer**: O diagnóstico deveria chamar `fsrsSchedule` com rating=3 duas vezes (simulando os 2 acertos) para que o modelo calcule stability e difficulty corretamente. Ou, no mínimo, usar os valores iniciais de `w[3]` (stability para rating "Easy" em card novo = 8.29 pelo FSRS-6).

---

## CONTRADIÇÃO 3: `cascadeOnError` reschedula ancestrais mas não os coloca na sessão

**Linha 405-442**: Quando o aluno erra, `cascadeOnError` percorre ancestrais e seta `scheduled_date = now()` para os fracos. Mas esses ancestrais **não entram na sessão atual de estudo**. O aluno nunca vê que seus pré-requisitos foram reagendados.

**Na prática**: O cascade seta `scheduled_date = now()` e o ancestral só aparece da **próxima vez** que o aluno abrir a página de Conceitos e filtrar por "due". No ErrorNotebook, o conceito ancestral só aparece se tiver `state !== 2` E tiver questões erradas vinculadas — muitos ancestrais não terão questões erradas próprias.

**Resultado**: O cascade é essencialmente invisível para o aluno. Um conceito pré-requisito pode ser reagendado 50 vezes sem nunca ser estudado.

---

## CONTRADIÇÃO 4: `getVariedQuestion` não varia de verdade com pool pequeno

**Linha 255-316**: A função ordena questões por "menos respondida recentemente". Mas a maioria dos conceitos tem **1-4 questões vinculadas** (geradas pelo `generateQuestionsForConcept` que cria exatamente 4 cards → ~4 questões).

**Com MASTERY_THRESHOLD = 2**: O aluno precisa acertar 2 vezes consecutivas. Com 4 questões no pool, ele vai ver as mesmas questões rapidamente. Após 3-4 sessões, já memorizou as respostas — exatamente o "decoreba de questão" que dizemos combater.

**Solução real**: Ou geramos mais questões por conceito (8-10), ou geramos questões novas on-the-fly a cada sessão (mais caro mas mais eficaz), ou aceitamos que com pool pequeno, o sistema degrada para memorização.

---

## CONTRADIÇÃO 5: Confidence check tem UX enganosa

**StudyMode linhas 82-97**: Se o aluno clica "Chutei", não incrementamos `consecutiveCorrect` e carregamos outra questão. Mas o conceito NÃO recebe rating negativo — simplesmente ignoramos o acerto. Se o aluno tem 4 questões e clica "Chutei" em todas, ele entra em loop infinito vendo as mesmas 4 questões.

**Não há escape**: O código não tem limite de tentativas. Se o aluno é honesto e sempre diz "Chutei", ele nunca domina o conceito. Se é desonesto, o check não serve para nada. A feature incentiva mentir.

---

## PROBLEMA 6: `updateConceptMastery` tem race condition

**Linha 338-363**: A função faz SELECT → calcula → UPDATE. Em requests paralelos (aluno clicando rápido), dois SELECTs podem ler o mesmo valor e ambos incrementam +1, perdendo uma contagem. Deveria usar `correct_count + 1` no SQL diretamente (increment atômico via RPC ou raw SQL).

---

## PROBLEMA 7: O ErrorNotebook não mostra conceitos fracos SEM questões erradas

**`getWeakConceptsWithErrors` (conceptHierarchyService.ts)**: Filtra conceitos que têm `state !== 2` E questões erradas (`is_correct = false`). Mas conceitos novos (state=0) que nunca foram tentados **não aparecem no ErrorNotebook**, mesmo que sejam pré-requisitos reagendados pelo cascade.

**Resultado**: O cascade reagenda um pré-requisito, mas se esse pré-requisito nunca teve uma questão errada, ele não aparece em lugar nenhum visível.

---

## PROBLEMA 8: `parent_concept_id` é árvore, não grafo

**Linha 187**: "Use the first prerequisite as parent (tree model, not DAG)". Um conceito só pode ter UM pré-requisito. Na medicina, "Mecanismo da Espironolactona" depende de "Efeitos da Aldosterona" E "Cascata Renina-Angiotensina". O modelo atual perde um dos dois.

O ALEKS real usa Knowledge Space Theory com grafos (não árvores). O modelo de árvore é uma simplificação que perde relações importantes.

---

## Resumo: O que corrigir (por prioridade)

| # | Problema | Impacto | Correção |
|---|---|---|---|
| 1 | FSRS decorativo no ErrorNotebook | Alto | Respeitar `scheduled_date` ou remover FSRS desse fluxo |
| 2 | `markConceptMastered` bypassa FSRS | Alto | Usar `fsrsSchedule` no diagnóstico |
| 3 | Pool de questões muito pequeno (4) | Alto | Gerar 8-10, ou gerar on-the-fly na 2ª tentativa |
| 4 | Confidence check sem escape (loop infinito) | Médio | Limitar a 1 "Chutei" por conceito, ou dar rating=2 (Hard) |
| 5 | Cascade invisível | Médio | Injetar ancestrais na sessão atual, ou notificar |
| 6 | Race condition no mastery count | Baixo | Increment atômico via RPC |
| 7 | Conceitos novos sem erro não aparecem | Médio | ErrorNotebook → "Conceitos Fracos" (não só erros) |
| 8 | Árvore vs Grafo | Baixo (longo prazo) | Tabela de junção `concept_prerequisites` |

### Arquivos afetados
- `src/components/concepts/StudyMode.tsx` — confidence check limit, FSRS respect
- `src/components/concepts/DiagnosticMode.tsx` — usar fsrsSchedule em vez de markConceptMastered
- `src/services/globalConceptService.ts` — markConceptMastered via FSRS, pool size, increment atômico
- `src/services/conceptHierarchyService.ts` — incluir conceitos novos sem erros
- `src/pages/ErrorNotebook.tsx` — mostrar scheduled_date, renomear para "Conceitos Fracos"

