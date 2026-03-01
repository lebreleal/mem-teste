

# Melhorias Estrategicas do Sistema de Tags - Plano de Implementacao

## Visao Geral

5 melhorias estrategicas que expandem o sistema de tags existente: hierarquia pai/filho, perfil de estudo, busca semantica, feedback da comunidade e visualizacao de tags relacionadas.

---

## 1. Hierarquia de Tags (Parent_ID)

O campo `parent_id` ja existe na tabela `tags` mas nao e utilizado. Vamos ativa-lo.

**Alteracoes:**

### Backend
- **AdminTags.tsx**: Adicionar campo "Tag Pai" no painel admin (select dropdown) para definir hierarquias. Ao editar/criar tag, permitir selecionar um parent.
- **tagService.ts**: Nova funcao `getTagTree()` que retorna tags organizadas hierarquicamente. Nova funcao `getTagChildren(parentId)`.
- **useTags.ts**: Novo hook `useTagTree()` e `useTagChildren()`.

### Frontend
- **TagInput.tsx**: No dropdown de autocomplete, exibir tags com indentacao visual mostrando a hierarquia (ex: "Medicina > Cardiologia > Hipertensao"). Ao digitar, buscar em todos os niveis.
- **ContentTab.tsx** e **Turmas.tsx**: Ao selecionar uma tag pai no filtro, incluir automaticamente decks/cards que tenham qualquer tag filha.

### IA
- **suggest-tags edge function**: Atualizar o prompt para que a IA sugira tags respeitando hierarquias existentes (enviar a arvore de tags no contexto).

---

## 2. Contextualizacao por Perfil de Estudo

Permitir que usuarios definam seu "perfil de estudo" para filtragem automatica de conteudo.

**Alteracoes:**

### Database
- Nova migration: adicionar coluna `study_context` (text, nullable, default null) na tabela `profiles`. Valores possiveis: `ciclo_basico`, `ciclo_clinico`, `internato`, `residencia`, `concurso`, etc.

### Frontend
- **Profile.tsx**: Adicionar secao "Perfil de Estudo" com um select de contextos predefinidos. O usuario escolhe seu perfil uma vez.
- **Turmas.tsx** e **ContentTab.tsx**: Quando o usuario tem um `study_context` definido, priorizar automaticamente tags relacionadas ao contexto no filtro (ex: se perfil = "residencia", tags como "ENARE", "Prova pratica" aparecem primeiro).
- **useAuth.tsx** ou novo hook `useStudyContext()`: Carregar o `study_context` do perfil e disponibilizar globalmente.

### Logica de priorizacao
- Criar um mapeamento `CONTEXT_TAG_BOOST` que associa cada perfil a tags relevantes. Nao e filtragem exclusiva -- apenas reordena as tags e resultados colocando os mais relevantes primeiro.

---

## 3. Busca Semantica Aprimorada

Quando o usuario pesquisar um termo, a busca mapeia sinonimos para Leader Tags.

**Alteracoes:**

### Database
- Nova migration: adicionar coluna `synonyms` (text[], default '{}') na tabela `tags`. Ex: a tag "Hipertensao Arterial" teria synonyms = ["pressao alta", "HAS", "hipertensao"].

### Admin
- **AdminTags.tsx**: Adicionar campo editavel de sinonimos para cada tag (input com chips, similar ao TagInput).

### Busca
- **tagService.ts**: Atualizar `searchTags()` para tambem buscar no array `synonyms` usando `@>` ou funcao SQL customizada. Quando usuario digitar "pressao alta", retornar "Hipertensao Arterial".
- **ContentTab.tsx** e **Turmas.tsx**: A busca textual existente passara a resolver sinonimos antes de filtrar.

---

## 4. Feedback da Comunidade sobre Tags

Usuarios podem reportar tags problematicas diretamente do frontend.

**Alteracoes:**

### Database
- Nova migration: tabela `tag_reports` com colunas: `id`, `tag_id`, `user_id`, `reason` (enum: 'duplicada', 'irrelevante', 'ofensiva', 'sugestao_fusao'), `suggested_merge_target` (text, nullable), `status` (pending/resolved), `created_at`.
- RLS: usuarios inserem seus proprios reports, admins veem todos.

### Frontend
- **TagInput.tsx**: Adicionar um icone de "..." ou flag em cada badge de tag exibida, abrindo um mini-menu com "Reportar tag" (dialog simples com motivo).
- **AdminTags.tsx**: Nova secao "Reports" mostrando tag reports pendentes com acoes rapidas (resolver, mesclar, ignorar).

### Service
- **tagService.ts**: Novas funcoes `reportTag()` e `getTagReports()`.
- **useTags.ts**: Novos hooks `useTagReport()` e `useTagReports()`.

---

## 5. Visualizacao de Tags Relacionadas

Mostrar tags co-ocorrentes para melhorar a descoberta.

**Alteracoes:**

### Backend
- **tagService.ts**: Nova funcao `getRelatedTags(tagId)` que consulta `deck_tags` e `card_tags` para encontrar tags que frequentemente aparecem juntas com a tag selecionada (co-ocorrencia).
- Query SQL: buscar deck_ids que possuem a tag X, depois contar quais outras tags aparecem nesses mesmos decks, ordenar por frequencia.

### Frontend
- **Turmas.tsx** e **ContentTab.tsx**: Quando usuario seleciona uma tag no filtro, exibir abaixo uma linha "Tags relacionadas:" com chips clicaveis das tags mais co-ocorrentes (top 5).
- Componente simples `RelatedTags` que recebe um `tagId` e mostra as tags relacionadas.

---

## Sequencia de Implementacao

1. **Hierarquia de Tags** -- usa infraestrutura existente (`parent_id`), menor risco
2. **Sinonimos / Busca Semantica** -- migration simples + melhoria na busca
3. **Perfil de Estudo** -- migration em `profiles` + UI no perfil + priorizacao
4. **Feedback da Comunidade** -- nova tabela + UI de report + admin
5. **Tags Relacionadas** -- query de co-ocorrencia + UI de chips

## Detalhes Tecnicos

- Todas as migrations usam a ferramenta de migration do Supabase
- Novas colunas sao nullable ou com defaults para nao quebrar dados existentes
- RLS segue o padrao ja estabelecido (autenticados leem, donos gerenciam, admins administram)
- Nenhuma dependencia nova e necessaria -- tudo usa React Query, Supabase client e componentes UI existentes
- A busca semantica por sinonimos usa operadores nativos do Postgres (array contains ou ILIKE nos elementos)

