

# Implementacao do Guia UI/UX do MemoPlanner

## Gaps Identificados (PDF vs. Implementacao Atual)

O PDF define requisitos especificos de UI/UX que ainda nao foram implementados. Abaixo, cada item do documento e o que precisa ser feito:

### 1. "Termometro de Tempo" (Secao 2 do PDF)
**Status:** NAO IMPLEMENTADO
**O que falta:** Um grafico visual tipo "velocimetro" ou barra com 4 cores (Verde, Amarelo, Laranja, Vermelho) mostrando a carga de estudo diaria estimada em MINUTOS, nao apenas cards. O indicador atual e apenas um ponto colorido com 3 cores.
**Acao:** Criar componente `StudyLoadGauge` com barra segmentada em 4 niveis de cor. A metrica central passa a ser "minutos estimados hoje" (novos + revisoes), nao cards.

### 2. Tres Pilares Sempre Visiveis (Secao 3 do PDF)
**Status:** PARCIALMENTE IMPLEMENTADO
**O que falta:**
- **Data de Conclusao:** Ja existe, mas sem o texto didatico "Quando eu terminarei de ver tudo?"
- **Taxa de Retencao Desejada:** NAO EXISTE. O PDF exige exibir o % de retencao alvo (padrao FSRS: 90%).
- **Capacidade Diaria:** Existe, mas sem interconexao dinamica clara
**Acao:** Adicionar card de 3 pilares no dashboard com os tres valores interconectados. A taxa de retencao vem do campo `requested_retention` dos decks selecionados (media ponderada).

### 3. Controles Editaveis na Segunda Visita (Secao 4 do PDF)
**Status:** PARCIALMENTE IMPLEMENTADO
**O que falta:**
- **Slider de Tempo com feedback de impacto:** Existe slider, mas sem feedback tipo "Reduzir para 20 min/dia adiara sua data de conclusao em 4 dias"
- **Priorizacao de Baralhos (drag & drop):** NAO EXISTE. O PDF pede arrastar e soltar ou botoes de seta para reordenar prioridade
- **Edicao da Data da Meta inline:** Existe no wizard, mas nao no dashboard
- **Botao "Limpar Atraso" (Catch-up):** NAO EXISTE. Deve oferecer opcoes para redistribuir backlog
**Acao:**
- Adicionar feedback de impacto no slider
- Implementar reordenacao de baralhos com botoes de seta (up/down) no dashboard
- Adicionar edicao inline de data e tempo no dashboard (sem voltar ao wizard completo)
- Criar botao "Limpar Atraso" com dialog de opcoes de diluicao

### 4. Progressive Disclosure - 3 Niveis (Secao 5 do PDF)
**Status:** NAO IMPLEMENTADO
**O que falta:**
- **Nivel 1:** Tela principal mostra apenas Termometro de Tempo + status geral ("Voce esta no caminho certo")
- **Nivel 2:** Ao clicar, mostra quebra: "20 min de Revisoes + 25 min de Novos Cards"
- **Nivel 3:** Configuracoes avancadas (FSRS) escondidas
**Acao:** Reestruturar dashboard para ter card principal clicavel/expansivel. Nivel 1 = resumo. Nivel 2 = detalhes ao expandir. Nivel 3 = link para configuracoes avancadas (ja existe em DeckSettings).

### 5. Indicador "Saude do Plano" como Percentual (Secao 7 do PDF)
**Status:** PARCIALMENTE IMPLEMENTADO
**O que falta:** O PDF pede um indicador de CONSISTENCIA em percentual (100% = usuario segue o plano, diminui se pula dias). Atualmente so tem verde/amarelo/vermelho baseado em cobertura.
**Acao:** Calcular "Saude do Plano" como % baseado em dias estudados vs dias do plano (usando review_logs). Exibir como barra de progresso com mensagem proativa quando abaixo de 80%.

### 6. 4 Cores em vez de 3 (Secao 2 do PDF)
**Status:** INCORRETO
**O que falta:** PDF define 4 niveis: Verde (leve, ate ~40 cards novos/dia), Amarelo (moderado), Laranja (intenso), Vermelho (sobrecarga). Implementacao atual usa apenas 3.
**Acao:** Atualizar logica de healthStatus para 4 niveis e adicionar "orange" ao sistema de cores.

---

## Secao Tecnica

### Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/StudyPlan.tsx` | Reescrever dashboard com Termometro, 3 pilares, progressive disclosure, botao Limpar Atraso, reordenacao de baralhos, edicao inline, feedback de impacto no slider |
| `src/hooks/useStudyPlan.ts` | Adicionar calculo de saude do plano (%), logica de 4 cores, calculo de impacto ao mudar tempo, calculo de minutos estimados (nao so cards) |

### Detalhes de Implementacao

**1. Componente StudyLoadGauge (dentro de StudyPlan.tsx)**
- Barra horizontal segmentada em 4 faixas de cor
- Ponteiro/indicador na posicao correspondente aos minutos estimados hoje
- Verde: 0-30min / Amarelo: 30-60min / Laranja: 60-120min / Vermelho: 120min+
- Limites ajustaveis baseados no `daily_minutes` do usuario (verde = ate 70% do tempo disponivel, etc.)

**2. Card dos 3 Pilares**
- Linha 1: Data de Conclusao (com icone calendario) + dias restantes
- Linha 2: Taxa de Retencao (icone brain) - media dos `requested_retention` dos decks no plano (padrao 90%)
- Linha 3: Capacidade Diaria (icone relogio) - tempo configurado pelo usuario
- Cada valor clicavel para editar inline

**3. Progressive Disclosure**
- Card principal: mostra apenas Termometro + frase de status ("Voce esta no caminho certo para sua prova de Fisiologia")
- Ao clicar/expandir: mostra quebra detalhada (minutos de revisao + minutos de novos cards + cards atrasados)
- Usa Collapsible do radix-ui (ja instalado)

**4. Priorizacao de Baralhos**
- Lista dos baralhos no plano com botoes de seta (cima/baixo) para reordenar
- A ordem e salva no array `deck_ids` da tabela `study_plans` (a posicao no array = prioridade)
- Sem necessidade de nova coluna no banco

**5. Botao "Limpar Atraso"**
- Aparece apenas quando `metrics.totalReview > 0` (ha backlog)
- Ao clicar: Dialog com opcoes: "Diluir em 3 dias", "Diluir em 5 dias", "Diluir em 7 dias"
- Mostra calculo: "Serao +X cards extras por dia durante N dias"
- Nesta versao: exibe a sugestao como informacao visual (o sistema de estudo ja prioriza revisoes vencidas naturalmente)

**6. Saude do Plano (%)**
- Calculo: dias em que o usuario estudou (tem review_logs) / dias totais desde criacao do plano * 100
- Buscar via query simples: contar dias distintos com review_logs desde `plan.created_at`
- Exibir como barra de progresso circular ou linear
- Se < 80%: mensagem proativa "Sua Saude do Plano esta em X%. Que tal ajustarmos sua carga?"

**7. Feedback de Impacto no Slider**
- Ao mover o slider no dashboard (edicao inline):
  - Se tem target_date: "Reduzir para Xmin/dia adiara sua conclusao em Y dias"
  - Se nao tem: "Com Xmin/dia voce revisara ~Z cards por dia"
- Calculo: `novoDiasNecessarios = totalCards / novosCardsPerDay` vs `diasRestantes`

**8. Sistema de 4 Cores**
- Atualizar `healthStatus` no hook:
  - Verde: cobertura >= 100% OU cards novos/dia <= 40
  - Amarelo: cobertura >= 70% OU carga moderada
  - Laranja: cobertura >= 50% OU carga intensa
  - Vermelho: cobertura < 50% OU sobrecarga

