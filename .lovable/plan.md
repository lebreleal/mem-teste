

# Conceitos como Biblioteca + Unificação Tags/Conceitos

## Minha Analise

### Voce esta certo em 3 pontos

1. **Manter /conceitos como hub de visualizacao/edicao** faz sentido. O conceito tem cards vinculados, questoes vinculadas, historico de dominio. Precisa de um lugar para gerenciar isso. Remover completamente foi agressivo demais.

2. **Tags e Conceitos devem compartilhar o mesmo mecanismo.** Hoje sao sistemas separados (`tags` table vs `global_concepts` table). Mas conceitualmente, um conceito E uma tag especializada. A memoria de arquitetura ja documenta isso: "Conceitos sao estruturados como uma especializacao do sistema de Tags (is_concept = true)". Porem o codigo atual **nao implementa isso** — usa tabelas separadas.

3. **Conceitos como biblioteca (meus + oficiais + comunidade)** segue o mesmo padrao que ja fazemos com Decks e o Banco de Questoes. Faz sentido.

### O que eu recomendo diferente

**Nao unificar tags e conceitos no banco agora.** A tabela `tags` tem `slug`, `parent_id`, `synonyms`, `merged_into_id`, `is_official` — toda a infraestrutura de taxonomia comunitaria. A tabela `global_concepts` tem FSRS fields (`stability`, `difficulty`, `scheduled_date`). Misturar tudo numa tabela so gera complexidade desnecessaria neste momento. 

**Em vez disso:** manter as duas tabelas mas criar um vinculo: `global_concepts.concept_tag_id -> tags.id`. Quando um conceito e criado, ele pode (opcionalmente) referenciar uma tag oficial. Isso permite:
- Tags continuam sendo o sistema de taxonomia comunitaria
- Conceitos continuam sendo a unidade de estudo FSRS pessoal
- Um conceito pode "herdar" o nome/slug de uma tag oficial

---

## Plano de Implementacao

### 1. Restaurar /conceitos no BottomNav
- Adicionar de volta como 3o item: Home | Conceitos | Desempenho
- Icone `BrainCircuit`

### 2. Conceitos Page: 3 abas (Meus | Oficiais | Comunidade)
- **Meus**: lista atual de `global_concepts` do usuario (com edicao, exclusao, FSRS status)
- **Oficiais**: conceitos de tags com `is_official = true AND is_concept = true` (read-only, botao "Adicionar aos meus")
- **Comunidade**: conceitos criados por outros usuarios em turmas publicas (via `question_concepts` de `turma_decks`)
- Ao "baixar" um conceito oficial/comunidade: cria `global_concept` pessoal + copia cards e questoes vinculadas para um deck do usuario

### 3. Adicionar `concept_tag_id` a `global_concepts`
- Migration: `ALTER TABLE global_concepts ADD COLUMN concept_tag_id uuid REFERENCES tags(id) ON DELETE SET NULL`
- Isso vincula conceitos pessoais a tags oficiais sem misturar tabelas
- Permite: ao criar conceito a partir de tag oficial, manter a referencia

### 4. Adicionar `is_concept` a `tags` (se nao existir)
- Migration: `ALTER TABLE tags ADD COLUMN is_concept boolean NOT NULL DEFAULT false`
- Tags marcadas como conceito aparecem na aba "Oficiais" da pagina de conceitos
- Admins podem marcar tags existentes como conceitos

### 5. Fluxo "Baixar conceito"
- Usuario ve conceito oficial/comunidade → clica "Adicionar"
- Sistema cria `global_concept` com `concept_tag_id` apontando para a tag
- Busca questoes vinculadas a esse conceito (via `question_concepts`) em decks publicos
- Copia questoes + cards para um deck pessoal do usuario
- Resultado: usuario tem o conceito com material de estudo pronto

### 6. Conceitos no Caderno de Erros (ja implementado)
- Quando erra questao → ve conceitos vinculados → clica "Revisar" → cards do conceito entram na fila
- Isso ja funciona com a implementacao atual

---

## Arquivos a criar/editar

| Arquivo | Acao |
|---|---|
| `src/components/BottomNav.tsx` | Restaurar item Conceitos |
| `src/pages/Concepts.tsx` | Adicionar abas Meus/Oficiais/Comunidade |
| `src/services/globalConceptService.ts` | Adicionar fetchOfficialConcepts, fetchCommunityConcepts, importConcept |
| Migration SQL | Adicionar `concept_tag_id` em global_concepts, `is_concept` em tags |

