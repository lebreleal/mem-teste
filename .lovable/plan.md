

## Análise Completa: Sistema Explorar e Salas

---

### 1. COMO FUNCIONA HOJE

#### Criação de uma Sala (Dono)
- O usuário cria uma **pasta (folder)** no Dashboard. Essa pasta é a "Sala".
- Dentro dela, cria decks e adiciona cartões normalmente.
- Para publicar no Explorar, usa o menu "3 pontos" → "Publicar no Explorar". Isso:
  - Cria (ou atualiza) um registro na tabela `turmas` vinculado ao `owner_id`.
  - Sincroniza os decks da pasta para `turma_decks` com `is_published = true`.
  - Marca os decks como `is_public = true`.
- O dono estuda normalmente seus próprios decks — as estatísticas (state, difficulty, stability) vivem na tabela `cards` nos registros dele.

#### Seguidor Entra na Sala (Explorar)
- No Explorar, o usuário vê salas públicas (tabela `turmas` com `is_private = false`).
- Ao clicar "Entrar", o sistema:
  - Insere um registro em `turma_members` (user_id + turma_id).
  - Cria uma **pasta local (folder)** com `source_turma_id` apontando para a turma.
- Essa pasta aparece no Dashboard do seguidor como uma "Sala seguida".

#### Visualização dos Decks da Sala Seguida (Dashboard)
- Quando o seguidor entra na sala no Dashboard, o sistema busca os **decks originais do dono** via `turma_decks` → `decks`.
- Os decks são renderizados em modo **readOnly** (sem opções de editar, mover, excluir).
- As contagens de cards (novo, fácil, bom, difícil, errei) são calculadas a partir dos **cards originais do dono**.

#### Estudo
- O botão "ESTUDAR" navega para `/study/folder/{folderId}`.
- O `studyService.fetchStudyQueue` busca decks onde `user_id = userId` e `folder_id` pertence à hierarquia da pasta.
- Como a pasta do seguidor NÃO contém decks próprios (apenas referencia os do dono), **a fila de estudo retorna vazia**.

#### Estatísticas no Detalhe do Deck
- `DeckDetailContext` detecta `isCommunityDeck` (deck pertence a outro user).
- Para community decks, força `state = 0` em todos os cards → gauge mostra 0%.
- Tem lógica de auto-sync que copia cards para decks locais se estiverem vazios.

---

### 2. INCONSISTÊNCIAS E BUGS IDENTIFICADOS

#### BUG CRÍTICO 1: Estatísticas da Sala Seguida Mostram Dados do Dono
**Localização**: `Dashboard.tsx` linhas 148-182

O gauge circular e as contagens na sala seguida buscam os **cards originais do dono** via query direta:
```
supabase.from('cards').select('deck_id, state, difficulty').in('deck_id', batch)
```
Como os cards pertencem ao dono, `state` e `difficulty` refletem o progresso do dono (ex: 14% mastered), não do seguidor (que deveria ser 0%).

**Impacto**: O seguidor vê o progresso de estudo do dono como se fosse seu.

#### BUG CRÍTICO 2: Botões Estudar/Estatísticas/Ajustes Não Funcionam
**Localização**: `Dashboard.tsx` linhas 757-881

Para salas seguidas, o botão ESTUDAR navega para `/study/folder/{folderId}`. O `studyService` busca decks com `user_id = userId` na pasta. Como a pasta do seguidor **não tem decks próprios** (apenas exibe os do dono via `communityTurmaInfo`), a fila de estudo retorna vazia.

O botão de Ajustes (`StudySettingsSheet`) provavelmente abre, mas não encontra decks para configurar.

**Impacto**: Seguidor não consegue estudar nem configurar a sala.

#### BUG CRÍTICO 3: Conflito entre Duas Abordagens de Sincronização
Existem **duas lógicas conflitantes**:

1. **Dashboard**: Exibe decks do dono diretamente (readOnly), sem criar cópias locais.
2. **DeckDetailContext**: Quando o seguidor clica num deck, tenta auto-sync (copiar cards do dono para um deck local).

Mas o seguidor **não tem decks locais** na pasta seguida! O auto-sync no `DeckDetailContext` cria cards em decks que não existem na pasta do seguidor. Resultado: dados inconsistentes entre Dashboard e detalhe do deck.

#### BUG 4: `salaDifficultyStats` Usa Cards do Dono
**Localização**: `Dashboard.tsx` linhas 429-463

A query `sala-difficulty-stats` busca cards com `in('deck_id', salaDeckIds)` onde `salaDeckIds` vem de `state.currentDecks`. Para salas seguidas, `currentDecks` está vazio (nenhum deck do seguidor nessa pasta), então a query retorna zeros. Mas quando retorna dados, são do dono.

#### BUG 5: Ao Sair da Sala, Não Limpa os Cards Copiados
**Localização**: `Dashboard.tsx` linhas 194-215

O `handleLeaveSala` deleta `turma_members` e a pasta, mas se o auto-sync do `DeckDetailContext` criou cópias de cards em decks locais, esses decks/cards ficam órfãos no banco.

#### INCONSISTÊNCIA 6: Modelo Híbrido Não Definido
O sistema oscila entre dois modelos:
- **Modelo A (Referência)**: Seguidor vê decks do dono sem cópia. Estudo acontece nos cards originais.
- **Modelo B (Cópia Local)**: Seguidor tem cópias próprias dos decks/cards com progresso independente.

Atualmente, o Dashboard usa Modelo A (exibe originais) mas o DeckDetail tenta Modelo B (copia cards). Isso gera todas as inconsistências acima.

#### INCONSISTÊNCIA 7: `salaStudyStats` Calcula Stats com `allDecks` do Seguidor
**Localização**: `Dashboard.tsx` linhas 466-545

O `salaStudyStats` itera sobre `state.currentDecks` usando `allDecks` (decks do seguidor). Para salas seguidas, `currentDecks` é vazio porque o seguidor não tem decks na pasta. Logo, `salaStudyStats` retorna tudo zero. Mas o gauge separado (`communityTurmaInfo`) mostra dados do dono.

---

### 3. COMO DEVERIA FUNCIONAR (Modelo Correto)

O modelo correto é o **Modelo B (Cópia Local)** com as seguintes regras:

1. **Ao seguir uma sala**: O sistema cria a pasta local E **cria cópias locais dos decks** (com `source_turma_deck_id` apontando pro original) E copia os cards com `state = 0`.
2. **Estatísticas**: Sempre calculadas a partir dos cards/decks **locais do seguidor**. Progresso 100% independente.
3. **Gauge/Gráficos**: Refletem os cards locais do seguidor, não do dono.
4. **Estudo**: Funciona nos decks locais do seguidor — a fila de estudo encontra os decks na pasta.
5. **Atualizações do dono**: Novos cards adicionados pelo dono são sincronizados (adicionados como `state = 0`) nos decks locais dos seguidores.
6. **Edição**: Seguidor NÃO pode editar os cards (readOnly).
7. **Ao sair**: Remove pasta, decks locais, cards locais. Stats no `review_logs` ficam 30 dias.

---

### 4. O QUE PRECISA SER CORRIGIDO

1. **Bootstrap de decks locais**: Quando o seguidor entra na sala, criar decks locais (mirror) com `source_turma_deck_id` na pasta do seguidor, e copiar todos os cards com `state = 0`.
2. **Dashboard**: Usar os decks locais do seguidor (não os do dono) para renderizar a lista, calcular stats e alimentar o gauge.
3. **Estudo**: Como os decks locais pertencem ao seguidor (`user_id = auth.uid()`), o `studyService` já vai funcionar.
4. **Remover lógica duplicada**: Eliminar o bloco `isCommunityFolder && communityTurmaInfo` no Dashboard e usar o mesmo `DeckList` para todos os casos.
5. **Sync de atualizações**: Implementar sincronização incremental (novos cards do dono → copiar para seguidores).
6. **Cleanup ao sair**: Deletar decks locais e cards ao sair da sala.

Essa é uma refatoração significativa que requer mudanças no Dashboard, no fluxo de follow, e potencialmente uma migration/RPC para o bootstrap.

