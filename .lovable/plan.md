

## Plano de Refatoracao: Sistema de Vinculo, Coroa e Provas

### Problemas Identificados

1. **Coroa nao aparece no header da comunidade**: O componente `TurmaSubHeader` so mostra a coroa quando `hasSubscription` e `true` (ou seja, `subscription_price > 0`). Se a comunidade tem preco 0 mas tem conteudo marcado como "so assinantes", a coroa nao aparece. Alem disso, membros comuns nao veem indicacao de que existe conteudo exclusivo.

2. **Vinculo de deck quebra ao deletar card**: Quando o usuario deleta o deck vinculado no "Inicio", o campo `source_turma_deck_id` se perde, quebrando o link com a pasta/comunidade.

3. **Provas nao tem sistema de vinculo**: Ao importar uma prova da comunidade, ela vai para um deck generico sem pasta vinculada, diferente do comportamento dos decks.

4. **ContentTab.tsx e um monolito de 1184 linhas**: Mistura logica de negocio com UI, dificultando manutencao.

---

### Solucao Proposta

#### 1. Coroa sempre visivel no header (para comunidades com conteudo exclusivo)

**Logica atual** (TurmaSubHeader.tsx, linhas 56-65):
- Coroa so aparece se `hasSubscription` (preco > 0)

**Nova logica**:
- Mostrar coroa se `hasSubscription` e `true` OU se existir qualquer conteudo marcado como `subscribers_only` / `price_type !== 'free'`
- Passar nova prop `hasExclusiveContent` para o SubHeader
- Calcular no Context: verificar se algum deck, arquivo ou prova tem restricao de assinante

#### 2. Proteger vinculo ao deletar deck no Dashboard

**Problema**: Deletar o deck local (com `source_turma_deck_id`) remove o deck mas a pasta pai fica orfao.

**Solucao**:
- Ao deletar um deck que tem `source_turma_deck_id`, mostrar aviso: "Este baralho esta vinculado a uma comunidade. Ao excluir, o vinculo sera perdido."
- No `DeckRow.tsx`, verificar `deck.source_turma_deck_id` antes de deletar e mostrar confirmacao
- Alternativa: ao re-importar, verificar se a pasta (folder) da comunidade ja existe e reutiliza-la, mesmo sem deck vinculado dentro

#### 3. Sistema de vinculo para provas (exams)

**Implementacao**:
- Ao importar prova da comunidade (`handleOpenExam`), criar ou reutilizar pasta de exams vinculada a comunidade (similar ao que decks fazem com `folders`)
- Usar campo `source_turma_exam_id` (ja existe na tabela `exams`) para rastrear o vinculo
- Criar pasta de exam (`exam_folders`) com nome da comunidade, similar ao que `addToCollection` faz para decks
- Mostrar icone `Link2` ao lado do titulo da prova no Dashboard quando `source_turma_exam_id` existir

#### 4. Refatorar ContentTab em modulos menores

Extrair em componentes dedicados:
- `ContentHeader.tsx` -- breadcrumb + botoes de acao
- `ContentFolderRow.tsx` -- render de cada pasta/subject  
- `ContentFileRow.tsx` -- render de cada arquivo
- `ContentDeckRow.tsx` -- render de cada deck da comunidade
- `ContentExamRow.tsx` -- render de cada prova
- `useContentMutations.ts` -- todas as mutations (upload, delete, move, reorder)
- `useContentImport.ts` -- logica de importacao (addToCollection, downloadDeck, handleImportExam)

---

### Detalhes Tecnicos

#### Alteracoes no banco de dados
- Nenhuma migracao necessaria: `source_turma_exam_id` ja existe em `exams`, `folder_id` ja existe em `exams`

#### Arquivos a criar
- `src/components/turma-detail/content/ContentHeader.tsx`
- `src/components/turma-detail/content/ContentFolderRow.tsx`
- `src/components/turma-detail/content/ContentFileRow.tsx`
- `src/components/turma-detail/content/ContentDeckRow.tsx`
- `src/components/turma-detail/content/ContentExamRow.tsx`
- `src/components/turma-detail/content/useContentMutations.ts`
- `src/components/turma-detail/content/useContentImport.ts`

#### Arquivos a modificar
- `src/components/turma-detail/ContentTab.tsx` -- reduzir para orquestrador fino (~200 linhas)
- `src/components/turma-detail/TurmaSubHeader.tsx` -- adicionar prop `hasExclusiveContent`
- `src/components/turma-detail/TurmaDetailContext.tsx` -- calcular `hasExclusiveContent`
- `src/components/dashboard/DeckRow.tsx` -- aviso ao deletar deck vinculado
- `src/pages/ExamSetup.tsx` ou pagina de provas -- icone Link2 para provas importadas

#### Logica de importacao de provas (novo fluxo)
```text
1. Usuario clica em "abrir prova" na comunidade
2. Sistema verifica se ja existe exam com source_turma_exam_id
3. Se existe -> navega direto
4. Se nao existe:
   a. Busca/cria exam_folder com nome da comunidade
   b. Cria exam com folder_id = pasta da comunidade
   c. Copia questoes
   d. Navega para a prova
```

#### Logica da coroa no header
```text
hasExclusiveContent = 
  turmaDecks.some(d => d.price_type !== 'free') ||
  turmaExams.some(e => e.subscribers_only) ||
  lessonFiles.some(f => f.price_type !== 'free')
  
showCrown = hasSubscription || hasExclusiveContent
```

### Ordem de implementacao

1. Refatorar ContentTab em modulos (base para tudo)
2. Corrigir logica da coroa no header
3. Implementar vinculo de provas ao importar
4. Adicionar aviso ao deletar deck vinculado
5. Testar fluxo completo end-to-end

