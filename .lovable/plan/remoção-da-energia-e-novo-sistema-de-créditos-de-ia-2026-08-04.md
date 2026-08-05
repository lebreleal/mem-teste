# Remoção da Energia e novo sistema de Créditos de IA

## Objetivo

1. Remover o sistema de "Energia" (ícone de cérebro + contador) da interface e da lógica de estudo.
2. Substituir por uma moeda única de IA — os **Créditos** (ícone de coroa) — com cobrança proporcional ao consumo real.

## Diagnóstico do estado atual

- Existe hoje um único saldo (`profiles.energy`) usado como energia e como crédito de IA ao mesmo tempo, exibido no header com ícone de cérebro ("Energia (N)").
- A cobrança acontece nas Edge Functions via RPC `deduct_energy`, mas o valor `energyCost` é **enviado pelo cliente** no corpo da requisição (`generate-deck`, `ai-chat`, `ai-tutor`, `enhance-card`, `enhance-import`). Isso permite que qualquer usuário envie custo 0.
- O custo real em USD já é calculado e gravado por chamada em `ai_token_usage.cost_usd` usando a tabela de preços do OpenRouter — ou seja, já existe base para cobrança por uso real.
- O estudo (revisão de cards) já não gera nem gasta energia: `addSuccessfulCard` mantém `energy` inalterada. O sistema é hoje um resíduo visual.

## Modelo financeiro recomendado

### Comparação dos modelos

| Modelo | Como funciona | Problema para o MemoCards |
|---|---|---|
| Custo fixo por ação (atual) | 1 deck = X créditos | Um PDF de 3 páginas custa o mesmo que um de 80. Ou você perde dinheiro, ou cobra caro demais do usuário leve. |
| Assinatura ilimitada (Claude) | mensalidade + limites ocultos | Exige plano premium, que foi descartado. |
| Por uso real (Lovable) | consome conforme o gasto | Justo, mas assustador se o usuário não souber quanto vai gastar antes de clicar. |

### Recomendação: híbrido — **estimativa antes, cobrança real depois**

É o modelo que combina previsibilidade (o usuário vê quanto vai custar antes de confirmar) com sustentabilidade (você nunca perde dinheiro em um job grande).

**Unidade:** 1 Crédito = US$ 0,001 de custo real de IA (definido em `ai_settings`, ajustável sem deploy).

**Markup:** 4x sobre o custo do OpenRouter — cobre gateway, Supabase, falhas/retries e margem. Ou seja: uma chamada que custa US$ 0,0025 no OpenRouter debita 10 créditos.

**Fluxo por chamada:**
1. Antes de executar, a função estima o custo (tokens de entrada + teto de saída) e faz um **hold** do valor estimado.
2. Executa a chamada.
3. Ao final, ajusta pelo custo real: devolve a diferença se sobrou, debita o extra se passou (limitado ao teto exibido ao usuário).

**Preços de referência resultantes** (com modelo padrão barato, ~US$0,15/M in e US$0,60/M out):

| Ação | Custo real médio | Créditos cobrados | Equivalente em R$ |
|---|---|---|---|
| Pergunta ao Tutor / chat | ~US$0,0008 | ~3 | ~R$ 0,05 |
| Melhorar 1 card | ~US$0,0005 | ~2 | ~R$ 0,03 |
| Deck de PDF 10 páginas (~40 cards) | ~US$0,012 | ~48 | ~R$ 0,80 |
| Deck de PDF 80 páginas (~250 cards) | ~US$0,09 | ~360 | ~R$ 6,00 |

**Pacotes de venda** (com margem ~4x já embutida):

| Pacote | Créditos | Preço | R$/crédito | Bônus |
|---|---|---|---|---|
| Início | 500 | R$ 9,90 | 0,0198 | — |
| Popular | 1.500 | R$ 24,90 | 0,0166 | +16% |
| Pro | 4.000 | R$ 59,90 | 0,0150 | +32% |
| Mega | 10.000 | R$ 129,90 | 0,0130 | +52% |

**Créditos gratuitos:** 300 créditos ao criar a conta + 50 créditos/dia renováveis (não acumulam) + missões. Isso mantém a promessa de plataforma 100% gratuita: estudar, criar cards manualmente, comunidades e FSRS nunca consomem crédito. Só IA consome.

**Modelos premium:** modelos mais caros (ex.: raciocínio) usam a mesma fórmula — custam automaticamente mais créditos, sem precisar de tabela paralela.

## Etapas de implementação

**Etapa 1 — Remover a energia da interface**
- Remover o item "Energia (N)" com ícone de cérebro do `DashboardHeader`.
- Remover `useEnergy` de `FlashCard`, `FlashCardMultipleChoice`, `StudyCardActions`, `Study` e demais telas de estudo; apagar `hooks/useEnergy.ts`, `services/energyService.ts` e `types/energy.ts` quando não houver mais referências.
- Deixar o saldo de IA acessível apenas pela coroa, abrindo o diálogo de créditos.

**Etapa 2 — Motor de créditos no servidor**
- Nova tabela `ai_credit_ledger` (entradas: compra, bônus diário, missão, consumo, estorno) e coluna `profiles.ai_credits` como saldo materializado.
- Novas RPCs `hold_ai_credits` / `settle_ai_credits` (débito atômico com ajuste pelo custo real) e `grant_daily_ai_credits`.
- Chaves em `ai_settings`: `credit_usd_rate`, `credit_markup`, `daily_free_credits`, `signup_bonus_credits`.

**Etapa 3 — Cobrança segura nas Edge Functions**
- Parar de confiar no `energyCost` vindo do cliente nas 5 funções de IA; calcular no servidor a partir dos tokens estimados e do preço real do OpenRouter (`computeCostUSD`, já existente).
- Fazer hold antes e settle depois, gravando o delta em `ai_token_usage`.

**Etapa 4 — Interface de créditos**
- Refazer `CreditsDialog` / `BuyCreditsDialog` com os pacotes acima, saldo, bônus diário e histórico de consumo por funcionalidade.
- Exibir estimativa "≈ N créditos" antes de gerar deck, chamar tutor ou melhorar card, com bloqueio claro quando o saldo for insuficiente.

**Etapa 5 — Admin**
- No painel de custos, mostrar lado a lado custo real (USD) x créditos cobrados x margem efetiva por usuário e por funcionalidade.

## Detalhes técnicos

- A conversão crédito↔USD fica só no banco (`ai_settings`), nunca hardcoded no front, para permitir reprecificar sem deploy.
- O ledger é append-only com RLS: usuário lê apenas as próprias linhas; escrita somente por `service_role` via RPC `security definer`.
- `profiles.energy` é mantida durante a migração e convertida 1:1 para `ai_credits` na primeira execução, evitando perda de saldo dos usuários atuais.
- A cobrança de créditos por compra real de pacotes depende de um provedor de pagamento; até isso ser habilitado, os pacotes ficam visíveis com concessão manual pelo admin.
