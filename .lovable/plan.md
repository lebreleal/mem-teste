## Plano: Sistema de Vinculo Inteligente para Provas + Sincronizacao com Deteccao de Alteracoes

### Resumo

Atualmente, ao clicar no olho de uma prova na comunidade, o sistema importa silenciosamente e navega direto. O usuario perde controle. Vamos alinhar o comportamento com o dos baralhos (deck) e adicionar deteccao de alteracoes do dono.

---

### 1. Exams: Mesmo padrao de vinculo dos Decks

**Problema atual**: `handleOpenExam` importa e navega automaticamente. O usuario nao tem opcao de "Adicionar a minha colecao" vs "Abrir".

**Solucao**: Trocar o botao de olho (Eye) por dois botoes, identico ao que decks fazem:

- **Copy** (adicionar a colecao) -- se ainda nao importou
- **Download/Sync** (atualizar) -- se ja tem vinculado
- Ao clicar em Copy, importa para pasta vinculada com icone Link2, sem navegar
- Ao clicar em Sync, abre dialog de confirmacao identico ao `confirmResync` dos decks

**Arquivo**: `src/components/turma-detail/ContentTab.tsx` (secao exams, linhas 537-603)
**Arquivo**: `src/components/turma-detail/content/useContentImport.ts` (refatorar `handleOpenExam`)

### 2. Deteccao de Alteracoes (Sync Inteligente)

**Nova coluna no banco**: Adicionar `content_hash` (text) nas tabelas `turma_exams` e `turma_decks` (ou usar `updated_at` que ja existe).

**Logica**: Comparar `turma_exams.updated_at` com a data de importacao do exam local. Se o dono editou depois, mostrar badge "Atualizado" no item vinculado.

**Implementacao**:

- Adicionar coluna `synced_at` (timestamptz) na tabela `exams` -- data da ultima sincronizacao
- Adicionar coluna `synced_at` (timestamptz) na tabela `decks` -- mesma logica
- Na comunidade: comparar `turma_exam.updated_at > exam_local.synced_at` para mostrar badge
- No dashboard (ExamSetup / Dashboard): mostrar badge "Atualizacao disponivel" em pastas vinculadas

**Migracao SQL**:

```sql
ALTER TABLE exams ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();
ALTER TABLE decks ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();
```

### 3. Tela de Revisao de Alteracoes

Quando o usuario clica em "Sincronizar", em vez de aplicar tudo cegamente, mostrar um Dialog com:

- Lista de questoes adicionadas (novas)
- Lista de questoes removidas (existem no local mas nao no original)
- Lista de questoes modificadas (texto diferente)
- Checkboxes para o usuario escolher quais alteracoes aplicar
- Botao "Aplicar selecionadas" e "Aplicar todas"

**Cards pessoais extras NAO sao afetados**: Se o usuario adicionou cards/questoes proprias ao deck/exam local, essas nao aparecem na comparacao (pois nao existem no original).  
  
isso ira acontece pra aquivos de prova e para decks

**Arquivo novo**: `src/components/SyncReviewDialog.tsx`

### 4. Fluxo Completo

```text
COMUNIDADE:
  Prova X [Copy] [Sync se ja importou]
    |
    v (Copy)
  Cria exam_folder "NomeComunidade" (se nao existe)
  Cria exam com source_turma_exam_id + synced_at = now()
  Toast: "Prova adicionada na pasta NomeComunidade"
    |
    v (Sync -- quando dono editou)
  Abre SyncReviewDialog
    - Questoes novas: Q5, Q6
    - Questoes removidas: Q2
    - Questoes editadas: Q3 (texto mudou)
  Usuario escolhe o que aplicar
  Atualiza synced_at = now()

DASHBOARD (ExamSetup):
  Pasta "NomeComunidade" [Link2 icon]
    - Prova X [Link2 icon] [badge "Atualizacao disponivel" se desatualizado]
```

### 5. Protecao ao Deletar

Ja implementado para decks. Replicar para exams:

- Ao deletar exam com `source_turma_exam_id`, mostrar aviso: "Esta prova esta vinculada a uma comunidade. O vinculo sera perdido."

**Arquivo**: `src/pages/ExamSetup.tsx` (secao de delete)

---

### Detalhes Tecnicos

#### Migracao de banco

```sql
ALTER TABLE exams ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();
ALTER TABLE decks ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();
```

#### Arquivos a criar

- `src/components/SyncReviewDialog.tsx` -- Dialog generico de revisao de alteracoes

#### Arquivos a modificar

- `src/components/turma-detail/ContentTab.tsx` -- botoes Copy/Sync para exams
- `src/components/turma-detail/content/useContentImport.ts` -- refatorar handleOpenExam para addExamToCollection + syncExam
- `src/pages/ExamSetup.tsx` -- badge de atualizacao + aviso ao deletar vinculado
- `src/services/examService.ts` -- funcao de sync (comparar questoes)
- `src/types/exam.ts` -- adicionar synced_at

#### Logica de comparacao de questoes

```text
Para cada questao do original (turma_exam_questions):
  - Se nao existe no local (por question_text match) -> "Nova"
  - Se existe mas texto/opcoes diferem -> "Modificada"
Para cada questao local que NAO existe no original:
  - Se tem card_id ou foi criada pelo usuario -> ignorar (e pessoal)
  - Se veio da importacao original -> "Removida pelo dono"
```

#### Ordem de implementacao

1. Migracao SQL (synced_at)
2. Refatorar useContentImport (separar addExamToCollection de handleOpenExam)
3. Atualizar ContentTab (botoes Copy/Sync para exams)
4. Criar SyncReviewDialog
5. Atualizar ExamSetup (badge + aviso delete)
6. Testar end-to-end