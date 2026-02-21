
# Plano: Modo Teste para Decks Bloqueados + Estrela de Avaliacao na Comunidade

## 1. Modo Teste para Decks de Assinantes

### Problema Atual
Quando um membro nao-assinante vê um deck bloqueado (icone de cadeado), nao ha como interagir com ele. O botao esta desabilitado.

### Solucao
Ao clicar no icone do deck bloqueado (Lock), abre um modal informativo explicando que o deck e exclusivo para assinantes, com duas opcoes:
- **"Experimentar" (Modo Teste)**: carrega os cards do deck em uma sessao temporaria de estudo. Nenhum dado e salvo (sem importar deck, sem salvar review_logs, sem alterar cards).
- **"Assinar"**: redireciona para o modal de assinatura existente.

O modo teste reutiliza os cards ja carregados pelo RLS (turma members can view shared deck cards) e monta uma fila local de estudo sem persistencia.

### Detalhes Tecnicos

**Novo componente `TrialStudyModal`:**
- Um Dialog/Drawer fullscreen que recebe `deckId` e `deckName`
- Carrega cards via query (`cards` table, filtrado por `deck_id`)
- Exibe o FlashCard existente em modo somente-leitura
- Botoes de rating (Errei, Dificil, Bom, Facil) apenas avancam para o proximo card na fila local, sem chamar `submitReview`
- Header simples com titulo + badge "Modo Teste" + botao Voltar
- Ao terminar todos os cards ou sair, fecha o modal

**Alteracoes em `ContentTab.tsx`:**
- Quando o deck e `subscriberOnly && !canImport`, ao clicar no icone Lock, abre um novo modal intermediario ("SubscriberGateDialog") em vez de nao fazer nada
- Esse modal mostra: titulo do deck, contagem de cards, explicacao de que e exclusivo, e dois botoes: "Experimentar" e "Assinar"
- "Experimentar" abre o `TrialStudyModal`
- "Assinar" abre o modal de assinatura existente (setShowSubscribeModal do SubHeader, ou dispara handleSubscribe)

**Nao necessita mudancas no banco de dados** — os cards ja sao visiveis via RLS para membros da turma.

---

## 2. Estrela de Avaliacao no Header da Comunidade

### Problema Atual
A avaliacao da comunidade so e acessivel pelas configuracoes. Nao ha indicador visual rapido.

### Solucao
Adicionar uma pequena estrela ao lado do titulo da comunidade no `TurmaSubHeader`:
- **Estrela apagada (outline)**: usuario ainda nao avaliou
- **Estrela preenchida (filled, cor amarela/dourada)**: usuario ja avaliou
- Nao mostra a nota numerica, apenas o icone

Ao clicar na estrela, abre um modal compacto com:
- Seletor de 1-5 estrelas para o usuario avaliar/reavliar
- Campo de comentario opcional (textarea)
- Botao "Salvar"
- Abaixo, lista das avaliacoes de outros membros (nome, nota, comentario)

### Detalhes Tecnicos

**Alteracoes em `TurmaSubHeader.tsx`:**
- Importar `useMyTurmaRating` do hook existente
- Adicionar icone `Star` do lucide-react ao lado do titulo (antes dos botoes de acao)
- Estrela com tamanho `h-4 w-4`, cor `text-amber-400` se ja avaliou (com fill), `text-muted-foreground/40` se nao
- Ao clicar, abre novo estado `showRating` com Dialog

**Novo Dialog de Rating (inline no `TurmaSubHeader`):**
- Header: "Avaliar Comunidade"
- 5 estrelas clicaveis para selecionar nota
- Textarea para comentario
- Botao "Salvar" usando `submitRating` do hook existente
- Secao "Avaliacoes" abaixo: nova query para buscar todas as avaliacoes (`turma_ratings` com join em `profiles` via `get_public_profiles`)

**Nova funcao no `turmaService.ts`:**
- `fetchAllTurmaRatings(turmaId)`: busca todas as avaliacoes com nomes dos usuarios

**Nova query no `useTurmaRating.ts`:**
- `useAllTurmaRatings(turmaId)`: query habilitada apenas quando o modal esta aberto

**Nao necessita mudancas no banco de dados** — a tabela `turma_ratings` ja existe com colunas `rating`, `comment`, `user_id`, `turma_id`. RLS ja permite membros visualizarem ratings.

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---|---|
| `src/components/turma-detail/TrialStudyModal.tsx` | Criar - sessao de estudo temporaria |
| `src/components/turma-detail/SubscriberGateDialog.tsx` | Criar - modal informativo do deck bloqueado |
| `src/components/turma-detail/ContentTab.tsx` | Modificar - integrar gate dialog para decks bloqueados |
| `src/components/turma-detail/TurmaSubHeader.tsx` | Modificar - adicionar estrela + modal de avaliacao |
| `src/hooks/useTurmaRating.ts` | Modificar - adicionar query para todas as avaliacoes |
| `src/services/turmaService.ts` | Modificar - adicionar fetchAllTurmaRatings |
