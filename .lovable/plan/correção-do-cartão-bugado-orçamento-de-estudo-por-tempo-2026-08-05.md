# Correção do cartão bugado + orçamento de estudo por tempo

## Parte 1 — O cartão bugado (auditoria do baralho "teste flash")

Dos 117 cartões, 116 estão corretos (93 básicos + 23 cloze bem formados). **Exatamente 1 está corrompido** — o da tatuagem de hena:

```text
tipo salvo:  basic          <- ERRADO, deveria ser cloze
frente:      Na tatuagem de hena, o pigmento atinge a {{c1::epiderme}} e é eliminado rapidamente.
verso:       {"clozeTarget":1,"extra":"Na tatuagem de hena, o pigmento atinge a epiderme e é eliminado rapidamente."}
```

Dois defeitos no mesmo registro: tipo gravado como `basic` apesar da lacuna, e o campo "extra" guardando a mesma frase sem a lacuna — por isso a tela mostra o texto duas vezes.

**Causa raiz (confirmada no código):** ao editar um cartão básico e adicionar `{{c1::...}}`, o salvamento grava frente e verso, mas a função `updateCard` só aceita frente e verso — nunca atualiza a coluna `card_type`. O conteúdo vira cloze, o tipo continua `basic`. Brecha secundária: o sanitizador da geração por IA trata "declarou cloze sem lacuna", mas não o inverso (IA devolver `type:"basic"` com `{{c1::}}` no texto).

**Correções:**
1. `updateCard` passa a aceitar `cardType`; editor de cartões e editor da sessão de estudo enviam o tipo detectado em todo salvamento.
2. Ao converter básico em cloze, se o verso for igual à frente sem marcações, o extra é gravado vazio.
3. Sanitizador da IA nos dois sentidos: qualquer cartão com `{{cN::}}` vira `cloze` com verso vazio, independente do tipo declarado.
4. Migração pontual corrigindo os registros já existentes nesse estado (hoje: 1).

A estratégia de carga diária fica de fora desta entrega, sem alterações.



## Detalhes técnicos

- `src/services/card/cardMutations.ts`: `updateCard(id, frontContent, backContent, cardType?)` gravando `card_type` quando informado; `src/hooks/useCards.ts` repassa o parâmetro.
- `src/pages/ManageDeck.tsx` (`saveCurrentCard`) e `src/components/StudyCardActions.tsx`: enviar o tipo de `buildSavePayload()`/`detectCardType()` nas atualizações do cartão e dos irmãos; extra vazio quando o verso normalizado igualar a frente sem marcações.
- `supabase/functions/generate-deck/index.ts` (~linha 508): forçar `type = "cloze"` e `back = ""` quando `CLOZE_REGEX.test(front)`.
- Migração: `UPDATE public.cards SET card_type = 'cloze' WHERE card_type = 'basic' AND front_content ~ '\{\{c[0-9]+::'` + normalização do `extra` duplicado.

