

# Correcoes e Melhorias no Plano de Estudos

## 1. Bug do Filtro de Visualizacao (7d/30d/90d/1 ano)

**Causa raiz**: O hook `useForecastView` salva a preferencia no banco mas nao atualiza o cache local do React Query. Como o `staleTime` esta configurado como `Infinity`, a query nunca refaz o fetch, entao a UI fica presa no filtro anterior.

**Correcao**: Atualizar o cache local imediatamente ao mudar o filtro, usando `queryClient.setQueryData`, alem de salvar no banco.

**Arquivo**: `src/hooks/useForecastSimulator.ts`

---

## 2. Remover Secao "Baralhos por Objetivo"

A secao entre as linhas 1142-1163 do `StudyPlan.tsx` e redundante -- os objetivos ja expandem para mostrar os baralhos com drag-and-drop. Sera removida completamente.

**Arquivo**: `src/pages/StudyPlan.tsx`

---

## 3. Melhorar o Botao "Limpar Atraso"

### Problema Atual
O dialog mostra opcoes de diluicao (3, 5 ou 7 dias) mas nenhuma delas faz nada -- apenas fecha o dialog.

### Nova Implementacao: Sistema de Catch-Up Inteligente

Quando o usuario tem revisoes atrasadas, o sistema oferece duas estrategias:

**Opcao A -- Diluir em X dias**:
- Distribui as revisoes pendentes ao longo de 3, 5 ou 7 dias
- Aumenta temporariamente o `daily_review_limit` dos decks envolvidos para acomodar o extra
- Mostra o impacto: "Voce precisara de +Xmin/dia durante Y dias"

**Opcao B -- Resetar cards atrasados**:
- Cards com atraso severo (scheduled_date > 30 dias atras) podem ter seu estado resetado para "novo"
- Isso e util quando a pessoa parou de estudar por muito tempo e os cards estao praticamente esquecidos
- Mostra quantos cards serao afetados antes de confirmar

**Implementacao tecnica**:

Para a Opcao A (diluir), a acao sera:
- Calcular `extra_per_day = ceil(totalReview / diasEscolhidos)`
- Temporariamente aumentar a capacidade diaria do usuario (salvar no perfil um campo `catch_up_extra_minutes` com data de expiracao)
- Alternativa mais simples: apenas mostrar a recomendacao e navegar para a sessao de estudo

Para a Opcao B (resetar atrasados graves):
- Executar um UPDATE nos cards com `state = 2` e `scheduled_date < now() - interval 'X days'`, setando `state = 0, stability = 0, difficulty = 0`
- Isso e uma acao destrutiva e requer confirmacao dupla

**Decisao de implementacao**: Comecar com a abordagem simples -- o botao de diluicao navega direto para a sessao de estudo com um toast explicando a meta diaria. O reset de cards atrasados sera uma opcao adicional no dialog.

---

## Secao Tecnica -- Arquivos Modificados

### `src/hooks/useForecastSimulator.ts`
- Adicionar `useQueryClient` ao `useForecastView`
- No `setView`, chamar `queryClient.setQueryData(['forecast-view', userId], view)` para atualizar o cache imediatamente

### `src/pages/StudyPlan.tsx`
- Remover linhas 1142-1163 (secao "Baralhos por Objetivo")
- Atualizar `CatchUpDialog` para ter acoes reais:
  - Botao "Diluir em X dias": mostra toast com meta diaria e navega para estudo
  - Botao "Resetar cards esquecidos" (> 30 dias atrasados): executa UPDATE via Supabase
- Adicionar estado e logica para contar cards com atraso grave

