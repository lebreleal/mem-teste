

# Diagnóstico: Sistema Atual vs ALEKS — O que Falta Corrigir

## O que JÁ foi implementado (e funciona)
A implementação anterior cobriu a base do modelo ALEKS:
- `parent_concept_id` na tabela `global_concepts`
- Cascade automático no erro (rating=1 → reschedula ancestrais fracos)
- Fronteira "Prontos para aprender" na página de Conceitos
- IA retornando `prerequisites` no `generate-questions`
- Error Notebook com diagnóstico hierárquico de conceitos

## Lacunas reais vs ALEKS

### 1. Sem Avaliação Diagnóstica Inicial (Knowledge Check)
**ALEKS**: Começa com um assessment de 20-30 questões adaptativas para mapear TODO o estado do conhecimento antes de qualquer estudo.
**Sistema atual**: O aluno começa do zero e só descobre lacunas quando erra — é reativo, não proativo.

**Correção**: Criar um fluxo de "Diagnóstico Inicial" acessível pela página de Conceitos. O sistema seleciona conceitos de diferentes profundidades da árvore, apresenta questões, e marca os conceitos como dominados/fracos com base nas respostas. Isso preenche o grafo de uma vez só em vez de esperar erros acumularem.

### 2. Fronteira de Aprendizagem Incompleta
**ALEKS**: Mostra APENAS conceitos cuja fronteira está aberta (pré-requisitos dominados). O aluno NÃO pode estudar fora da fronteira.
**Sistema atual**: A seção "Prontos para aprender" existe mas é informativa — o aluno pode estudar qualquer conceito em qualquer ordem. A fronteira não é enforced.

**Correção**: Na página de Conceitos, reorganizar a aba "Meus" para priorizar visualmente a fronteira. Conceitos fora da fronteira (com prereqs não-dominados) ficam bloqueados/cinzas com tooltip "Domine {prereq} primeiro". O estudo de conceitos é guiado pela fronteira.

### 3. Grafo de Pré-requisitos Quase Vazio
**ALEKS**: Tem um Knowledge Graph denso com centenas de relações pré-definidas.
**Sistema atual**: `parent_concept_id` só é preenchido quando a IA gera questões e retorna `prerequisites`. Para conceitos existentes sem questões geradas, o grafo é vazio — a fronteira retorna tudo como "pronto".

**Correção**: 
- Ao importar conceitos oficiais, incluir `parent_concept_id` pré-mapeado
- Criar um botão "Auto-mapear pré-requisitos" que usa IA para analisar os conceitos existentes do usuário e sugerir relações parent→child em batch
- No `ensureGlobalConcepts`, quando um conceito é criado sem parent, enfileirar um job para a IA sugerir o parent

### 4. Sem "Pie Chart" de Progresso Global
**ALEKS**: Mostra um gráfico de pizza com % de domínio por área, atualizado em tempo real.
**Sistema atual**: Tem contadores (novo/aprendendo/dominado) mas sem a visualização por categoria/subcategoria que é marca registrada do ALEKS.

**Correção**: Adicionar um gráfico de rosca (donut chart) na aba "Meus" agrupando conceitos por `category`, mostrando % dominados vs total por área médica.

---

## Plano de Implementação (priorizado)

### Tarefa 1: Gráfico de Progresso por Categoria (Donut Chart)
- Na aba "Meus" de `Concepts.tsx`, acima da lista, inserir um donut chart (Recharts) com breakdown por `category`
- Cada fatia = uma grande área médica, colorida por % de domínio
- Clicar na fatia filtra a lista por aquela categoria

### Tarefa 2: Fronteira Enforced (conceitos bloqueados)
- Modificar a lista de conceitos em `Concepts.tsx`: conceitos cujo `parent_concept_id` aponta para um conceito com `state !== 2` ficam visualmente bloqueados (opacity reduzida, ícone de cadeado, tooltip)
- O botão "Estudar" fica disabled para conceitos bloqueados
- A seção "Prontos para aprender" ganha destaque como ponto de entrada principal

### Tarefa 3: Auto-mapeamento de Pré-requisitos via IA
- Novo botão na página de Conceitos: "Mapear pré-requisitos com IA"
- Envia todos os nomes de conceitos do usuário para uma edge function que retorna pares `{ concept, prerequisite }`
- Atualiza `parent_concept_id` em batch
- Nova edge function `map-prerequisites`

### Tarefa 4: Avaliação Diagnóstica Inicial
- Novo fluxo acessível de Conceitos: "Fazer Diagnóstico"
- Seleciona ~20 conceitos distribuídos por profundidade no grafo
- Para cada conceito, busca uma questão vinculada
- Se acerta → marca conceito e descendentes como dominados (state=2, stability=10)
- Se erra → marca como fraco e busca conceitos mais básicos para testar
- Algoritmo adaptativo: começa do meio da árvore e bifurca para cima/baixo

### Arquivos afetados
| Arquivo | Mudança |
|---|---|
| `src/pages/Concepts.tsx` | Donut chart, fronteira enforced, botão diagnóstico |
| `src/services/globalConceptService.ts` | Funções para batch prerequisite mapping, diagnóstico |
| `supabase/functions/map-prerequisites/index.ts` | Nova edge function para IA mapear pré-requisitos |
| `supabase/functions/generate-questions/index.ts` | Sem mudanças (já retorna prerequisites) |

