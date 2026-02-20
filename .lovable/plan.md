
# MemoPlanner -- Planejamento de Estudos Inteligente

## Resumo

Criar a secao "Meu Plano" no Dashboard (ao lado de "Provas") com um sistema completo de planejamento de estudos baseado em metas, tempo disponivel e recalculo dinamico. O sistema funciona como um "Contrato de Estudo" entre o usuario e o algoritmo, com alertas inteligentes e modo resgate.

---

## Fluxo do Usuario

### Onboarding Hibrido (3 Etapas)

**Etapa 1 -- Definicao da Meta (O "Onde")**
- Selecionar baralhos que precisa estudar (checkbox com nome + contagem de cards)
- Se nao tem nenhum baralho: mensagem amigavel + botao "Criar baralho" (nao pode avancar)
- Selecionar data final de dominio (opcional, para quem tem prova)

**Etapa 2 -- Analise da Realidade (O "Como")**
- O sistema calcula automaticamente a carga necessaria com base nos cards e na data
- Exibe: "Para atingir sua meta, voce precisara estudar em media X novos cards por dia, o que demandara aproximadamente Y minutos diariamente"
- Se nao tem data final, mostra estimativas baseadas apenas no volume de cards

**Etapa 3 -- O Ajuste e o Pacto (O "Acordo")**
- Slider visual de tempo disponivel por dia (15min a 4h)
- Ao ajustar, recalcula em tempo real:
  - Se reduzir o tempo: "Com 30 min/dia, voce completara ~60% do conteudo ate a data. Deseja focar nos baralhos mais essenciais ou estender o prazo?"
  - Se aumentar: mostra que a meta fica confortavel
- Botao "Confirmar meu plano"

### Dashboard do Plano (apos onboarding)

Exibe metricas calculadas:
- Cards novos/dia e revisoes/dia estimados
- Cards novos/semana e revisoes/semana
- Se tem data final: progresso vs meta com indicador visual
- Indicador de Saude: Verde (No Trilho), Amarelo (Atencao), Vermelho (Meta em Risco)
- Botao "Editar plano"

---

## Logica de Recalculo Dinamico

### Cenarios de Decisao

| Cenario | Acao do Sistema |
|---------|----------------|
| Dia Normal | Segue o plano, apresenta meta diaria de novos cards + revisoes |
| Dia Perdido (1-2 dias) | Pausa novos cards, oferece diluir revisoes atrasadas em 3-5 dias |
| Atraso Critico (>3 dias) | Pausa obrigatoria de novos cards, Modo Resgate para diluir backlog |
| Novo Baralho Adicionado | Pergunta se deseja incluir no plano + informa aumento de tempo |

### Prioridades
1. Revisoes vencidas (backlog) -- ordenadas por retrievability (R) do FSRS
2. Cards em aprendizado com timer expirado
3. Novos cards (suspensos automaticamente se backlog > limite)

---

## Calculo do Tempo Medio por Card

- **Dados do usuario**: Agrupar `review_logs` consecutivos (gap < 5min = mesma sessao). Tempo da sessao / cards revisados
- **Fallback global**: Media dos top 10 usuarios mais ativos na semana (query via RPC)
- **Valor padrao**: 30 segundos por card se nenhum dado disponivel

---

## Secao Tecnica

### 1. Banco de Dados -- Tabela `study_plans`

```sql
CREATE TABLE study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  daily_minutes integer NOT NULL DEFAULT 60,
  deck_ids uuid[] NOT NULL DEFAULT '{}',
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan" ON study_plans
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plan" ON study_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plan" ON study_plans
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plan" ON study_plans
  FOR DELETE USING (auth.uid() = user_id);
```

### 2. Funcao RPC -- `get_avg_seconds_per_card`

Funcao no banco que calcula o tempo medio por card:
- Para o usuario: agrupa review_logs em sessoes (gap < 5min), calcula tempo/card
- Fallback global: media dos top 10 usuarios mais ativos na semana
- Retorna valor em segundos (padrao 30 se sem dados)

```sql
CREATE OR REPLACE FUNCTION get_avg_seconds_per_card(p_user_id uuid)
RETURNS numeric ...
```

### 3. Funcao RPC -- `get_plan_metrics`

Funcao que retorna metricas do plano:
- Total de cards novos (state=0) nos baralhos selecionados
- Total de cards em revisao pendente
- Dias restantes ate target_date (se informada)
- Cards/dia necessarios para nao acumular

### 4. Nova Rota e Pagina

- Rota: `/plano` (substituindo `/planejamento` que atualmente aponta para Performance)
- Pagina: `src/pages/StudyPlan.tsx`

### 5. Quick Nav no Dashboard

- Adicionar "Meu Plano" como 4o item no grid
- Mudar `grid-cols-3` para `grid-cols-4`
- Icone: `CalendarCheck` do lucide-react
- Badge: indicador de saude (ponto colorido verde/amarelo/vermelho)

### 6. Arquivos Criados/Modificados

| Arquivo | Acao |
|---------|------|
| `src/pages/StudyPlan.tsx` | Criar -- Wizard + Dashboard do plano |
| `src/hooks/useStudyPlan.ts` | Criar -- Hook de dados, calculos e metricas |
| `src/pages/Dashboard.tsx` | Editar -- Adicionar "Meu Plano" no quick nav (grid-cols-4) |
| `src/App.tsx` | Editar -- Adicionar rota `/plano`, atualizar `/planejamento` |
| Migration SQL | Criar tabela `study_plans` + funcoes RPC |

### 7. Hook `useStudyPlan.ts`

Responsabilidades:
- Query para buscar plano do usuario em `study_plans`
- Mutations para criar/atualizar/deletar plano
- Chamar RPC `get_avg_seconds_per_card` para estimar tempo medio
- Calcular metricas derivadas:
  - `cardsPerDay = (daily_minutes * 60) / avgSecondsPerCard`
  - `cardsPerWeek = cardsPerDay * 7`
  - Se tem `target_date`: `requiredCardsPerDay = totalPendingCards / daysRemaining`
  - `healthStatus`: verde se `cardsPerDay >= requiredCardsPerDay`, amarelo se >= 70%, vermelho se < 70%
- Detectar backlog (cards atrasados) e calcular sugestao de diluicao

### 8. UX das Etapas

**Etapa 1 -- Meta e Baralhos**
- Titulo: "O que voce precisa estudar?"
- Lista de baralhos com checkbox, nome e total de cards
- Se vazio: card com "Voce ainda nao tem baralhos" + botao "Criar baralho"
- Campo de data (react-day-picker) com label: "Tem uma data limite? (ex: prova)"
- Botao "Pular data" e "Continuar"

**Etapa 2 -- Analise**
- Titulo: "Aqui esta o que calculamos"
- Card com metricas: "Com base nos seus X baralhos (Y cards), voce precisara estudar Z cards/dia"
- Se tem data: "Para dominar ate DD/MM, serao necessarios W minutos/dia"
- Animacao de calculo ao carregar

**Etapa 3 -- Ajuste**
- Titulo: "Quanto tempo voce tem por dia?"
- Slider grande e visual (15min a 4h) com marcas nos valores comuns
- Feedback dinamico: recalcula cards/dia e % de cobertura em tempo real
- Se cobertura < 100%: alerta amarelo com sugestoes (focar em menos baralhos ou estender prazo)
- Botao "Confirmar meu plano"

**Dashboard (pos-onboarding)**
- Header com indicador de saude (circulo colorido + texto)
- Card principal: metricas diarias e semanais
- Se tem data final: barra de progresso ate a meta
- Se backlog detectado: banner "Modo Resgate" com opcao de diluir
- Botao "Editar plano" no topo
- Opcao "Excluir plano" no rodape
