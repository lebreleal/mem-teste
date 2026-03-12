

# Diagnóstico: Sistema Atual vs ALEKS — Plano de Correção

## Diferenças Fundamentais

O ALEKS é baseado na **Teoria dos Espaços de Conhecimento (Knowledge Space Theory)**, onde conceitos têm **pré-requisitos explícitos** entre si. O seu sistema atual usa a **hierarquia de baralhos** como proxy para a hierarquia de conhecimento — isso é o erro fundamental.

```text
ALEKS (correto):                    Sistema Atual (incorreto):
                                    
Conceito A ──prerequisito──→ C      Deck Pai
     │                                 ├── Sub-deck 1 (conceitos X,Y)
     └──prerequisito──→ D              └── Sub-deck 2 (conceitos Z,W)
                                    
Conceitos têm GRAFO próprio         Conceitos herdam hierarquia do DECK
```

### Problemas concretos identificados:

1. **Sem grafo de pré-requisitos entre conceitos** — `global_concepts` é flat, sem `parent_concept_id`
2. **Error Notebook usa `parent_deck_id` para encontrar lacunas** — deveria usar pré-requisitos conceituais
3. **Sem "fronteira de aprendizagem"** — ALEKS só mostra conceitos cujos pré-requisitos já foram dominados; o sistema mostra tudo
4. **Sem avaliação diagnóstica inicial** — ALEKS faz um assessment para mapear o estado do conhecimento
5. **Cascade usa deck hierarchy em vez de concept hierarchy** — `buildHierarchyDiagnostic` busca ancestors/siblings de decks, não de conceitos

---

## Plano de Implementação

### 1. Criar grafo de pré-requisitos entre conceitos

Adicionar coluna `parent_concept_id` na tabela `global_concepts` (ou criar tabela `concept_prerequisites` para relações N:N).

Abordagem recomendada: coluna `parent_concept_id uuid REFERENCES global_concepts(id)` — mais simples, cobre 90% dos casos (árvore, não grafo genérico).

Quando a IA gera questões com conceitos, ela também deve sugerir o pré-requisito (ex: "Tratamento de IC" tem pré-requisito "Fisiologia Cardíaca").

### 2. Refatorar `conceptHierarchyService.ts` — usar grafo de conceitos

`buildHierarchyDiagnostic` deixa de navegar `decks.parent_deck_id` e passa a navegar `global_concepts.parent_concept_id`:
- Dado o conceito do erro, buscar ancestors conceituais (não de deck)
- Classificar cada ancestor como weak/learning/strong via FSRS
- Mostrar lacunas fundacionais reais

### 3. Fronteira de aprendizagem (Ready-to-Learn)

Na página de Conceitos, adicionar um filtro/seção "Prontos para aprender":
- Conceitos em state 0 cujos pré-requisitos (parent_concept_id) já estão em state 2 (dominado)
- Isso replica o comportamento central do ALEKS

### 4. Cascade automático no erro

Quando um conceito recebe rating "Errei" (1) durante estudo:
- Buscar `parent_concept_id` recursivamente
- Se algum ancestor está em state 0/3 ou stability < 5, agendar automaticamente para revisão (colocar `scheduled_date = now`)
- Isso é a "correção em cascata" real, baseada em conceitos, não em decks

### 5. Auto-linking de pré-requisitos via IA

Ao gerar questões (`generate-questions`), incluir no prompt instrução para retornar pré-requisitos. Ex:
```json
{ "concepts": ["Tratamento de IC"], "prerequisites": ["Fisiologia Cardíaca", "Farmacologia de Diuréticos"] }
```
O serviço então cria os global_concepts com `parent_concept_id` correto.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| **Supabase migration** | `ALTER TABLE global_concepts ADD parent_concept_id uuid REFERENCES global_concepts(id)` |
| `src/services/conceptHierarchyService.ts` | Reescrever para navegar grafo de conceitos em vez de decks |
| `src/services/globalConceptService.ts` | Adicionar `ensureGlobalConcepts` com suporte a parent; nova função `getConceptAncestors` |
| `src/pages/ErrorNotebook.tsx` | Usar novo diagnostic baseado em conceitos |
| `src/pages/Concepts.tsx` | Adicionar seção "Prontos para aprender" (fronteira ALEKS) |
| `src/hooks/useGlobalConcepts.ts` | Cascade automático no `submitConceptReview` quando rating=1 |
| `supabase/functions/generate-questions/index.ts` | Prompt para retornar pré-requisitos |

