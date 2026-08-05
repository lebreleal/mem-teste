# Tudo liberado: fim dos planos + coroa de créditos limpa

## O que muda para o usuário

- O item **"Sugerir Melhorias"** some do menu (ele apontava para uma rota `/feedback` que nem existe mais — hoje é um clique morto).
- **Nenhum recurso fica mais atrás de "Premium"**: FSRS, múltiplos planos de estudo, modelos de IA e desconto de custo passam a valer para todos.
- O **card "Plano gratuito / Plano Premium"** sai do Perfil.
- No modal da coroa, a aba **"Comprar" com os pacotes em R$ e o botão "em breve" é removida**. Fica: saldo, aviso de créditos diários grátis e histórico de movimentações.
- O **saldo da coroa passa a exibir uma casa decimal** (ex.: `97,3`) no cabeçalho, na tela de estudo e no modal — hoje o valor vem do banco como número decimal e pode aparecer com muitas casas.

## O que NÃO muda

- O checkout Stripe para compra de créditos continua no projeto (`create-checkout`, `customer-portal` e as funções do hook de assinatura permanecem intactas para uso futuro).
- Nada muda no FSRS, no consumo real de créditos por tokens, nem na cobrança feita pelas edge functions.

## Detalhes técnicos

**Remoção do "Sugerir Melhorias"**
- `src/components/dashboard/DashboardHeader.tsx`: remove o `DropdownMenuItem` de `/feedback` e o ícone `Lightbulb`.

**Fim do gating por plano (tudo liberado)**
- `src/pages/Dashboard.tsx`: `defaultAlgorithm` passa a ser sempre `fsrs`; remove o uso de `isPremium`.
- `src/pages/StudyPlan.tsx`: remove o limite de 1 plano para não-premium; `StudyPlanHome`/`StudyPlanWizard` deixam de receber `isPremium` e perdem o bloco de upsell.
- `src/hooks/useAIModel.ts` e `src/components/AIModelSelector.tsx`: o multiplicador de custo deixa de depender de `isPremium` (usa sempre o multiplicador do modelo).
- `src/components/ai-deck/useAIDeckFlow.ts`, `ConfigStep.tsx`, `AICreateDeckDialog.tsx`: `getCost` perde o parâmetro `isPremium`; o flow deixa de expor `isPremium`.
- `src/pages/Profile.tsx`: remove o card de plano.
- `src/hooks/usePremium.ts`: excluído (só era um re-export). `useSubscription.ts` continua existindo para o checkout, mas sem consumidores de `isPremium`.

**Exibição dos créditos**
- Novo helper `formatCredits(n)` em `src/lib/utils.ts` (ou `src/lib/creditsFormat.ts`): arredonda para 1 casa e formata em pt-BR.
- Aplicado em `DashboardHeader.tsx` (coroa + item do menu), `src/pages/Study.tsx` (coroa da sessão) e `src/components/CreditsDialog.tsx` (saldo grande e valores do histórico/saldo após).

**Modal de créditos**
- `src/components/CreditsDialog.tsx`: remove o array `packages`, a aba "Comprar", o botão bloqueado e os ícones `ShoppingCart`/`Lock`. O histórico deixa de ser aba e passa a ser a lista única abaixo do saldo.

## Validação

- Conferir no preview: menu sem "Sugerir Melhorias", coroa com uma casa decimal, modal sem loja, criação de plano de estudo além do primeiro funcionando e seletor de modelo de IA sem bloqueio.
- `tsgo` limpo e a suíte Vitest (453 testes) verde.
