

## Analise Completa: Economia de Creditos IA

### Estado Atual — Quanto um usuario GANHA por mes

| Fonte | Creditos/dia | Creditos/mes |
|-------|-------------|-------------|
| Missoes diarias (5+20+50 cards + 10+30 min) | 29 | **870** |
| Missoes semanais (100+300 cards) | ~6.4 | **194** |
| Milestones estudo (50 cards=+5, 100 cards=+10) | 15 | **450** |
| **Total maximo free** | **~50** | **~1.514** |
| Conquistas (one-time) | — | **275** (unica vez) |

Um usuario ativo que faz todas as missoes ganha **~1.500 creditos/mes** so de missoes + milestones.

### Estado Atual — Quanto cada credito CUSTA pra voce

| Feature | Modelo | Custo medio API (USD) | Creditos cobrados | Custo real por credito |
|---------|--------|----------------------|-------------------|----------------------|
| generate_deck | Flash | ~$0.003/batch | 16 creditos (8 pags) | ~$0.0002/credito |
| generate_deck | **Pro** | ~$0.05/batch | **80 creditos** (8 pags) | ~$0.0006/credito |
| ai_tutor | Flash | ~$0.001 | 2 | ~$0.0005/credito |
| ai_tutor | **Pro** | ~$0.01 | 10 | ~$0.001/credito |

**Custo real de 1.500 creditos gratuitos:**
- Se usados no Flash: ~$0.30 (R$1.50)
- Se usados no Pro: ~$0.90-1.50 (R$4.50-7.50) — **quase o preco da assinatura**

### O Problema

O Pro ja e bloqueado para free users (bom). Mas o volume de creditos gratis e alto demais — um free user pode gerar ~93 decks/mes no Flash (1.500 ÷ 16) ou fazer 750 consultas ao tutor. Isso e praticamente ilimitado e nao incentiva conversao.

### Benchmark: Quizlet, Brainscape, Anki

| Plataforma | Free | Pago |
|-----------|------|------|
| Quizlet | 0 IA (removeu em 2024) | Ilimitado com Plus ($36/ano) |
| Brainscape | 0 IA | Pro only ($10/mes) |
| Duolingo | 0 IA | Super ($7/mes) |
| ChatGPT | Limitado (modelo fraco) | Plus ($20/mes) |

**Padrao do mercado:** IA gratuita = 0 ou muito pouco. O free tier serve pra **demonstrar o valor**, nao pra substituir o pago.

**Proporcao tipica:** 2-5% dos usuarios convertem. Para ser sustentavel, o custo do free tier precisa ser proximo de zero.

### Recomendacao: Nova Economia

#### Principios
1. Free = degustacao (suficiente pra experimentar, nao pra viver)
2. Premium = abundancia (sem ansiedade de creditos)
3. Pro model = exclusivo premium
4. Missoes = engajamento, nao fonte primaria de creditos

#### Novos valores de missoes

| Missao | Atual | Proposto | Justificativa |
|--------|-------|----------|---------------|
| daily_study_5 | 3 | **1** | Minimo pra dar sensacao de progresso |
| daily_study_20 | 5 | **2** | |
| daily_study_50 | 10 | **3** | Hard goal, recompensa modesta |
| daily_minutes_10 | 3 | **1** | |
| daily_minutes_30 | 8 | **2** | |
| weekly_100 | 15 | **5** | |
| weekly_300 | 30 | **8** | |
| **Total mensal max** | **~1.064** | **~270** | Reducao de 75% |

Conquistas (one-time): manter similares — sao one-time e dao sensacao de "presente".

#### Remover milestones do energyService

Os bonus de +5 (50 cards) e +10 (100 cards) sao redundantes com as missoes. Remover.

**Novo total mensal free: ~270 creditos** = ~17 gerações de deck Flash ou ~135 consultas tutor. Suficiente pra experimentar, insuficiente pra uso intenso.

#### Bonus mensal premium: 1.500 → manter mas IMPLEMENTAR

O PremiumModal promete "1.500 creditos por mes" mas **nao existe codigo que concede isso**. Opcoes:
1. Implementar o grant mensal de 1.500 no `check-subscription` (quando renova periodo)
2. Ou reduzir pra 500 e implementar

**Recomendacao:** 500 creditos mensais para premium + 50% desconto Flash. Isso da ao premium ~62 geracoes de deck ou 250 consultas tutor — muito mais que o free, sem ser ilimitado.

#### Resumo da nova economia

```text
                    FREE          PREMIUM (R$25.90/mes)
Creditos missoes    ~270/mes      ~270/mes
Bonus mensal        0             +500/mes
Desconto Flash      —             50%
Modelo Pro          Bloqueado     Liberado (5x custo)
Total efetivo       ~270/mes      ~770/mes (+ desconto = ~1.040 equivalente)
Custo API p/ voce   ~$0.05/mes    ~$0.15-0.30/mes
```

Margem premium: R$25.90 receita - R$1.50 custo max = **R$24.40 margem** (~94%).

### Arquivos a editar

1. **Missoes** — `UPDATE mission_definitions` para novos reward_credits (via insert tool)
2. **energyService.ts** — remover MILESTONE_50_BONUS e MILESTONE_100_BONUS
3. **check-subscription/index.ts** — adicionar grant mensal de 500 creditos quando periodo renova
4. **PremiumModal.tsx** — atualizar copy de "1.500" para "500"

